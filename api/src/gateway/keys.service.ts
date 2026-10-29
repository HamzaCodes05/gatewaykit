import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { ApiKey } from '../entities';
import { CreateKeyDto } from './gateway.dto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class KeysService {
  constructor(@InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>) {}

  /** Returns the secret exactly once; only its hash is stored. */
  async create(dto: CreateKeyDto) {
    const secret = `gk_${randomBytes(24).toString('base64url')}`;
    const key = await this.repo.save(
      this.repo.create({
        name: dto.name,
        prefix: secret.slice(0, 10),
        hash: sha256(secret),
        rpmLimit: dto.rpmLimit ?? 60,
        monthlyBudgetUsd: dto.monthlyBudgetUsd ?? null,
      }),
    );
    return { ...this.view(key, 0), secret };
  }

  async list() {
    const [keys, spend] = await Promise.all([
      this.repo.find({ order: { createdAt: 'DESC' } }),
      this.repo.query(
        `SELECT key_id, SUM(cost_usd) AS spent FROM usage_logs
         WHERE created_at >= date_trunc('month', now()) GROUP BY key_id`,
      ),
    ]);
    const byKey = new Map<string, number>(spend.map((r: any) => [r.key_id, parseFloat(r.spent)]));
    return keys.map((k) => this.view(k, byKey.get(k.id) ?? 0));
  }

  async revoke(id: string) {
    const key = await this.repo.findOneBy({ id });
    if (!key) throw new NotFoundException('Key not found');
    key.revokedAt ??= new Date();
    await this.repo.save(key);
    return this.view(key, 0);
  }

  async authenticate(secret: string): Promise<ApiKey | null> {
    if (!secret.startsWith('gk_')) return null;
    const key = await this.repo.findOneBy({ hash: sha256(secret) });
    if (!key || key.revokedAt) return null;
    void this.repo.update({ id: key.id }, { lastUsedAt: new Date() }).catch(() => undefined);
    return key;
  }

  private view(k: ApiKey, monthSpendUsd: number) {
    return {
      id: k.id, name: k.name, prefix: k.prefix, rpmLimit: k.rpmLimit,
      monthlyBudgetUsd: k.monthlyBudgetUsd, revokedAt: k.revokedAt,
      createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, monthSpendUsd,
    };
  }
}
