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
import { createSameUrlHistoryGuard, type SameUrlHistoryGuard } from '@/lib/export-workbench/history-guard';
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
  const activeResumeIdRef = useRef(resumeId);
  const mountedRef = useRef(false);
  const operationControllersRef = useRef(new Set<AbortController>());
  const historyGuardRef = useRef<SameUrlHistoryGuard | null>(null);
  const [historyBackRequested, setHistoryBackRequested] = useState(false);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const operationControllers = operationControllersRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationControllers.forEach((controller) => controller.abort());
      operationControllers.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    operationControllersRef.current.forEach((operationController) => operationController.abort());
    operationControllersRef.current.clear();
    activeResumeIdRef.current = resumeId;
    setSession(null);
    sessionRef.current = null;
    setIsLoading(true);
    setLoadError(null);
    setTransactionState({ status: 'idle' });
    void fetch(`/api/resume/${encodeURIComponent(resumeId)}`, {
      headers: requestHeaders(),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`resume_load_failed:${response.status}`);
      const loaded = await response.json() as Resume;
      if (!controller.signal.aborted && activeResumeIdRef.current === resumeId) {
        const loadedSession = createExportDraft(loaded);
        sessionRef.current = loadedSession;
        setSession(loadedSession);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error : new Error(String(error)));
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [resumeId]);

  // The factory only captures refs here; their values are read later from user
  // event callbacks, so a format/draft change does not recreate an in-flight transaction.
  const transaction = useMemo(() => createExportTransaction({
    saveDraft: async () => {
      const current = sessionRef.current;
      if (!current) throw new Error('draft_not_loaded');
      if (current.draft.id !== resumeId || activeResumeIdRef.current !== resumeId) throw new Error('draft_resume_mismatch');
      if (validateExportDraft(current.draft).issues.length > 0) throw new Error('draft_validation_failed');
      const controller = new AbortController();
      operationControllersRef.current.add(controller);
      let saved: Partial<Resume>;
      try {
        const response = await fetch(`/api/resume/${encodeURIComponent(resumeId)}`, {
          method: 'PUT', headers: requestHeaders(), body: JSON.stringify(savePayload(current)), signal: controller.signal,
        });
        if (!mountedRef.current || activeResumeIdRef.current !== resumeId) throw new Error('operation_aborted');
        if (!response.ok) throw new Error(response.status === 409 ? 'resume_revision_conflict' : `resume_save_failed:${response.status}`);
        saved = await response.json() as Partial<Resume>;
        if (!mountedRef.current || activeResumeIdRef.current !== resumeId) throw new Error('operation_aborted');
      } finally {
        operationControllersRef.current.delete(controller);
      }
      if (saved.id !== resumeId
        || !Number.isSafeInteger(saved.revision)
        || Number(saved.revision) < current.baseline.revision
        || !Array.isArray(saved.sections)) {
        throw new Error('resume_save_response_invalid');
      }
      const confirmed = saved as Resume;
      // Advance the baseline before export. If export fails, the confirmed data
      // remains clean and retrying does not issue another destructive PUT.
      const accepted = acceptSavedResume(current, confirmed);
      sessionRef.current = accepted;
      setSession(accepted);
      return confirmed;
    },
    exportSaved: async (saved) => {
      const selected = formatRef.current;
      const controller = new AbortController();
      operationControllersRef.current.add(controller);
      try {
        const response = await fetch(buildExportUrl(saved.id, selected, saved.revision), {
          headers: requestHeaders(), signal: controller.signal,
        });
        if (!mountedRef.current || activeResumeIdRef.current !== resumeId) throw new Error('operation_aborted');
        if (!response.ok) throw new Error(`resume_export_failed:${response.status}`);
        const blob = await response.blob();
        if (!mountedRef.current || activeResumeIdRef.current !== resumeId) throw new Error('operation_aborted');
        return {
          blob,
          filename: filenameFromContentDisposition(response.headers.get('Content-Disposition'))
            ?? fallbackExportFilename(saved.title, selected),
        };
      } finally {
        operationControllersRef.current.delete(controller);
      }
    },
    download: ({ blob, filename }) => {
      if (mountedRef.current && activeResumeIdRef.current === resumeId) downloadBlob(blob, filename);
    },
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

  useEffect(() => {
    const guard = createSameUrlHistoryGuard(
      window.history,
      window.location.href,
      () => setHistoryBackRequested(true),
    );
    const handlePopState = (event: PopStateEvent) => guard.handlePopState(event);
    historyGuardRef.current = guard;
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      guard.deactivate();
      if (historyGuardRef.current === guard) historyGuardRef.current = null;
    };
  }, [resumeId]);

  useEffect(() => {
    const guard = historyGuardRef.current;
    if (!guard) return;
    if (isDirty) guard.activate();
    else {
      setHistoryBackRequested(false);
      guard.deactivate();
    }
  }, [isDirty]);

  const updateSession = useCallback((change: (current: ExportDraftSession) => ExportDraftSession) => {
    const status = transaction.getState().status;
    if (status === 'saving' || status === 'exporting') return;
    const current = sessionRef.current;
    if (!current || current.draft.id !== resumeId) return;
    const next = change(current);
    sessionRef.current = next;
    setSession(next);
  }, [resumeId, transaction]);

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

  const visibleSession = session?.draft.id === resumeId ? session : null;
  const primaryAction = useCallback(() => {
    const current = sessionRef.current;
    if (transaction.getState().status === 'saved_export_failed'
      && current
      && !isExportDraftDirty(current)) {
      return transaction.retryExport();
    }
    return transaction.run();
  }, [transaction]);

  return {
    draft: visibleSession?.draft ?? null,
    session: visibleSession,
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
    historyBackRequested,
    cancelHistoryBack: () => {
      setHistoryBackRequested(false);
      historyGuardRef.current?.cancelBlockedNavigation();
    },
    confirmHistoryBack: () => {
      setHistoryBackRequested(false);
      historyGuardRef.current?.confirmBlockedNavigation();
    },
    discardAndLeave: (leave: () => void) => {
      setHistoryBackRequested(false);
      historyGuardRef.current?.deactivate(leave);
    },
    primaryAction,
    saveAndExport: transaction.run,
    retryExport: transaction.retryExport,
  };
}
