'use client';
import { useState } from 'react';
import { API_URL, ApiKey, createKey, money, revokeKey } from '@/lib/api';

export default function KeysPanel({ keys, refresh }: { keys: ApiKey[]; refresh: () => void }) {
  const [name, setName] = useState('');
  const [rpm, setRpm] = useState('60');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const k = await createKey({
        name,
        rpmLimit: Number(rpm) || 60,
        ...(budget ? { monthlyBudgetUsd: Number(budget) } : {}),
      });
      setSecret(k.secret);
      setCopied(false);
      setName('');
      setBudget('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  const input = 'rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 ring-emerald-500';
  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-900 p-4">
        <label className="text-xs text-slate-400">Name
          <input className={`${input} mt-1 block w-52`} required value={name} onChange={(e) => setName(e.target.value)} placeholder="production-app" />
        </label>
        <label className="text-xs text-slate-400">Requests / min
          <input className={`${input} mt-1 block w-28`} type="number" min={1} value={rpm} onChange={(e) => setRpm(e.target.value)} />
        </label>
        <label className="text-xs text-slate-400">Monthly budget (USD, optional)
          <input className={`${input} mt-1 block w-48`} type="number" step="0.01" min={0.0001} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">Create key</button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      {secret && (
        <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium text-emerald-300">Copy your key now. It will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-slate-950 p-2 text-sm">{secret}</code>
            <button onClick={() => { navigator.clipboard.writeText(secret); setCopied(true); }}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{`curl ${API_URL}/v1/chat \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"mock-1","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
          <button onClick={() => setSecret(null)} className="text-xs text-slate-400 hover:text-slate-200">Dismiss</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="p-3">Name</th><th>Key</th><th>Limit</th><th>This month</th><th>Last used</th><th /></tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td className="p-3 text-slate-500" colSpan={6}>No keys yet.</td></tr>}
            {keys.map((k) => {
              const ratio = k.monthlyBudgetUsd ? Math.min(1, k.monthSpendUsd / k.monthlyBudgetUsd) : 0;
              return (
                <tr key={k.id} className={`border-t border-slate-800 ${k.revokedAt ? 'opacity-50' : ''}`}>
                  <td className="p-3">{k.name}{k.revokedAt && <span className="ml-2 text-xs text-red-400">revoked</span>}</td>
                  <td className="font-mono text-slate-400">{k.prefix}…</td>
                  <td>{k.rpmLimit}/min</td>
                  <td className="w-56 pr-4">
                    <p>{money(k.monthSpendUsd)}{k.monthlyBudgetUsd !== null && ` / ${money(k.monthlyBudgetUsd)}`}</p>
                    {k.monthlyBudgetUsd !== null && (
                      <div className="mt-1 h-1.5 rounded bg-slate-800">
                        <div className={`h-full rounded ${ratio >= 1 ? 'bg-red-500' : ratio > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${ratio * 100}%` }} />
                      </div>
                    )}
                  </td>
                  <td className="text-slate-400">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'never'}</td>
                  <td className="pr-3 text-right">
                    {!k.revokedAt && (
                      <button onClick={() => confirm(`Revoke "${k.name}"? Clients using it will stop working.`) && revokeKey(k.id).then(refresh)}
                        className="text-xs text-slate-400 hover:text-red-400">Revoke</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
