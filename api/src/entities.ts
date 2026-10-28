import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

const numeric = {
  to: (v?: number | null) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : parseFloat(v)),
};

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) name: string;
  /** First characters of the secret, safe to display. */
  @Column({ type: 'varchar' }) prefix: string;
  /** SHA-256 of the secret. The secret itself is never stored. */
  @Index({ unique: true }) @Column({ type: 'varchar' }) hash: string;
  @Column({ type: 'int', default: 60 }) rpmLimit: number;
  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: numeric })
  monthlyBudgetUsd: number | null;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('usage_logs')
@Index(['keyId', 'createdAt'])
export class UsageLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'key_id', type: 'uuid' }) keyId: string;
  @Column({ type: 'varchar' }) model: string;
  @Column({ type: 'varchar' }) provider: string;
  @Column({ name: 'input_tokens', type: 'int', default: 0 }) inputTokens: number;
  @Column({ name: 'output_tokens', type: 'int', default: 0 }) outputTokens: number;
  @Column({ name: 'cost_usd', type: 'numeric', precision: 12, scale: 6, default: 0, transformer: numeric })
  costUsd: number;
  @Column({ name: 'latency_ms', type: 'int' }) latencyMs: number;
  @Column({ type: 'boolean', default: false }) cached: boolean;
  @Column({ type: 'int' }) status: number;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
