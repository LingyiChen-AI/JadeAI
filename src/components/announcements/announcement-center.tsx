'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { useFingerprint } from '@/hooks/use-fingerprint';

type Announcement = { id: string; title: string; content: string; notifyMode: string; createdAt: string | number; readAt?: string | null };

export function AnnouncementCenter() {
  const { fingerprint, isLoading } = useFingerprint();
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [popup, setPopup] = useState<Announcement | null>(null);
  const shown = useRef(new Set<string>());
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const headers = useMemo<Record<string, string>>((): Record<string, string> => fingerprint ? { 'x-fingerprint': fingerprint } : {}, [fingerprint]);

  useEffect(() => {
    if (isLoading) return;
    fetch('/api/announcements', { headers }).then((r) => r.ok ? r.json() : []).then((next: Announcement[]) => {
      setItems(next);
      const candidate = next.find((item) => item.notifyMode === 'popup' && !item.readAt && !shown.current.has(item.id));
      if (candidate) { setPopup(candidate); shown.current.add(candidate.id); }
    }).catch(() => undefined);
  }, [headers, isLoading]);

  const unread = items.filter((item) => !item.readAt).length;
  async function markRead(item: Announcement) {
    await fetch(`/api/announcements/${item.id}/read`, { method: 'POST', headers });
    setItems((old) => old.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
  }

  const overlay = (open || selected || popup) && mounted && typeof document !== 'undefined' ? <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onClick={() => { setOpen(false); setSelected(null); setPopup(null); }}>
    <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900" onClick={(event) => event.stopPropagation()}>
      {(selected || popup) ? <>
        <div className="flex items-start justify-between gap-4"><h2 className="text-xl font-semibold">{(selected || popup)!.title}</h2><Button variant="ghost" size="icon-sm" onClick={() => { setSelected(null); setPopup(null); }}><X className="h-4 w-4" /></Button></div>
        <div className="prose prose-sm mt-5 max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{(selected || popup)!.content}</ReactMarkdown></div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => { setSelected(null); setPopup(null); }}>Close</Button>{!(selected || popup)!.readAt && <Button onClick={async () => { await markRead((selected || popup)!); setSelected(null); setPopup(null); }}><Check className="mr-1 h-4 w-4" />Mark read</Button>}</div>
      </> : <>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Announcements</h2><Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button></div>
        <div className="mt-5 space-y-2">{items.length === 0 ? <p className="text-sm text-zinc-500">No announcements</p> : items.map((item) => <button key={item.id} className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800" onClick={() => setSelected(item)}><span className="font-medium">{item.title}</span>{!item.readAt && <span className="text-xs text-brand">Unread</span>}</button>)}</div>
        {unread > 0 && <Button className="mt-5" variant="outline" onClick={async () => { await Promise.all(items.filter((item) => !item.readAt).map(markRead)); }}>Mark all read</Button>}
      </>}
    </div>
  </div> : null;

  return <>
    <Button variant="ghost" size="icon-sm" className="relative cursor-pointer text-zinc-500" title="Announcements" onClick={() => setOpen(true)}>
      <Bell className="h-4 w-4" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
    </Button>
    {overlay && createPortal(overlay, document.body)}
    {popup && <div className="sr-only" aria-live="polite">New announcement: {popup.title}</div>}
  </>;
}
