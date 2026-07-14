'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminLoginPage() {
  const router = useRouter(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); setBusy(false); if (!response.ok) { setError('Invalid credentials'); return; } router.push('/admin/announcements'); }
  return <main className="mx-auto mt-20 max-w-sm rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900"><h1 className="text-xl font-semibold">Admin login</h1><form className="mt-6 space-y-4" onSubmit={submit}><Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><Input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />{error && <p className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</Button></form></main>;
}
