import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis.module';

/** Fixed-window limiter: one Redis counter per key per minute. Cheap and good enough;
 *  a sliding window or token bucket smooths bursts at window edges if you need it. */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(keyId: string, limit: number, now = Date.now()) {
    const bucket = Math.floor(now / 60_000);
    const key = `rl:${keyId}:${bucket}`;
    const res = await this.redis.multi().incr(key).expire(key, 70).exec();
    const count = Number(res?.[0]?.[1] ?? 1);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter: Math.max(1, Math.ceil(((bucket + 1) * 60_000 - now) / 1000)),
    };
  }
}
