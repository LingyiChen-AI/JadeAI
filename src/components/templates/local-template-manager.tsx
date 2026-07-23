'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Download, FileUp, MoreHorizontal, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocalTemplates } from '@/hooks/use-local-templates';
import { createLocalTemplateThumbnail } from '@/lib/templates/local-template-thumbnail';
import { createLocalTemplatePreset } from '@/lib/templates/local-template-presets';
import { LocalTemplateQuotaError } from '@/lib/templates/local-template.repository';
import type { DeclarativeTemplateManifest, LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';

import { LocalTemplateEditor } from './local-template-editor';
import { LocalTemplateThumbnail } from './local-template-thumbnail';

type LocalTemplateManagerProps = {
  userId: string | null | undefined;
  onApply(manifest: DeclarativeTemplateManifest): void | Promise<void>;
  onBrowsePublic?: () => void;
  onDirtyChange?(dirty: boolean): void;
};

export function createDefaultLocalTemplateManifest(): TemplateManifestV1 {
  return createLocalTemplatePreset('ats-clean');
}

type DraftMetadata = Pick<LocalTemplateRecord, 'name' | 'category' | 'localTags' | 'sourceDescription' | 'templateVersion'>;

function draftMetadata(record: LocalTemplateRecord): DraftMetadata {
  return {
    name: record.name,
    category: record.category,
    localTags: [...record.localTags],
    sourceDescription: record.sourceDescription,
    templateVersion: record.templateVersion,
  };
}

function metadataEqual(left: DraftMetadata | null, record: LocalTemplateRecord | null): boolean {
  return Boolean(left && record && JSON.stringify(left) === JSON.stringify(draftMetadata(record)));
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

export function LocalTemplateManager({ userId, onApply, onBrowsePublic, onDirtyChange }: LocalTemplateManagerProps) {
  const t = useTranslations('templates.localManager');
  const format = useFormatter();
  const library = useLocalTemplates(userId);
  const [draft, setDraft] = useState<LocalTemplateRecord | null>(null);
  const [metadataBaseline, setMetadataBaseline] = useState<DraftMetadata | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [saveVersion, setSaveVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<'quota' | 'operation' | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const saveTokenRef = useRef(0);
  const draftRef = useRef(draft);
  const dirty = Boolean(draft && (editorDirty || !metadataEqual(metadataBaseline, draft)));
  const saving = busyId !== null;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      saveTokenRef.current += 1;
    };
  }, []);

  const saveIsCurrent = (token: number, localId: string) => (
    mountedRef.current
    && saveTokenRef.current === token
    && draftRef.current?.localId === localId
  );

  const startDraft = (next: LocalTemplateRecord) => {
    if (saving) return;
    if (draft && dirty && !window.confirm(t('dirtyConfirm'))) return;
    setOperationError(null);
    setMetadataBaseline(draftMetadata(next));
    setEditorDirty(false);
    setDraft(next);
  };

  const leaveDraft = () => {
    if (saving) return;
    if (draft && dirty && !window.confirm(t('dirtyConfirm'))) return;
    setDraft(null);
    setMetadataBaseline(null);
    setEditorDirty(false);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const localId = draft.localId;
    const token = saveTokenRef.current + 1;
    saveTokenRef.current = token;
    setBusyId(localId);
    setOperationError(null);
    try {
      const thumbnail = await createLocalTemplateThumbnail(draft.manifest);
      if (!saveIsCurrent(token, localId)) return;
      const saved = { ...draft, thumbnail, updatedAt: new Date().toISOString() };
      await library.save(saved);
      if (!saveIsCurrent(token, localId)) return;
      setMetadataBaseline(draftMetadata(saved));
      setEditorDirty(false);
      setSaveVersion((version) => version + 1);
      setDraft(null);
    } catch (error) {
      if (!saveIsCurrent(token, localId)) return;
      setOperationError(error instanceof LocalTemplateQuotaError ? 'quota' : 'operation');
    } finally {
      if (saveIsCurrent(token, localId)) setBusyId(null);
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
    if (!file || saving) return;
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
            disabled={saving}
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => importInput.current?.click()}>
            <FileUp />{t('actions.import')}
          </Button>
          <Button type="button" size="sm" aria-label={t('actions.create')} disabled={saving} onClick={() => userId && startDraft(draftRecord(userId))}>
            <Plus />{t('actions.create')}
          </Button>
        </div>
      </div>

      {library.corruptCount > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{t('states.corrupt')}</p>}
      {operationError && <p className="text-sm text-red-600">{t(`states.${operationError}`)}</p>}

      {!draft && library.records.length === 0 && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-12 text-center text-sm text-zinc-500">
          <p>{t('states.empty')}</p>
          {onBrowsePublic && (
            <Button type="button" variant="outline" onClick={onBrowsePublic}>
              {t('actions.browsePublic')}
            </Button>
          )}
        </div>
      )}

      {!draft && library.records.length > 0 && (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {library.records.map((record) => (
            <article key={record.localId} className="min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <LocalTemplateThumbnail thumbnail={record.thumbnail} manifest={record.manifest} alt={record.name} />
              <div className="space-y-3 p-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{record.name}</h3>
                  <p className="truncate text-xs text-zinc-500">{record.category} | v{record.templateVersion}</p>
                  {record.sourceDescription && <p className="truncate text-xs text-zinc-500">{record.sourceDescription}</p>}
                  <p className="truncate text-xs text-zinc-500">{t('lastUpdated', {
                    date: format.dateTime(new Date(record.updatedAt), {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    }),
                  })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" className="min-w-0 flex-1" aria-label={t('actions.apply')} disabled={busyId === record.localId} onClick={() => void applyRecord(record)}><Save />{t('actions.apply')}</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="icon" variant="outline" aria-label={t('actions.more')}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startDraft(draftRecord(record.userId, record))}><Pencil />{t('actions.edit')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void copyRecord(record)}><Copy />{t('actions.copy')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void exportRecord(record)}><Download />{t('actions.export')}</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => void removeRecord(record)}><Trash2 />{t('actions.delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <div className="min-w-0 space-y-4 border-t pt-4">
          <details open className="min-w-0 border-b pb-4">
            <summary className="cursor-pointer text-sm font-medium">{t('templateInfo')}</summary>
            <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              aria-label={t('fields.name')}
              value={draft.name}
              disabled={saving}
              maxLength={120}
              className="h-9 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <input
              aria-label={t('fields.category')}
              value={draft.category}
              disabled={saving}
              maxLength={80}
              className="h-9 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            />
            <input
              aria-label={t('fields.tags')}
              value={draft.localTags.join(', ')}
              disabled={saving}
              className="h-9 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, localTags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 32) })}
            />
            <input
              aria-label={t('fields.templateVersion')}
              value={draft.templateVersion}
              disabled={saving}
              maxLength={40}
              inputMode="text"
              pattern="(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)"
              className="h-9 min-w-0 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => setDraft({ ...draft, templateVersion: event.target.value })}
            />
            <input
              aria-label={t('fields.sourceDescription')}
              value={draft.sourceDescription}
              disabled={saving}
              maxLength={500}
              className="h-9 min-w-0 rounded-md border px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:col-span-2"
              onChange={(event) => setDraft({ ...draft, sourceDescription: event.target.value })}
            />
            </div>
          </details>
          <LocalTemplateEditor
            value={draft.manifest}
            onChange={(manifest) => setDraft({ ...draft, manifest })}
            draftKey={draft.localId}
            onDirtyChange={setEditorDirty}
            saveVersion={saveVersion}
            disabled={busyId === draft.localId}
          />
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" aria-label={t('actions.cancel')} disabled={saving} onClick={leaveDraft}><X />{t('actions.cancel')}</Button>
            <Button type="button" aria-label={t('actions.save')} disabled={!draft.name.trim() || busyId === draft.localId} onClick={() => void saveDraft()}><Save />{busyId === draft.localId ? t('states.saving') : t('actions.save')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
