import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../redis.module';
import { ChatDto } from './gateway.dto';

export type CachedCompletion = { text: string; inputTokens: number; outputTokens: number };

/** Exact-match response cache for deterministic (temperature 0) requests.
 *  Scoped per API key so one tenant can never read another tenant's cached answers. */
@Injectable()
export class CacheService {
  private readonly ttlSeconds = Number(process.env.CACHE_TTL_SECONDS ?? 3600);
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  key(keyId: string, dto: ChatDto, maxTokens: number): string {
    const payload = JSON.stringify([dto.model, dto.system ?? '', dto.messages, maxTokens]);
    return `cache:${keyId}:${createHash('sha256').update(payload).digest('hex')}`;
  }

  async get(key: string): Promise<CachedCompletion | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as CachedCompletion) : null;
    } catch {
      return null; // cache failure = cache miss
    }
  }

  async set(key: string, value: CachedCompletion): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch {
      /* ignore */
    }
  }
}
