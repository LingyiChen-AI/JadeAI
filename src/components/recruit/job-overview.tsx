'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { JobFormDialog } from './job-form-dialog';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateCompareTable } from './candidate-compare-table';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { allocateQuestions } from '@/lib/recruit/scoring';
import { cn } from '@/lib/utils';
import type { CandidateSummary, DimensionConfig, RecruitJob } from '@/types/recruit';

export function JobOverview({ jobId }: { jobId: string }) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [jdExpanded, setJdExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const jdRef = useRef<HTMLParagraphElement>(null);
  const [jdClamped, setJdClamped] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJob(data.job);
      setCandidates(data.candidates);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [jobId, fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  useEffect(() => {
    const el = jdRef.current;
    if (!el) return;
    // line-clamp 截断时 scrollHeight 会大于 clientHeight；+1 抵消亚像素误差
    setJdClamped(el.scrollHeight > el.clientHeight + 1);
  }, [job?.jobDescription, jdExpanded]);

  // 必须 memo，且必须在早返回之前：这个数组是 CandidateCompareTable 的 effect
  // 依赖，每次渲染都新建的话，点一下「展开全文」就会把所有候选人详情重拉一遍。
  const evaluated = useMemo(
    () => candidates.filter((c) => c.overallScore !== null),
    [candidates],
  );

  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (!job) return null;

  const dimensions = job.dimensions as DimensionConfig[];
  const allocation = allocateQuestions(dimensions, job.questionCount);
  // 均分只算已评价的人；一个都没评价时不显示，避免出现「均分 0」的误导
  const avgScore =
    evaluated.length > 0
      ? Math.round(evaluated.reduce((s, c) => s + (c.overallScore as number), 0) / evaluated.length)
      : null;

  return (
    // 限宽：拉满 1600 时一行文字横跨整屏，眼睛扫不过来
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-zinc-500">
        <span>{t('overview.stats', { total: candidates.length, evaluated: evaluated.length })}</span>
        {avgScore !== null && (
          <span className="text-zinc-700 dark:text-zinc-300">
            {t('overview.avgScore', { score: avgScore })}
          </span>
        )}
      </div>

      <Card className="p-5">
        <div className="mb-2 flex flex-row items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t('jobDescription')}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="h-7 cursor-pointer gap-1.5 text-xs"
          >
            <Pencil className="h-3.5 w-3.5" />
            {tc('edit')}
          </Button>
        </div>
        <p
          ref={jdRef}
          className={cn(
            'whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400',
            !jdExpanded && 'line-clamp-3',
          )}
        >
          {job.jobDescription}
        </p>
        {(jdClamped || jdExpanded) && (
          <button
            type="button"
            onClick={() => setJdExpanded((v) => !v)}
            className="mt-1 self-start cursor-pointer text-xs text-brand hover:text-brand-hover"
          >
            {jdExpanded ? t('overview.collapseJd') : t('overview.expandJd')}
          </button>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {dimensions.map((d) => (
            <span
              key={d.key}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {d.label} ×{d.weight} · {t('dimensions.perDimension', { count: allocation[d.key] ?? 0 })}
            </span>
          ))}
        </div>
      </Card>

      {job && (
        <JobFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          job={job}
          onSaved={(updated) => {
            setJob(updated);
            // 侧栏也显示岗位名，让它跟着刷新
            router.refresh();
          }}
        />
      )}

      {evaluated.length >= 2 && (
        <CandidateCompareTable jobId={jobId} dimensions={dimensions} evaluated={evaluated} />
      )}

      <p className="text-center text-sm text-zinc-400">{t('overview.selectCandidate')}</p>
    </div>
  );
}
