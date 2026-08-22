'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EvaluationPanel } from './evaluation-panel';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitCandidate, RecruitEvaluation } from '@/types/recruit';

export function ReportPanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [candidate, setCandidate] = useState<RecruitCandidate | null>(null);
  const [evaluation, setEvaluation] = useState<RecruitEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fpLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
          headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
        });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (cancelled) return;
        setCandidate(data.candidate);
        setEvaluation(data.evaluation);
      } catch {
        if (!cancelled) toast.error(t('errors.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fpLoading, fingerprint, candidateId, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!candidate) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/recruit/${jobId}`}
            className="inline-flex cursor-pointer items-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('list.backToCandidates')}
          </Link>
          <h1 className="mt-1 truncate text-2xl font-bold">
            {candidate.name}
            <span className="ml-2 align-middle text-sm font-normal text-zinc-400">
              {t('report.title')}
            </span>
          </h1>
        </div>
        {/* 报告看完想再补几道题的回答，直接回面试台 */}
        {(candidate.questions?.length ?? 0) > 0 && (
          <Button asChild variant="outline" size="sm" className="shrink-0 cursor-pointer gap-1.5">
            <Link href={`/recruit/${jobId}/c/${candidateId}/stage`}>
              <Play className="h-3.5 w-3.5" />
              {t('actions.startInterview')}
            </Link>
          </Button>
        )}
      </div>

      <EvaluationPanel
        candidate={candidate}
        evaluation={evaluation}
        onCandidateUpdated={setCandidate}
        onEvaluated={setEvaluation}
      />
    </div>
  );
}
