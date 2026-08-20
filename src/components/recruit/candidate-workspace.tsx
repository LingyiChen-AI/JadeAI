'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumePanel } from './resume-panel';
import { QuestionsPanel } from './questions-panel';
import { EvaluationPanel } from './evaluation-panel';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitCandidate, RecruitEvaluation, RecruitJob } from '@/types/recruit';

interface CandidateWorkspaceProps {
  jobId: string;
  candidateId: string;
}

export function CandidateWorkspace({ jobId, candidateId }: CandidateWorkspaceProps) {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidate, setCandidate] = useState<RecruitCandidate | null>(null);
  const [evaluation, setEvaluation] = useState<RecruitEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJob(data.job);
      setCandidate(data.candidate);
      setEvaluation(data.evaluation);
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

  if (loading) return <Skeleton className="h-96 rounded-xl" />;
  if (!candidate || !job) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/recruit/${jobId}`}
          className="inline-flex cursor-pointer items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ChevronLeft className="h-4 w-4" />
          {job.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{candidate.name || '—'}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t(`status.${candidate.status}`)}</p>
      </div>

      <Tabs defaultValue="resume">
        <TabsList>
          <TabsTrigger value="resume" className="cursor-pointer">{t('tabs.resume')}</TabsTrigger>
          <TabsTrigger value="questions" className="cursor-pointer">{t('tabs.questions')}</TabsTrigger>
          <TabsTrigger value="evaluation" className="cursor-pointer">{t('tabs.evaluation')}</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-6">
          <ResumePanel candidate={candidate} onUpdated={setCandidate} />
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          <QuestionsPanel job={job} candidate={candidate} onUpdated={setCandidate} />
        </TabsContent>

        <TabsContent value="evaluation" className="mt-6">
          <EvaluationPanel
            candidate={candidate}
            evaluation={evaluation}
            onCandidateUpdated={setCandidate}
            onEvaluated={setEvaluation}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
