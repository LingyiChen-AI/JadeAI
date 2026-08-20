'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StepTabs, type Step } from './step-tabs';
import { ResumePanel } from './resume-panel';
import { QuestionsPanel } from './questions-panel';
import { EvaluationPanel } from './evaluation-panel';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitCandidate, RecruitEvaluation, RecruitJob } from '@/types/recruit';

interface CandidateWorkspaceProps {
  jobId: string;
  candidateId: string;
}

export function CandidateWorkspace({ candidateId }: CandidateWorkspaceProps) {
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

  // candidateId 变化时要重新拉——左栏切换候选人不会重新挂载本组件
  useEffect(() => {
    if (fpLoading) return;
    setLoading(true);
    load();
  }, [fpLoading, load]);

  if (loading) return <Skeleton className="h-96 rounded-xl" />;
  if (!candidate || !job) return null;

  const steps: Step[] = [
    { value: 'resume', label: t('steps.resume'), done: Boolean(candidate.resumeText?.trim()) },
    { value: 'questions', label: t('steps.questions'), done: (candidate.questions ?? []).length > 0 },
    { value: 'evaluation', label: t('steps.evaluation'), done: evaluation !== null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{candidate.name || '—'}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t(`status.${candidate.status}`)}</p>
      </div>

      <Tabs defaultValue="resume">
        <StepTabs steps={steps} />

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
