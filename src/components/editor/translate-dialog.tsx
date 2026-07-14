'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { LanguageSelect } from '@/components/ui/language-select';
import { Languages, Loader2, CheckCircle2, AlertCircle, FileEdit, FilePlus2 } from 'lucide-react';
import { getAIHeaders } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
import {
  recordAIWriteback,
  snapshotResumeSections,
  type AIWritebackWriter,
} from '@/lib/resume/diff-ai-changes';
import type { Resume, ResumeSection } from '@/types/resume';

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

type TranslateMode = 'overwrite' | 'copy';
type TranslateState = 'idle' | 'translating' | 'success' | 'error';

interface Progress {
  completed: number;
  total: number;
}

export async function recordOverwriteTranslationHistory({
  resumeId,
  userId,
  serverRevision,
  baseline,
  translatedSections,
}: {
  resumeId: string;
  userId: string;
  serverRevision: number;
  baseline: ResumeSection[] | null;
  translatedSections: ResumeSection[];
}, writer: AIWritebackWriter) {
  if (!baseline) return null;
  return recordAIWriteback({
    resumeId,
    userId,
    before: baseline,
    after: translatedSections,
    source: 'overwrite-translation',
    serverRevision,
  }, writer);
}

export function mergeOverwriteTranslationResume(
  current: Resume,
  translatedSections: ResumeSection[],
  language: string,
  serverRevision: number,
): Resume {
  return {
    ...current,
    language,
    revision: serverRevision,
    sections: translatedSections,
  };
}

/** Read an NDJSON stream line by line, calling onLine for each parsed JSON object. */
async function readNDJSON(
  response: Response,
  onLine: (data: Record<string, unknown>) => void | Promise<void>
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      await onLine(JSON.parse(line));
    }
  }

  // Handle remaining buffer
  if (buffer.trim()) {
    await onLine(JSON.parse(buffer));
  }
}

