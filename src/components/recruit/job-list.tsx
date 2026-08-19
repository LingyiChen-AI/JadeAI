'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { JobFormDialog } from './job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitJob } from '@/types/recruit';

export function JobList() {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [jobs, setJobs] = useState<RecruitJob[]>([]);
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('createJob')}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Briefcase className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500">{t('empty')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/recruit/${job.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-brand">
                <h3 className="truncate font-medium">{job.title}</h3>
                <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{job.jobDescription}</p>
                <p className="mt-4 text-xs text-zinc-400">
                  {new Date(job.createdAt).toLocaleDateString()}
                </p>
              </Card>
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
