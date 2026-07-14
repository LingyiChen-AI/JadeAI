'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { History, Redo2, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import type { AIHistoryEntry } from '@/types/editor';

export const AI_HISTORY_PANEL_LAYOUT_CLASS = 'w-[calc(100vw-2rem)] max-h-[min(34rem,calc(100vh-2rem))] max-w-lg overflow-hidden p-0';

interface AIHistoryRowInput {
  id: string;
  source: AIHistoryEntry['source'];
  createdAt: number;
  changes: unknown[];
}

export function getAIHistoryRows(
  entries: AIHistoryRowInput[],
  options: {
    chatLabel: string;
    translationLabel: string;
    formatTime: (createdAt: number) => string;
  },
) {
  return entries.map((entry) => ({
    id: entry.id,
    sourceLabel: entry.source === 'chat-tool' ? options.chatLabel : options.translationLabel,
    createdAt: entry.createdAt,
    timeLabel: options.formatTime(entry.createdAt),
    changeCount: entry.changes.length,
  }));
}

interface AIHistoryRestoreResult {
  restored: number;
  conflicts: unknown[];
  skipped: unknown[];
}

export async function restoreAIHistoryVersion(
  operation: () => Promise<AIHistoryRestoreResult>,
  save: () => Promise<unknown>,
) {
  const result = await operation();
  if (result.conflicts.length === 0 && result.skipped.length === 0) await save();
  return result;
}

export function getAIHistoryControls({
  entries,
  cursor,
  stale,
}: {
  entries: Array<{ id: string }>;
  cursor: string | null;
  stale: boolean;
}) {
  if (stale || entries.length === 0) return { undo: false, redo: false };
  const index = cursor ? entries.findIndex((entry) => entry.id === cursor) : -1;
  if (cursor && index < 0) return { undo: false, redo: false };
  return { undo: index >= 0, redo: index < entries.length - 1 };
}

interface AIHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  userId: string;
}

export function AIHistoryPanel({ open, onOpenChange, resumeId, userId }: AIHistoryPanelProps) {
  const t = useTranslations('editor.history');
  const entries = useEditorStore((state) => state.aiHistoryEntries);
  const cursor = useEditorStore((state) => state.aiHistoryCursor);
  const stale = useEditorStore((state) => state.aiHistoryStale);
  const historyError = useEditorStore((state) => state.aiHistoryError);
  const historyScope = useEditorStore((state) => state.aiHistoryScope);
  const undoAIHistory = useEditorStore((state) => state.undoAIHistory);
  const redoAIHistory = useEditorStore((state) => state.redoAIHistory);
  const clearAIHistory = useEditorStore((state) => state.clearAIHistory);
  const save = useResumeStore((state) => state.save);
  const [undoOpen, setUndoOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const scopeMatches = historyScope?.resumeId === resumeId && historyScope.userId === userId;
  const visibleEntries = useMemo(() => (scopeMatches ? entries : []), [entries, scopeMatches]);
  const controls = useMemo(
    () => getAIHistoryControls({ entries: visibleEntries, cursor, stale: stale || !scopeMatches }),
    [cursor, scopeMatches, stale, visibleEntries],
  );
  const rows = useMemo(() => getAIHistoryRows(visibleEntries, {
    chatLabel: t('sourceChat'),
    translationLabel: t('sourceTranslation'),
    formatTime: (createdAt) => new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(createdAt),
  }), [t, visibleEntries]);

  const saveRestoredResume = async (operation: () => Promise<AIHistoryRestoreResult>) => {
    const result = await restoreAIHistoryVersion(operation, save);
    if (result.conflicts.length || result.skipped.length) {
      toast.warning(t('partialRestore'));
    }
  };

  const handleUndo = async () => {
    setUndoOpen(false);
    await saveRestoredResume(undoAIHistory);
  };

  const handleRedo = async () => {
    await saveRestoredResume(redoAIHistory);
  };

  const handleClear = async () => {
    setClearOpen(false);
    await clearAIHistory();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={AI_HISTORY_PANEL_LAYOUT_CLASS}>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
            <div className="flex items-center gap-1">
              <AlertDialog open={undoOpen} onOpenChange={setUndoOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={!controls.undo} aria-label={t('undo')} title={t('undo')}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('undo')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('undoConfirm')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleUndo}>{t('undo')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" size="icon" disabled={!controls.redo} onClick={() => void handleRedo()} aria-label={t('redo')} title={t('redo')}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-500" disabled={visibleEntries.length === 0}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('clear')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('clear')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('clearConfirm')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleClear()}>{t('clear')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {stale && <p role="alert" className="border-b bg-amber-50 px-5 py-2 text-xs text-amber-800">{t('stale')}</p>}
          {historyError && <p role="alert" className="border-b bg-red-50 px-5 py-2 text-xs text-red-700">{historyError}</p>}
          <div className="min-h-0 overflow-y-auto px-5 py-3">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">{t('empty')}</p>
            ) : (
              <ol className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id} className={`rounded-md border px-3 py-2 text-xs ${row.id === cursor ? 'border-brand bg-brand-muted/40' : 'border-zinc-200 dark:border-zinc-700'}`}>
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <span>{row.sourceLabel}</span>
                      <time className="shrink-0 text-zinc-500" dateTime={new Date(row.createdAt).toISOString()}>{row.timeLabel}</time>
                    </div>
                    <div className="mt-1 text-zinc-500">{t('changeCount', { count: row.changeCount })}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