export function TranslateDialog({ open, onOpenChange, resumeId }: TranslateDialogProps) {
  const t = useTranslations('translate');
  const router = useRouter();
  const currentResume = useResumeStore((s) => s.currentResume);

  const currentLanguage = currentResume?.language || 'en';
  const defaultTarget = currentLanguage === 'zh' ? 'en' : 'zh';

  const [targetLanguage, setTargetLanguage] = useState(defaultTarget);
  const [mode, setMode] = useState<TranslateMode>('overwrite');
  const [state, setState] = useState<TranslateState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState<Progress>({ completed: 0, total: 0 });
  const [failedCount, setFailedCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const overwriteBaselineRef = useRef<ResumeSection[] | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setProgress({ completed: 0, total: 0 });
      setFailedCount(0);
      setMode('overwrite');
      const lang = useResumeStore.getState().currentResume?.language || 'en';
      setTargetLanguage(lang === 'zh' ? 'en' : 'zh');
    } else {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  const handleTranslate = useCallback(async () => {
    const resumeStore = useResumeStore.getState();
    const saved = await resumeStore.save();
    if (!saved || !resumeStore.beginAiEditing(resumeId)) {
      setState('error');
      setErrorMessage(t('error'));
      return;
    }

    setState('translating');
    setErrorMessage('');
    setProgress({ completed: 0, total: 0 });
    setFailedCount(0);

    if (mode === 'overwrite') {
      const current = useResumeStore.getState().sections;
      overwriteBaselineRef.current = snapshotResumeSections(current);
    } else {
      overwriteBaselineRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fingerprint = localStorage.getItem('jade_fingerprint');
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: JSON.stringify({ resumeId, targetLanguage, mode }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Translation failed');
      }

      await readNDJSON(res, async (data) => {
        if (data.type === 'progress') {
          setProgress({
            completed: data.completed as number,
            total: data.total as number,
          });

          // In overwrite mode, apply each translated section to the store in real-time
          if (mode === 'overwrite') {
            const section = data.section as {
              sectionId: string;
              title: string;
              content: ResumeSection['content'];
            } | undefined;
            if (section) {
              const current = useResumeStore.getState().currentResume;
              if (current) {
                useResumeStore.getState().setResume({
                  ...current,
                  sections: current.sections.map((s) =>
                    s.id === section.sectionId
                      ? { ...s, title: section.title, content: section.content }
                      : s
                  ),
                });
              }
            }
          }
        } else if (data.type === 'done') {
          const failed = (data.failedCount as number) || 0;
          setFailedCount(failed);
          setState('success');

          if (mode === 'copy' && data.newResumeId) {
            // Copy mode: navigate to the new resume
            setTimeout(() => {
              onOpenChange(false);
              router.push(`/editor/${data.newResumeId}`);
            }, 1500);
          } else {
            // Overwrite mode: sync store and close
            const current = useResumeStore.getState().currentResume;
            const translatedSections = (data.sections as ResumeSection[]) || [];
            const baseline = overwriteBaselineRef.current;
            const serverRevision = typeof data.revision === 'number'
              ? data.revision
              : current?.revision ?? 0;
            if (current && baseline) {
              await recordOverwriteTranslationHistory({
                resumeId,
                userId: current.userId,
                baseline,
                translatedSections,
                serverRevision,
              }, {
                appendHistory: async (entry) => {
                  await useEditorStore.getState().appendAIHistory(entry);
                  const historyError = useEditorStore.getState().aiHistoryError;
                  if (historyError) throw new Error(historyError);
                },
                mergeChanges: useEditorStore.getState().mergeAiChanges,
                onPersistenceError: (error) => console.warn('AI history persistence degraded:', error),
              });
            }
            if (current) {
              useResumeStore.getState().setResume(mergeOverwriteTranslationResume(
                current,
                translatedSections,
                data.language as string,
                serverRevision,
              ));
            }
            overwriteBaselineRef.current = null;

            setTimeout(() => {
              onOpenChange(false);
            }, 1500);
          }
        }
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : t('error'));
    } finally {
      useResumeStore.getState().endAiEditing(resumeId);
    }
  }, [resumeId, targetLanguage, mode, onOpenChange, t, router]);

  const progressPercent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const modeOptions: { value: TranslateMode; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'overwrite', label: t('modeOverwrite'), desc: t('modeOverwriteDesc'), icon: <FileEdit className="h-4 w-4" /> },
    { value: 'copy', label: t('modeCopy'), desc: t('modeCopyDesc'), icon: <FilePlus2 className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && state !== 'translating') onOpenChange(false); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          {/* Language Selector */}
          {state === 'idle' && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('targetLanguage')}
                </label>
                <LanguageSelect value={targetLanguage} onValueChange={setTargetLanguage} />
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-2.5">
                {modeOptions.map((opt) => {
                  const active = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMode(opt.value)}
                      className={cn(
                        'relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition-all cursor-pointer',
                        active
                          ? 'border-brand bg-brand-muted dark:bg-brand-muted dark:border-brand'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-600'
                      )}
                    >
                      <span className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                        active
                          ? 'bg-brand text-white'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                      )}>
                        {opt.icon}
                      </span>
                      <span className={cn(
                        'text-sm font-semibold',
                        active ? 'text-brand dark:text-brand' : 'text-zinc-700 dark:text-zinc-300'
                      )}>
                        {opt.label}
                      </span>
                      <span className="text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Translating State */}
          {state === 'translating' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                {progress.total > 0
                  ? t('progress', { completed: progress.completed, total: progress.total })
                  : t('translating')}
              </p>
              {progress.total > 0 && (
                <div className="w-full max-w-xs">
                  <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {failedCount > 0
                  ? t('partialSuccess', { failed: failedCount })
                  : t('success')}
              </p>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {errorMessage || t('error')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {state === 'idle' && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleTranslate}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('translateAll')}
              </Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleTranslate}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('translateAll')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
