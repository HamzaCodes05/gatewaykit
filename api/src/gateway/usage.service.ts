import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageLog } from '../entities';

@Injectable()
export class UsageService {
  private readonly log = new Logger(UsageService.name);
  constructor(@InjectRepository(UsageLog) private readonly repo: Repository<UsageLog>) {}

  /** Metering must never break a request that already succeeded upstream. */
  async record(entry: Partial<UsageLog>) {
    try {
      await this.repo.insert(entry);
    } catch (err) {
      this.log.error(`Failed to record usage: ${err instanceof Error ? err.message : err}`);
    }
  }

  async monthSpend(keyId: string): Promise<number> {
    const rows = await this.repo.query(
      `SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM usage_logs
       WHERE key_id = $1 AND created_at >= date_trunc('month', now())`,
      [keyId],
    );
    return parseFloat(rows[0].spent);
  }
}
