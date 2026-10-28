/**
 * Model catalogue and prices (USD per 1M tokens).
 * NOTE: prices here are illustrative defaults. Verify them against your provider's
 * current price list before relying on the cost numbers.
 */
export type ModelSpec = { provider: 'anthropic' | 'mock'; inPerM: number; outPerM: number };

export const MODELS: Record<string, ModelSpec> = {
  'claude-sonnet-5-5': { provider: 'anthropic', inPerM: 3, outPerM: 15 },
  'claude-haiku-5-5': { provider: 'anthropic', inPerM: 1, outPerM: 5 },
  'mock-1': { provider: 'mock', inPerM: 1, outPerM: 2 },
};

export function costUsd(spec: ModelSpec, inputTokens: number, outputTokens: number): number {
  const cost = (inputTokens * spec.inPerM + outputTokens * spec.outPerM) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}
