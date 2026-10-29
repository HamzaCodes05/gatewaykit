import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiKey } from '../entities';
import { costUsd, MODELS, ModelSpec } from '../pricing';
import { CacheService } from './cache.service';
import { ChatDto } from './gateway.dto';
import { ProviderRegistry, ProviderRequest } from './providers';
import { UsageService } from './usage.service';

export type StreamEvent = { event: 'delta' | 'done'; data: unknown };

@Injectable()
export class GatewayService {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly cache: CacheService,
    private readonly usage: UsageService,
  ) {}

  models() {
    return Object.entries(MODELS).map(([id, m]) => ({
      id, provider: m.provider, input_per_million_usd: m.inPerM, output_per_million_usd: m.outPerM,
    }));
  }

  spec(model: string): ModelSpec {
    const spec = MODELS[model];
    if (!spec) throw new BadRequestException(`Unknown model "${model}". Available: ${Object.keys(MODELS).join(', ')}`);
    return spec;
  }

  private toRequest(dto: ChatDto): ProviderRequest {
    return {
      model: dto.model, system: dto.system, messages: dto.messages,
      maxTokens: dto.max_tokens ?? 1024, temperature: dto.temperature,
    };
  }

  async complete(key: ApiKey, dto: ChatDto) {
    const spec = this.spec(dto.model);
    const req = this.toRequest(dto);
    const started = Date.now();
    const id = `chat_${randomUUID()}`;

    // Only deterministic requests are cacheable.
    const cacheKey = dto.temperature === 0 ? this.cache.key(key.id, dto, req.maxTokens) : null;
    if (cacheKey) {
      const hit = await this.cache.get(cacheKey);
      if (hit) {
        const latency = Date.now() - started;
        await this.usage.record({
          keyId: key.id, model: dto.model, provider: spec.provider,
          inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: latency, cached: true, status: 200,
        });
        return {
          id, model: dto.model, content: hit.text, cached: true, latency_ms: latency,
          usage: { input_tokens: hit.inputTokens, output_tokens: hit.outputTokens, cost_usd: 0 },
        };
      }
    }

    try {
      const out = await this.providers.for(spec).complete(req);
      const cost = costUsd(spec, out.inputTokens, out.outputTokens);
      const latency = Date.now() - started;
      await this.usage.record({
        keyId: key.id, model: dto.model, provider: spec.provider, inputTokens: out.inputTokens,
        outputTokens: out.outputTokens, costUsd: cost, latencyMs: latency, cached: false, status: 200,
      });
      if (cacheKey) await this.cache.set(cacheKey, out);
      return {
        id, model: dto.model, content: out.text, cached: false, latency_ms: latency,
        usage: { input_tokens: out.inputTokens, output_tokens: out.outputTokens, cost_usd: cost },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.usage.record({
        keyId: key.id, model: dto.model, provider: spec.provider, latencyMs: Date.now() - started,
        cached: false, status: 502, error: message.slice(0, 500),
      });
      throw new BadGatewayException(message);
    }
  }

  /** Streams deltas, then always records usage (including aborted or failed streams). */
  async *stream(key: ApiKey, dto: ChatDto, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const spec = this.spec(dto.model);
    const started = Date.now();
    let input = 0;
    let output = 0;
    let failure: unknown = null;

    try {
      for await (const chunk of this.providers.for(spec).stream(this.toRequest(dto), signal)) {
        if (chunk.inputTokens !== undefined) input = chunk.inputTokens;
        if (chunk.outputTokens !== undefined) output = chunk.outputTokens;
        if (chunk.text) yield { event: 'delta', data: { text: chunk.text } };
      }
    } catch (err) {
      failure = err;
    }

    const aborted = signal.aborted;
    const message = failure instanceof Error ? failure.message : failure ? String(failure) : null;
    const cost = costUsd(spec, input, output);
    const latency = Date.now() - started;
    await this.usage.record({
      keyId: key.id, model: dto.model, provider: spec.provider, inputTokens: input, outputTokens: output,
      costUsd: cost, latencyMs: latency, cached: false,
      status: failure ? (aborted ? 499 : 502) : 200, error: message ? message.slice(0, 500) : null,
    });

    if (failure) {
      if (aborted) return;
      throw new BadGatewayException(message ?? 'Upstream error');
    }
    yield {
      event: 'done',
      data: { id: `chat_${randomUUID()}`, latency_ms: latency, usage: { input_tokens: input, output_tokens: output, cost_usd: cost } },
    };
  }
}
