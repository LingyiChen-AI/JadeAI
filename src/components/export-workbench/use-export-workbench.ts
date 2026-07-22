'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientTemplateBindingChoice } from '@/lib/templates/apply-template-binding.server';
import {
  acceptSavedResume,
  addDraftSection,
  createExportDraft,
  isExportDraftDirty,
  removeDraftSection,
  reorderDraftSections,
  setDraftTemplateBinding,
  updateDraftField,
  updateDraftSectionTitle,
  updateDraftSectionContent,
  toggleDraftSectionVisibility,
  updateDraftTheme,
  validateExportDraft,
  type DraftFieldUpdate,
  type ExportDraftSession,
} from '@/lib/export-workbench/draft';
import {
  buildExportUrl,
  downloadBlob,
  fallbackExportFilename,
  filenameFromContentDisposition,
  type ExportFormat,
} from '@/lib/export-workbench/export-client';
import { createExportTransaction, type ExportTransactionState } from '@/lib/export-workbench/transaction';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';
import type { Resume, ResumeSection, SectionContent, ThemeConfig } from '@/types/resume';

function requestHeaders(): HeadersInit {
  const fingerprint = typeof window === 'undefined' ? null : localStorage.getItem('jade_fingerprint');
  return { 'Content-Type': 'application/json', ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}) };
}

function savePayload(session: ExportDraftSession) {
  const resume = session.draft;
  return {
    title: resume.title,
    template: resume.template,
    themeConfig: resume.themeConfig,
    expectedRevision: session.baseline.revision,
    sections: resume.sections.map((section, index) => ({
      id: section.id,
      type: section.type,
      title: section.title,
      sortOrder: index,
      visible: section.visible,
      content: section.content,
    })),
    ...(session.pendingBinding ? { binding: session.pendingBinding } : {}),
  };
}

export function useExportWorkbench(resumeId: string) {
  const [session, setSession] = useState<ExportDraftSession | null>(null);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [transactionState, setTransactionState] = useState<ExportTransactionState>({ status: 'idle' });
  const sessionRef = useRef(session);
  const formatRef = useRef(format);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/resume/${encodeURIComponent(resumeId)}`, {
      headers: requestHeaders(),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`resume_load_failed:${response.status}`);
      const loaded = await response.json() as Resume;
      if (!controller.signal.aborted) setSession(createExportDraft(loaded));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error : new Error(String(error)));
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [resumeId]);

  // The factory only captures refs here; their values are read later from user
  // event callbacks, so a format/draft change does not recreate an in-flight transaction.
  // eslint-disable-next-line react-hooks/refs
  const transaction = useMemo(() => createExportTransaction({
    saveDraft: async () => {
      const current = sessionRef.current;
      if (!current) throw new Error('draft_not_loaded');
      if (validateExportDraft(current.draft).issues.length > 0) throw new Error('draft_validation_failed');
      const response = await fetch(`/api/resume/${encodeURIComponent(resumeId)}`, {
        method: 'PUT', headers: requestHeaders(), body: JSON.stringify(savePayload(current)),
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'resume_revision_conflict' : `resume_save_failed:${response.status}`);
      const saved = await response.json() as Resume;
      // Advance the baseline before export. If export fails, the confirmed data
      // remains clean and retrying does not issue another destructive PUT.
      setSession((latest) => latest ? acceptSavedResume(latest, saved) : createExportDraft(saved));
      sessionRef.current = acceptSavedResume(current, saved);
      return saved;
    },
    exportSaved: async (saved) => {
      const selected = formatRef.current;
      const response = await fetch(buildExportUrl(saved.id, selected), { headers: requestHeaders() });
      if (!response.ok) throw new Error(`resume_export_failed:${response.status}`);
      return {
        blob: await response.blob(),
        filename: filenameFromContentDisposition(response.headers.get('Content-Disposition'))
          ?? fallbackExportFilename(saved.title, selected),
      };
    },
    download: ({ blob, filename }) => downloadBlob(blob, filename),
  }), [resumeId]);

  useEffect(() => transaction.subscribe(setTransactionState), [transaction]);

  const isDirty = session ? isExportDraftDirty(session) : false;
  useEffect(() => {
    if (!isDirty) return;
    const protectExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectExit);
    return () => window.removeEventListener('beforeunload', protectExit);
  }, [isDirty]);

  const updateSession = useCallback((change: (current: ExportDraftSession) => ExportDraftSession) => {
    setSession((current) => current ? change(current) : current);
  }, []);

  const updateField = useCallback((update: DraftFieldUpdate) => {
    updateSession((current) => update.itemId === undefined
      && update.fieldPath.length === 1
      && update.fieldPath[0] === 'title'
      ? updateDraftSectionTitle(current, update.sectionId, String(update.value ?? ''))
      : updateDraftField(current, update));
  }, [updateSession]);

  const updateTheme = useCallback((updates: Partial<ThemeConfig>) => {
    updateSession((current) => updateDraftTheme(current, updates));
  }, [updateSession]);

  const updateSectionContent = useCallback((sectionId: string, updates: Partial<SectionContent>) => {
    updateSession((current) => updateDraftSectionContent(current, sectionId, updates));
  }, [updateSession]);

  const addSection = useCallback((section: ResumeSection) => {
    updateSession((current) => addDraftSection(current, section));
  }, [updateSession]);

  const removeSection = useCallback((sectionId: string) => {
    updateSession((current) => removeDraftSection(current, sectionId));
  }, [updateSession]);

  const reorderSections = useCallback((sections: ResumeSection[]) => {
    updateSession((current) => reorderDraftSections(current, sections.map((section) => section.id)));
  }, [updateSession]);

  const toggleSectionVisibility = useCallback((sectionId: string) => {
    updateSession((current) => toggleDraftSectionVisibility(current, sectionId));
  }, [updateSession]);

  const selectTemplate = useCallback((binding: ClientTemplateBindingChoice, resolved?: ResolvedTemplate) => {
    updateSession((current) => setDraftTemplateBinding(current, binding, resolved));
  }, [updateSession]);

  return {
    draft: session?.draft ?? null,
    session,
    isLoading,
    loadError,
    isDirty,
    format,
    setFormat,
    transactionState,
    isSubmitting: transactionState.status === 'saving' || transactionState.status === 'exporting',
    updateField,
    updateTheme,
    updateSectionContent,
    addSection,
    removeSection,
    reorderSections,
    toggleSectionVisibility,
    selectTemplate,
    setSession,
    saveAndExport: transaction.run,
    retryExport: transaction.retryExport,
  };
}
