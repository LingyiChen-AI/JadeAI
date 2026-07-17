'use client';

import { useRef, useState } from 'react';
import { Copy, Download, FileUp, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useLocalTemplates } from '@/hooks/use-local-templates';
import { createLocalTemplateThumbnail } from '@/lib/templates/local-template-thumbnail';
import { LocalTemplateQuotaError } from '@/lib/templates/local-template.repository';
import type { DeclarativeTemplateManifest, LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';

import { LocalTemplateEditor } from './local-template-editor';

type LocalTemplateManagerProps = {
  userId: string | null | undefined;
  onApply(manifest: DeclarativeTemplateManifest): void | Promise<void>;
};

export function createDefaultLocalTemplateManifest(): TemplateManifestV1 {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#18181b', muted: '#71717a', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [
      { sectionType: 'personal_info', placement: 'header', order: 0 },
      { sectionType: 'summary', placement: 'main', order: 1 },
      { sectionType: 'work_experience', placement: 'main', order: 2 },
      { sectionType: 'education', placement: 'main', order: 3 },
      { sectionType: 'skills', placement: 'sidebar', order: 4 },
      { sectionType: 'projects', placement: 'main', order: 5 },
      { sectionType: 'qr_codes', placement: 'footer', order: 6 },
    ],
    sectionStyles: [{ sectionType: 'summary', element: 'heading', variant: 'accent' }],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function draftRecord(userId: string, source?: LocalTemplateRecord): LocalTemplateRecord {
  const timestamp = new Date().toISOString();
  return {
    userId,
    localId: source?.localId ?? crypto.randomUUID(),
    name: source?.name ?? 'Untitled template',
    category: source?.category ?? 'general',
    localTags: source?.localTags ?? [],
    sourceDescription: source?.sourceDescription ?? '',
    templateVersion: source?.templateVersion ?? '1.0.0',
    manifest: source?.manifest ?? createDefaultLocalTemplateManifest(),
    thumbnail: source?.thumbnail ?? new Blob([], { type: 'image/png' }),
    createdAt: source?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export function LocalTemplateManager({ userId, onApply }: LocalTemplateManagerProps) {
  const t = useTranslations('templates.localManager');
  const library = useLocalTemplates(userId);
  const [draft, setDraft] = useState<LocalTemplateRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<'quota' | 'operation' | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const saveDraft = async () => {
    if (!draft) return;
    setBusyId(draft.localId);
    setOperationError(null);
    try {
      const thumbnail = await createLocalTemplateThumbnail(draft.manifest);
      await library.save({ ...draft, thumbnail, updatedAt: new Date().toISOString() });
      setDraft(null);
    } catch (error) {
      setOperationError(error instanceof LocalTemplateQuotaError ? 'quota' : 'operation');
    } finally {
      setBusyId(null);
    }
  };

  const copyRecord = async (source: LocalTemplateRecord) => {
    if (!userId) return;
    setOperationError(null);
    try {
      const timestamp = new Date().toISOString();
      const thumbnail = await createLocalTemplateThumbnail(source.manifest);
      await library.save({
        ...source,
        userId,
        localId: crypto.randomUUID(),
        name: `${source.name} copy`,
        thumbnail,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      setOperationError(error instanceof LocalTemplateQuotaError ? 'quota' : 'operation');
    }
  };

  const removeRecord = async (record: LocalTemplateRecord) => {
    if (!window.confirm(t('deleteSnapshotWarning'))) return;
    setOperationError(null);
    try {
      await library.remove(record.localId);
    } catch {
      setOperationError('operation');
    }
  };

  const exportRecord = async (record: LocalTemplateRecord) => {
    setOperationError(null);
    try {
      const serialized = await library.exportPackage(record);
      const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${record.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'template'}.jade-template.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setOperationError('operation');
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setOperationError(null);
    try {
      await library.importPackage(await file.text());
      if (importInput.current) importInput.current.value = '';
    } catch (error) {
      setOperationError(error instanceof LocalTemplateQuotaError ? 'quota' : 'operation');
    }
  };

  const applyRecord = async (record: LocalTemplateRecord) => {
    setOperationError(null);
    setBusyId(record.localId);
    try {
      await onApply(record.manifest);
    } catch {
      setOperationError('operation');
    } finally {
      setBusyId(null);
    }
  };

  if (!userId || library.status === 'degraded') {
    return <div className="min-h-48 py-12 text-center text-sm text-zinc-500">{t('states.unavailable')}</div>;
  }
  if (library.status === 'loading' || library.status === 'idle') {
    return <div className="min-h-48 py-12 text-center text-sm text-zinc-500">{t('states.loading')}</div>;
  }
  if (library.status === 'error') {
    return <div className="min-h-48 py-12 text-center text-sm text-red-600">{t('states.error')}</div>;
  }

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <div className="flex items-center gap-2">
          <input
            ref={importInput}
            type="file"
            accept=".json,.jade-template.json,application/json"
            className="sr-only"
            aria-label={t('actions.import')}
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => importInput.current?.click()}>
            <FileUp />{t('actions.import')}
          </Button>
          <Button type="button" size="sm" aria-label={t('actions.create')} onClick={() => userId && setDraft(draftRecord(userId))}>
            <Plus />{t('actions.create')}
          </Button>
        </div>
      </div>

      {library.corruptCount > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{t('states.corrupt')}</p>}
      {operationError && <p className="text-sm text-red-600">{t(`states.${operationError}`)}</p>}

      {!draft && library.records.length === 0 && (
        <div className="min-h-48 py-12 text-center text-sm text-zinc-500">{t('states.empty')}</div>
      )}

      {!draft && library.records.length > 0 && (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {library.records.map((record) => (
            <article key={record.localId} className="min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="h-20" style={{ background: `linear-gradient(135deg, ${record.manifest.colors.background}, ${record.manifest.colors.accent})` }} />
              <div className="space-y-3 p-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{record.name}</h3>
                  <p className="truncate text-xs text-zinc-500">{record.category} | v{record.templateVersion}</p>
                  {record.sourceDescription && <p className="truncate text-xs text-zinc-500">{record.sourceDescription}</p>}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  <Button type="button" size="icon-sm" title={t('actions.apply')} aria-label={t('actions.apply')} disabled={busyId === record.localId} onClick={() => void applyRecord(record)}><Save /></Button>
                  <Button type="button" size="icon-sm" variant="outline" title={t('actions.edit')} aria-label={t('actions.edit')} onClick={() => setDraft(draftRecord(record.userId, record))}><Pencil /></Button>
                  <Button type="button" size="icon-sm" variant="outline" title={t('actions.copy')} aria-label={t('actions.copy')} onClick={() => void copyRecord(record)}><Copy /></Button>
                  <Button type="button" size="icon-sm" variant="outline" title={t('actions.export')} aria-label={t('actions.export')} onClick={() => void exportRecord(record)}><Download /></Button>
                  <Button type="button" size="icon-sm" variant="outline" title={t('actions.delete')} aria-label={t('actions.delete')} onClick={() => void removeRecord(record)}><Trash2 /></Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <div className="min-w-0 space-y-4 border-t pt-4">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              aria-label={t('fields.name')}
              value={draft.name}
              maxLength={120}
              className="h-9 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <input
              aria-label={t('fields.category')}
              value={draft.category}
              maxLength={80}
              className="h-9 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
            <input
              aria-label={t('fields.tags')}
              value={draft.localTags.join(', ')}
              className="h-9 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, localTags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 32) })}
            />
            <input
              aria-label={t('fields.templateVersion')}
              value={draft.templateVersion}
              maxLength={40}
              inputMode="text"
              pattern="(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)"
              className="h-9 min-w-0 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, templateVersion: event.target.value })}
            />
            <input
              aria-label={t('fields.sourceDescription')}
              value={draft.sourceDescription}
              maxLength={500}
              className="h-9 min-w-0 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-2"
              onChange={(event) => setDraft({ ...draft, sourceDescription: event.target.value })}
            />
          </div>
          <LocalTemplateEditor value={draft.manifest} onChange={(manifest) => setDraft({ ...draft, manifest })} disabled={busyId === draft.localId} />
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" aria-label={t('actions.cancel')} onClick={() => setDraft(null)}><X />{t('actions.cancel')}</Button>
            <Button type="button" aria-label={t('actions.save')} disabled={!draft.name.trim() || busyId === draft.localId} onClick={() => void saveDraft()}><Save />{t('actions.save')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
