'use client';
import { useState } from 'react';
import { login, setToken } from '@/lib/api';

export default function LoginForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('admin@gatewaykit.dev');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      setToken((await login(email, password)).accessToken);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  const input = 'w-full rounded-lg bg-slate-800 px-3 py-2 outline-none focus:ring-2 ring-emerald-500';
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-slate-900 p-6 shadow-xl">
        <div>
          <h1 className="text-2xl font-semibold">GatewayKit</h1>
          <p className="text-sm text-slate-400">Keys, limits, budgets and cost for your LLM traffic.</p>
        </div>
        <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-lg bg-emerald-600 py-2 font-medium hover:bg-emerald-500">Sign in</button>
      </form>
    </main>
  );
}
