'use client';
import { RequestRow, money } from '@/lib/api';

export default function RequestsTable({ rows }: { rows: RequestRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-slate-900">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr><th className="p-3">Time</th><th>Key</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Latency</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={7}>No requests yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-800" title={r.error ?? undefined}>
              <td className="p-3 text-slate-400">{new Date(r.createdAt).toLocaleTimeString()}</td>
              <td>{r.keyName}</td>
              <td className="font-mono">{r.model}</td>
              <td>{r.inputTokens} / {r.outputTokens}</td>
              <td>{r.cached ? <span className="text-emerald-400">cached · $0</span> : money(r.costUsd)}</td>
              <td>{r.latencyMs} ms</td>
              <td className={r.status >= 400 ? 'text-red-400' : 'text-slate-300'}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
