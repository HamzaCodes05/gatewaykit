'use client';
import { useCallback, useEffect, useState } from 'react';
import KeysPanel from '@/components/KeysPanel';
import LoginForm from '@/components/LoginForm';
import Overview from '@/components/Overview';
import RequestsTable from '@/components/RequestsTable';
import {
  ApiKey, RequestRow, Stats, UnauthorizedError, clearToken, getRequests, getStats, getToken, listKeys,
} from '@/lib/api';

const TABS = ['Overview', 'API keys', 'Requests'] as const;

export default function Home() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [rows, setRows] = useState<RequestRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [s, k, r] = await Promise.all([getStats(days), listKeys(), getRequests()]);
      setStats(s);
      setKeys(k);
      setRows(r);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearToken();
        setAuthed(false);
      }
    }
  }, [days]);

  useEffect(() => {
    setAuthed(!!getToken());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [authed, refresh]);

  if (!ready) return null;
  if (!authed) return <LoginForm onDone={() => setAuthed(true)} />;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">GatewayKit</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-slate-800' : 'text-slate-400 hover:text-slate-200'}`}>
              {t}
            </button>
          ))}
        </nav>
        <button onClick={() => { clearToken(); setAuthed(false); }} className="text-sm text-slate-400 hover:text-slate-200">
          Sign out
        </button>
      </header>
      {tab === 'Overview' && <Overview stats={stats} days={days} setDays={setDays} />}
      {tab === 'API keys' && <KeysPanel keys={keys} refresh={refresh} />}
      {tab === 'Requests' && <RequestsTable rows={rows} />}
    </div>
  );
}
