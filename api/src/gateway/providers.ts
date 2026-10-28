import { Injectable } from '@nestjs/common';
import { ModelSpec } from '../pricing';

export type ProviderRequest = {
  model: string;
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature?: number;
};
export type Completion = { text: string; inputTokens: number; outputTokens: number };
export type Chunk = { text?: string; inputTokens?: number; outputTokens?: number };

export interface LlmProvider {
  complete(req: ProviderRequest, signal?: AbortSignal): Promise<Completion>;
  stream(req: ProviderRequest, signal?: AbortSignal): AsyncGenerator<Chunk>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic offline provider: lets the whole stack run and be tested without an API key. */
export class MockProvider implements LlmProvider {
  private reply(req: ProviderRequest) {
    const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    return `Mock reply to: "${last.slice(0, 80)}"`;
  }
  private tokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));
  private inputTokens(req: ProviderRequest) {
    return this.tokens((req.system ?? '') + req.messages.map((m) => m.content).join(' '));
  }

  async complete(req: ProviderRequest): Promise<Completion> {
    const text = this.reply(req);
    return { text, inputTokens: this.inputTokens(req), outputTokens: this.tokens(text) };
  }

  async *stream(req: ProviderRequest, signal?: AbortSignal): AsyncGenerator<Chunk> {
    const text = this.reply(req);
    yield { inputTokens: this.inputTokens(req) };
    for (const word of text.split(/(?<=\s)/)) {
      if (signal?.aborted) throw new Error('aborted');
      await sleep(15);
      yield { text: word };
    }
    yield { outputTokens: this.tokens(text) };
  }
}

/** Anthropic Messages API over plain fetch (no SDK dependency). */
export class AnthropicProvider implements LlmProvider {
  private readonly url = 'https://api.anthropic.com/v1/messages';

  private body(req: ProviderRequest, stream: boolean) {
    return JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: req.messages,
      ...(req.system ? { system: req.system } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(stream ? { stream: true } : {}),
    });
  }

  private headers() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the gateway');
    return { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  }

  private async fail(res: Response): Promise<never> {
    throw new Error(`Upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  async complete(req: ProviderRequest, signal?: AbortSignal): Promise<Completion> {
    const res = await fetch(this.url, { method: 'POST', headers: this.headers(), body: this.body(req, false), signal });
    if (!res.ok) await this.fail(res);
    const d: any = await res.json();
    return {
      text: (d.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''),
      inputTokens: d.usage?.input_tokens ?? 0,
      outputTokens: d.usage?.output_tokens ?? 0,
    };
  }

  async *stream(req: ProviderRequest, signal?: AbortSignal): AsyncGenerator<Chunk> {
    const res = await fetch(this.url, { method: 'POST', headers: this.headers(), body: this.body(req, true), signal });
    if (!res.ok || !res.body) await this.fail(res);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const raw of events) {
        const line = raw.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const ev: any = JSON.parse(line.slice(6));
        if (ev.type === 'message_start') yield { inputTokens: ev.message?.usage?.input_tokens ?? 0 };
        else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield { text: ev.delta.text };
        else if (ev.type === 'message_delta') yield { outputTokens: ev.usage?.output_tokens ?? 0 };
        else if (ev.type === 'error') throw new Error(`Upstream error: ${ev.error?.message ?? 'unknown'}`);
      }
    }
  }
}

@Injectable()
export class ProviderRegistry {
  private readonly providers: Record<ModelSpec['provider'], LlmProvider> = {
    anthropic: new AnthropicProvider(),
    mock: new MockProvider(),
  };
  for(spec: ModelSpec): LlmProvider {
    return this.providers[spec.provider];
  }
}
