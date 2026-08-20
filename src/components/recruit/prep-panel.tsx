'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Sparkles, Loader2, Play, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResumePanel } from './resume-panel';
import { JobFormDialog } from './job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import { allocateQuestions } from '@/lib/recruit/scoring';
import { cn } from '@/lib/utils';
import type { DimensionConfig, RecruitCandidate, RecruitJob } from '@/types/recruit';

export function PrepPanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [candidate, setCandidate] = useState<RecruitCandidate | null>(null);
  const [job, setJob] = useState<RecruitJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editJobOpen, setEditJobOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setCandidate(data.candidate);
      setJob(data.job);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [candidateId, fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  async function doGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}/questions`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('generate failed');
      // 生成完直接进面试台——这一步之后没有别的事可做了
      router.push(`/recruit/${jobId}/c/${candidateId}/stage`);
    } catch {
      toast.error(t('errors.generateFailed'));
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (!candidate || !job) return null;

  // 候选人可覆盖岗位的维度配置；没覆盖就用岗位的，和出题接口的逻辑一致
  const dimensions = ((candidate.dimensionsOverride as DimensionConfig[] | null) ??
    (job.dimensions as DimensionConfig[])) as DimensionConfig[];
  const allocation = allocateQuestions(dimensions, job.questionCount);
  const questionCount = candidate.questions?.length ?? 0;
  const hasResume = Boolean(candidate.resumeText?.trim());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <Link
        href={`/recruit/${jobId}`}
        className="inline-flex cursor-pointer items-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {t('list.backToCandidates')}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">
        {candidate.name}
        <span className="ml-2 align-middle text-sm font-normal text-zinc-400">
          {t('prep.title')}
        </span>
      </h1>

      <div className="mt-6 space-y-5">
        <ResumePanel candidate={candidate} onUpdated={setCandidate} />

        <Card className="p-4">
          <div className="mb-1 flex flex-row items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t('prep.dimensionsTitle')}</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditJobOpen(true)}
              className="h-7 cursor-pointer gap-1.5 text-xs"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('prep.editJobConfig')}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">{t('prep.dimensionsHint')}</p>

          <div className="mt-3 divide-y dark:divide-zinc-800">
            {dimensions.map((d) => (
              <div key={d.key} className="flex items-center gap-2.5 py-2">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', dimensionColor(d.key).dot)} />
                <span className="min-w-0 flex-1 truncate text-sm">{d.label}</span>
                <span className="shrink-0 text-xs text-zinc-400">×{d.weight}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                  {t('dimensions.perDimension', { count: allocation[d.key] ?? 0 })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 操作条钉在底部：上面的简历框可以很长，按钮不该被滚到看不见 */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
            {questionCount > 0
              ? t('prep.hasQuestions', { count: questionCount })
              : t('prep.generateHint')}
          </span>
          {questionCount > 0 ? (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={generating}
                className="cursor-pointer gap-2"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {t('questions.regenerate')}
              </Button>
              <Button asChild className="cursor-pointer gap-2">
                <Link href={`/recruit/${jobId}/c/${candidateId}/stage`}>
                  <Play className="h-4 w-4" />
                  {t('actions.startInterview')}
                </Link>
              </Button>
            </>
          ) : (
            <Button
              onClick={doGenerate}
              disabled={!hasResume || generating}
              title={hasResume ? undefined : t('questions.needResume')}
              className="cursor-pointer gap-2"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? t('questions.generating') : t('questions.generate')}
            </Button>
          )}
        </div>
      </div>

      <JobFormDialog
        open={editJobOpen}
        onOpenChange={setEditJobOpen}
        job={job}
        onSaved={setJob}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('questions.regenerateConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doGenerate()} className="cursor-pointer">
              {tc('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
