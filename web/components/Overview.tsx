'use client';
import { Stats, compact, money, pct } from '@/lib/api';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-900 p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function DailyChart({ daily }: { daily: Stats['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.requests));
  const w = 100 / daily.length;
  return (
    <div className="rounded-xl bg-slate-900 p-4">
      <p className="mb-3 text-xs uppercase text-slate-500">Requests per day</p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full">
        {daily.map((d, i) => {
          const h = (d.requests / max) * 36;
          return (
            <rect key={d.day} x={i * w + w * 0.15} y={38 - h} width={w * 0.7} height={Math.max(h, 0.4)}
              rx="0.6" className="fill-emerald-500/80 hover:fill-emerald-400">
              <title>{`${d.day}: ${d.requests} requests, ${money(d.costUsd)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{daily[0]?.day}</span>
        <span>{daily[daily.length - 1]?.day}</span>
      </div>
    </div>
  );
}

export default function Overview({ stats, days, setDays }: { stats: Stats | null; days: number; setDays: (n: number) => void }) {
  if (!stats) return <p className="text-slate-500">Loading…</p>;
  const s = stats.summary;
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 7, 30].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={`rounded-full px-3 py-1 text-sm ${days === d ? 'bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'}`}>
            {d === 1 ? '24h' : `${d} days`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card label="Requests" value={compact(s.requests)} />
        <Card label="Spend" value={money(s.costUsd)} sub={`${compact(s.inputTokens)} in · ${compact(s.outputTokens)} out tokens`} />
        <Card label="Cache hit rate" value={pct(s.cacheHitRate)} />
        <Card label="Error rate" value={pct(s.errorRate)} />
        <Card label="Latency p50" value={s.p50Ms === null ? '–' : `${s.p50Ms} ms`} sub="uncached, successful" />
        <Card label="Latency p95" value={s.p95Ms === null ? '–' : `${s.p95Ms} ms`} sub="uncached, successful" />
      </div>
      <DailyChart daily={stats.daily} />
      <div className="overflow-hidden rounded-xl bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="p-3">Model</th><th>Requests</th><th>Tokens (in / out)</th><th className="pr-3 text-right">Spend</th></tr>
          </thead>
          <tbody>
            {stats.byModel.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={4}>No traffic yet.</td></tr>}
            {stats.byModel.map((m) => (
              <tr key={m.model} className="border-t border-slate-800">
                <td className="p-3 font-mono">{m.model}</td>
                <td>{m.requests}</td>
                <td>{compact(m.inputTokens)} / {compact(m.outputTokens)}</td>
                <td className="pr-3 text-right">{money(m.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
