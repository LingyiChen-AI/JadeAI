'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { JobFormDialog } from './job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { cn } from '@/lib/utils';
import type { JobStats } from '@/lib/recruit/job-stats';
import type { RecruitJob } from '@/types/recruit';

export function JobList() {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [jobs, setJobs] = useState<RecruitJob[]>([]);
  const [stats, setStats] = useState<Record<string, JobStats>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/recruit/jobs', {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJobs(data.jobs);
      setStats(data.stats ?? {});
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover">
          <Plus className="h-4 w-4" />
          {t('createJob')}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 py-16">
          <Briefcase className="mb-3 h-8 w-8 text-zinc-400" />
          <p className="text-zinc-500 dark:text-zinc-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/recruit/${job.id}`} className="block">
              {/* 内边距与 hover 效果对齐面试模拟的卡片（p-4 + hover:shadow-md），
                  两个模块的卡片摆在一起时不该有 4px 的差 */}
              <div className="group flex h-full cursor-pointer flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                {/* 日期挪到标题行：底部现在有四个数，再塞日期就挤了 */}
                <div className="flex items-baseline gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold">{job.title}</h3>
                  <span className="shrink-0 text-[11px] text-zinc-400">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-zinc-500">
                  {job.jobDescription}
                </p>

                <div className="mt-3 flex items-center gap-5 border-t pt-3 dark:border-zinc-800">
                  <Stat label={t('stats.candidates')} value={stats[job.id]?.total ?? 0} />
                  <Stat
                    label={t('stats.interviewing')}
                    value={stats[job.id]?.interviewing ?? 0}
                    accent={(stats[job.id]?.interviewing ?? 0) > 0}
                  />
                  <Stat label={t('stats.interviewed')} value={stats[job.id]?.evaluated ?? 0} />
                  <Stat
                    label={t('stats.passed')}
                    value={stats[job.id]?.passed ?? 0}
                    highlight={(stats[job.id]?.passed ?? 0) > 0}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <JobFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(job) => setJobs((prev) => [job, ...prev])}
      />
    </div>
  );
}

/** 卡片底部的一个统计数字。数字在上、标签在下，扫一眼看的是数字。 */
function Stat({
  label,
  value,
  highlight,
  accent,
}: {
  label: string;
  value: number;
  /** 通过人数：品牌绿 */
  highlight?: boolean;
  /** 面试中：琥珀色，表示「进行中」而不是「已达成」 */
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          highlight && 'text-brand',
          accent && 'text-amber-600 dark:text-amber-500',
          !highlight && !accent && 'text-zinc-700 dark:text-zinc-300',
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-zinc-400">{label}</span>
    </div>
  );
}
