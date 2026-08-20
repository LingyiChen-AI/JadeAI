'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Loader2, Check, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
import type { CandidateSummary } from '@/types/recruit';

type Step = 'create' | 'resume' | 'questions';
const STEPS: Step[] = ['create', 'resume', 'questions'];

interface CandidateDialogProps {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入表示给已有候选人重传简历，不传表示新建 */
  candidate?: CandidateSummary | null;
  /** 建完但还没跳走时通知列表刷新 */
  onDone?: () => void;
}

/**
 * 一个弹窗跑完「建人 → 传简历 → 出题 → 进面试台」。
 *
 * 拆成准备页的时候，用户要点四次才能开始面试；这四步之间其实
 * 没有任何需要人做决定的地方，所以合并成一次提交，中间只报进度。
 */
export function CandidateDialog({
  jobId,
  open,
  onOpenChange,
  candidate,
  onDone,
}: CandidateDialogProps) {
  const t = useTranslations('recruit');
  const router = useRouter();
  const { fingerprint } = useFingerprint();
  const fileRef = useRef<HTMLInputElement>(null);

  const editing = Boolean(candidate);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [running, setRunning] = useState<Step | null>(null);
  const [failedAt, setFailedAt] = useState<Step | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(candidate?.name ?? '');
    setFile(null);
    setText('');
    setRunning(null);
    setFailedAt(null);
  }, [open, candidate]);

  const hasResume = Boolean(file) || Boolean(text.trim());
  const canSubmit = (editing || name.trim()) && hasResume && running === null;

  const headers = (): Record<string, string> =>
    fingerprint ? { 'x-fingerprint': fingerprint } : {};

  async function handleSubmit() {
    setFailedAt(null);
    let candidateId = candidate?.id;

    // ── 建人 ────────────────────────────────────────────────
    if (!candidateId) {
      setRunning('create');
      try {
        const res = await fetch(`/api/recruit/jobs/${jobId}/candidates`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers() },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) throw new Error();
        candidateId = (await res.json()).candidate.id as string;
      } catch {
        setRunning(null);
        setFailedAt('create');
        toast.error(t('errors.saveFailed'));
        return;
      }
    } else if (name.trim() && name.trim() !== candidate?.name) {
      await fetch(`/api/recruit/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...headers() },
        body: JSON.stringify({ name: name.trim() }),
      }).catch(() => {});
    }

    // ── 简历：文件走解析，纯文本直接存 ────────────────────────
    setRunning('resume');
    try {
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/recruit/candidates/${candidateId}/resume`, {
          method: 'POST',
          headers: { ...headers(), ...getAIHeaders() },
          body: fd,
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', ...headers() },
          body: JSON.stringify({ resumeText: text.trim() }),
        });
        if (!res.ok) throw new Error();
      }
    } catch {
      setRunning(null);
      setFailedAt('resume');
      // 人已经建出来了，列表要刷新——否则用户看不到他，会重复创建
      onDone?.();
      toast.error(t('errors.parseFailed'));
      return;
    }

    // ── 出题 ────────────────────────────────────────────────
    setRunning('questions');
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}/questions`, {
        method: 'POST',
        headers: { ...headers(), ...getAIHeaders() },
      });
      if (!res.ok) throw new Error();
    } catch {
      setRunning(null);
      setFailedAt('questions');
      onDone?.();
      toast.error(t('errors.generateFailed'));
      return;
    }

    onOpenChange(false);
    router.push(`/recruit/${jobId}/c/${candidateId}/stage`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => running === null && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
        showCloseButton={running === null}
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? t('addFlow.reupload') : t('addFlow.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cand-name">{t('candidates.name')}</Label>
            <Input
              id="cand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('candidates.namePlaceholder')}
              disabled={running !== null}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('addFlow.resumeLabel')}</Label>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setText('');
                }
                // 清空，否则同一个文件重选不触发 change
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            {file ? (
              <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 dark:border-zinc-800">
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={running !== null}
                  aria-label={t('cancel')}
                  className="shrink-0 cursor-pointer text-zinc-400 hover:text-zinc-700 disabled:opacity-40 dark:hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={running !== null}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-3 py-3 text-left transition-colors hover:border-brand disabled:opacity-40 dark:border-zinc-700"
              >
                <Upload className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t('resume.upload')}</span>
                  <span className="block text-xs text-zinc-500">{t('resume.uploadHint')}</span>
                </span>
              </button>
            )}
          </div>

          {!file && (
            <div className="space-y-1.5">
              <Label htmlFor="cand-resume" className="text-xs font-normal text-zinc-500">
                {t('resume.paste')}
              </Label>
              <Textarea
                id="cand-resume"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('resume.pastePlaceholder')}
                disabled={running !== null}
                className="max-h-[220px] min-h-[92px]"
              />
            </div>
          )}

          {(running !== null || failedAt !== null) && (
            <div className="space-y-1.5 rounded-lg border bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              {STEPS.map((step) => {
                const order = STEPS.indexOf(step);
                const at = STEPS.indexOf(failedAt ?? running ?? 'create');
                const state =
                  order < at ? 'done' : order > at ? 'todo' : failedAt ? 'failed' : 'running';
                return (
                  <div key={step} className="flex items-center gap-2 text-[13px]">
                    {state === 'done' && <Check className="h-3.5 w-3.5 text-brand" />}
                    {state === 'running' && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                    )}
                    {state === 'failed' && <X className="h-3.5 w-3.5 text-red-600" />}
                    {state === 'todo' && (
                      <span className="h-3.5 w-3.5 rounded-full border border-zinc-300 dark:border-zinc-600" />
                    )}
                    <span
                      className={cn(
                        state === 'todo' && 'text-zinc-400',
                        state === 'failed' && 'text-red-600',
                        state === 'running' && 'text-zinc-900 dark:text-zinc-100',
                        state === 'done' && 'text-zinc-500',
                      )}
                    >
                      {t(`addFlow.step${step === 'create' ? 'Create' : step === 'resume' ? 'Resume' : 'Questions'}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running !== null}
            className="cursor-pointer"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            title={hasResume ? undefined : t('addFlow.needResumeFirst')}
            className="cursor-pointer gap-2"
          >
            {running !== null && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? t('addFlow.reuploadSubmit') : t('addFlow.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
