import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from '../auth/auth.module';
import { CreateKeyDto } from './gateway.dto';
import { KeysService } from './keys.service';

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

@Controller('admin')
@UseGuards(JwtGuard)
export class AdminController {
  constructor(
    private readonly keys: KeysService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  @Get('keys') listKeys() { return this.keys.list(); }
  @Post('keys') createKey(@Body() dto: CreateKeyDto) { return this.keys.create(dto); }
  @Delete('keys/:id') revokeKey(@Param('id', ParseUUIDPipe) id: string) { return this.keys.revoke(id); }

  @Get('stats')
  async stats(@Query('days') daysParam?: string) {
    const days = Math.min(90, Math.max(1, parseInt(daysParam ?? '7', 10) || 7));
    const since = new Date(Date.now() - days * 86_400_000);

    const [summary] = await this.db.query(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(cost_usd), 0) AS cost,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(AVG(CASE WHEN cached THEN 1 ELSE 0 END), 0) AS cache_rate,
              COALESCE(AVG(CASE WHEN status >= 400 THEN 1 ELSE 0 END), 0) AS error_rate,
              percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE NOT cached AND status = 200) AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE NOT cached AND status = 200) AS p95
       FROM usage_logs WHERE created_at >= $1`,
      [since],
    );

    const dailyRows = await this.db.query(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS cost
       FROM usage_logs WHERE created_at >= $1 GROUP BY day`,
      [since],
    );
    const byDay = new Map<string, any>(dailyRows.map((r: any) => [r.day, r]));
    const daily = Array.from({ length: days }, (_, i) => {
      const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const row = byDay.get(day);
      return { day, requests: num(row?.requests), costUsd: num(row?.cost) };
    });

    const modelRows = await this.db.query(
      `SELECT model, COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS cost,
              COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens
       FROM usage_logs WHERE created_at >= $1 GROUP BY model ORDER BY cost DESC, requests DESC`,
      [since],
    );

    return {
      days,
      summary: {
        requests: num(summary.requests), costUsd: num(summary.cost),
        inputTokens: num(summary.input_tokens), outputTokens: num(summary.output_tokens),
        cacheHitRate: num(summary.cache_rate), errorRate: num(summary.error_rate),
        p50Ms: summary.p50 === null ? null : Math.round(num(summary.p50)),
        p95Ms: summary.p95 === null ? null : Math.round(num(summary.p95)),
      },
      daily,
      byModel: modelRows.map((r: any) => ({
        model: r.model, requests: num(r.requests), costUsd: num(r.cost),
        inputTokens: num(r.input_tokens), outputTokens: num(r.output_tokens),
      })),
    };
  }

  @Get('requests')
  async requests(@Query('limit') limitParam?: string) {
    const limit = Math.min(200, Math.max(1, parseInt(limitParam ?? '50', 10) || 50));
    const rows = await this.db.query(
      `SELECT u.id, k.name AS key_name, u.model, u.input_tokens, u.output_tokens, u.cost_usd,
              u.latency_ms, u.cached, u.status, u.error, u.created_at
       FROM usage_logs u JOIN api_keys k ON k.id = u.key_id
       ORDER BY u.id DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r: any) => ({
      id: r.id, keyName: r.key_name, model: r.model, inputTokens: r.input_tokens,
      outputTokens: r.output_tokens, costUsd: num(r.cost_usd), latencyMs: r.latency_ms,
      cached: r.cached, status: r.status, error: r.error, createdAt: r.created_at,
    }));
  }
}
