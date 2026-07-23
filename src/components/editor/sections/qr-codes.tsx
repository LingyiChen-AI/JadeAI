'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Sparkles, Plus } from 'lucide-react';
import { useResumeStore } from '@/stores/resume-store';
import { extractUrlsFromResume } from '@/lib/qrcode';
import type { ResumeSection, QrCodesContent, QrCodeItem } from '@/types/resume';

function isValidUrl(str: string): boolean {
  if (!str.trim()) return true; // empty is ok
  try {
    const raw = str.startsWith('http') ? str : `https://${str}`;
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // hostname must contain a dot (e.g. example.com) or be localhost/IP
    const host = url.hostname;
    return host === 'localhost' || /\.\w{2,}$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<QrCodesContent>) => void;
}

interface QrCodesFieldsProps extends Props {
  sourceSections: ResumeSection[];
}

export function QrCodesFields({ section, onUpdate, sourceSections }: QrCodesFieldsProps) {
  const t = useTranslations('editor.fields');
  const content = section.content as QrCodesContent;
  const items = Array.isArray(content.items) ? content.items : [];
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            const detected = extractUrlsFromResume(sourceSections);
            if (detected.length === 0) return;
            const existingUrls = new Set(items.map((q) => q.url.toLowerCase()));
            const merged = [
              ...items,
              ...detected.filter((d) => !existingUrls.has(d.url.toLowerCase())),
            ];
            onUpdate({ items: merged });
          }}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <Sparkles className="h-3 w-3" />
          {t('qrAutoGenerate')}
        </button>
      </div>

      {items.map((qr, idx) => (
        <div key={qr.id} className="flex items-center gap-1.5">
          <input
            type="text"
            value={qr.label}
            placeholder={t('qrLabel')}
            onChange={(e) => {
              const updated = [...items];
              updated[idx] = { ...updated[idx], label: e.target.value };
              onUpdate({ items: updated });
            }}
            className="h-7 w-20 shrink-0 rounded border border-zinc-200 bg-transparent px-2 text-xs outline-none focus:border-zinc-400 dark:border-zinc-700 dark:focus:border-zinc-500"
          />
          <input
            type="text"
            value={qr.url}
            placeholder={t('qrUrl')}
            title={invalidIds.has(qr.id) ? t('qrUrlInvalid') : undefined}
            onChange={(e) => {
              const updated = [...items];
              updated[idx] = { ...updated[idx], url: e.target.value };
              onUpdate({ items: updated });
              if (invalidIds.has(qr.id) && isValidUrl(e.target.value)) {
                setInvalidIds((prev) => { const next = new Set(prev); next.delete(qr.id); return next; });
              }
            }}
            onBlur={() => {
              if (!isValidUrl(qr.url)) {
                setInvalidIds((prev) => new Set(prev).add(qr.id));
              } else {
                setInvalidIds((prev) => { const next = new Set(prev); next.delete(qr.id); return next; });
              }
            }}
            className={`h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-xs outline-none ${invalidIds.has(qr.id) ? 'border-red-400 text-red-500 placeholder:text-red-300 focus:border-red-500' : 'border-zinc-200 focus:border-zinc-400 dark:border-zinc-700 dark:focus:border-zinc-500'}`}
          />
          <button
            type="button"
            onClick={() => {
              const updated = items.filter((_, i) => i !== idx);
              onUpdate({ items: updated });
            }}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          const newItem: QrCodeItem = { id: `qr-${Date.now()}`, label: '', url: '' };
          onUpdate({ items: [...items, newItem] });
        }}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <Plus className="h-3 w-3" />
        {t('qrAdd')}
      </button>
    </div>
  );
}

export function QrCodesSection({ section, onUpdate }: Props) {
  const { currentResume } = useResumeStore();
  return (
    <QrCodesFields
      section={section}
      onUpdate={onUpdate}
      sourceSections={currentResume?.sections || []}
    />
  );
}
