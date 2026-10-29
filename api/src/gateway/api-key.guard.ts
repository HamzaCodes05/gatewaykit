import { CanActivate, ExecutionContext, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { KeysService } from './keys.service';
import { RateLimitService } from './rate-limit.service';
import { UsageService } from './usage.service';

/** Authenticates the API key, then enforces rate limit and monthly budget. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: KeysService,
    private readonly limiter: RateLimitService,
    private readonly usage: UsageService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const http = ctx.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const [type, secret] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !secret) throw new UnauthorizedException('Missing API key');
    const key = await this.keys.authenticate(secret);
    if (!key) throw new UnauthorizedException('Invalid or revoked API key');

    const rl = await this.limiter.hit(key.id, key.rpmLimit);
    res.setHeader('X-RateLimit-Limit', String(key.rpmLimit));
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter));
      throw new HttpException('Rate limit exceeded', 429);
    }

    // Soft cap: the request that crosses the line completes; the next one is refused.
    if (key.monthlyBudgetUsd !== null && (await this.usage.monthSpend(key.id)) >= key.monthlyBudgetUsd) {
      throw new HttpException('Monthly budget exceeded', 402);
    }

    req.apiKey = key;
    return true;
  }
}
