'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { DimensionRadar } from './dimension-radar';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
import { countAnswered } from '@/lib/recruit/answers';
import type {
  InterviewQuestion,
  RecruitCandidate,
  RecruitEvaluation,
  Recommendation,
} from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface EvaluationPanelProps {
  candidate: RecruitCandidate;
  evaluation: RecruitEvaluation | null;
  onCandidateUpdated: (candidate: RecruitCandidate) => void;
  onEvaluated: (evaluation: RecruitEvaluation) => void;
}

export function EvaluationPanel({
  candidate,
  evaluation,
  onCandidateUpdated,
  onEvaluated,
}: EvaluationPanelProps) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const { fingerprint } = useFingerprint();
  const [transcript, setTranscript] = useState(candidate.transcript);
  const [generating, setGenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  // 已有报告时记录默认折叠，把版面让给报告
  const [transcriptOpen, setTranscriptOpen] = useState(!evaluation);

  const hasQuestions = (candidate.questions ?? []).length > 0;
  const answeredCount = evaluation?.questionEvaluations.filter((q) => q.answered).length ?? 0;
  // 逐题记录过多少题——决定粘贴框上方那句提示说什么
  const recordedCount = countAnswered((candidate.questions as InterviewQuestion[] | null) ?? []);

  async function doGenerate() {
    setGenerating(true);
    try {
      // 先存记录再评价：接口从库里读 transcript，不从请求体读。
      const saveRes = await fetch(`/api/recruit/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ transcript }),
      });
      if (!saveRes.ok) throw new Error('save failed');
      onCandidateUpdated((await saveRes.json()).candidate);

      const res = await fetch(`/api/recruit/candidates/${candidate.id}/evaluation`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('evaluate failed');
      const data = await res.json();
      onEvaluated(data.evaluation);
      setTranscriptOpen(false);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (evaluation) setRegenerateOpen(true);
    else doGenerate();
  }

  if (!hasQuestions) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {t('evaluation.needQuestions')}
      </div>
    );
  }

  return (
    // 限宽：报告拉满 1600 时，逐题点评一行横跨整屏
    <div className="max-w-5xl space-y-6">
      {/* 记录区：没有报告时占主体；有报告后折成一行 */}
      {transcriptOpen ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="transcript">{t('evaluation.transcript')}</Label>
            {evaluation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTranscriptOpen(false)}
                className="cursor-pointer text-xs text-zinc-500"
              >
                {t('overview.collapseJd')}
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {recordedCount > 0
              ? t('evaluation.transcriptSupplement', { done: recordedCount })
              : t('evaluation.transcriptHint')}
          </p>
          <Textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={t('evaluation.transcriptPlaceholder')}
            className="min-h-[240px]"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={generating || !transcript.trim()}
              className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {evaluation ? t('evaluation.regenerate') : t('evaluation.generate')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setTranscriptOpen(true)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <ChevronDown className="h-4 w-4 shrink-0" />
          {t('evaluation.transcriptCollapsed', { chars: transcript.length })}
        </button>
      )}

      {generating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 py-16 dark:border-zinc-700">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">{t('evaluation.generating')}</p>
        </div>
      )}

      {!generating && !evaluation && (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('evaluation.empty')}
        </div>
      )}

      {!generating && evaluation && (
        <div className="space-y-5">
          {/* 报告头：总分、作答数、结论一行放完 */}
          <Card className="flex flex-row flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tabular-nums">{evaluation.overallScore}</span>
              <div className="text-xs text-zinc-500">
                <p>{t('evaluation.overallScore')}</p>
                <p className="mt-0.5 text-zinc-400">
                  {t('evaluation.answeredCount', {
                    answered: answeredCount,
                    total: evaluation.questionEvaluations.length,
                  })}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <Badge className={cn('shrink-0', RECOMMENDATION_STYLE[evaluation.recommendation])}>
                {t(`recommendation.${evaluation.recommendation}`)}
              </Badge>
              <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.recommendationReason}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                className="ml-2 shrink-0 cursor-pointer gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('evaluation.regenerate')}
              </Button>
            </div>
          </Card>

          {/* 雷达图与优势/顾虑并排，不再各占一整行 */}
          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="p-4 lg:col-span-5">
              <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-400">
                {t('evaluation.dimensionScores')}
              </h3>
              <DimensionRadar scores={evaluation.dimensionScores} />
            </Card>
            <div className="space-y-4 lg:col-span-7">
              <Card className="p-5">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-emerald-600">
                  {t('evaluation.strengths')}
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-amber-600">
                  {t('evaluation.concerns')}
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {evaluation.concerns.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          <Card className="p-5">
            <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
              {t('evaluation.overallComment')}
            </h3>
            <p className="mb-3 text-xs text-zinc-400">
              {t('evaluation.overallCommentHint')}
            </p>
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {evaluation.overallComment}
            </p>
          </Card>

          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">
              {t('evaluation.questionReview')}
            </h3>
            {evaluation.questionEvaluations.map((q, i) => (
              <Card key={q.questionId} className={cn('p-4', !q.answered && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {q.answered ? q.score : '—'}
                  </span>
                </div>
                {q.answered ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-zinc-700 dark:text-zinc-300">{q.answerSummary}</p>
                    {q.highlights.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-emerald-700 dark:text-emerald-400">
                        {q.highlights.map((h, j) => (
                          <li key={j}>{h}</li>
                        ))}
                      </ul>
                    )}
                    {q.weaknesses.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-amber-700 dark:text-amber-400">
                        {q.weaknesses.map((w, j) => (
                          <li key={j}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-400">{t('evaluation.notAnswered')}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('evaluation.regenerateConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doGenerate}
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {tc('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
