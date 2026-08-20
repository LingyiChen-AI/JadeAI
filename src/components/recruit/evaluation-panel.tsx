'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DimensionRadar } from './dimension-radar';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import type { RecruitCandidate, RecruitEvaluation, Recommendation } from '@/types/recruit';

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
  const { fingerprint } = useFingerprint();
  const [transcript, setTranscript] = useState(candidate.transcript);
  const [generating, setGenerating] = useState(false);

  const hasQuestions = (candidate.questions ?? []).length > 0;
  const answeredCount = evaluation?.questionEvaluations.filter((q) => q.answered).length ?? 0;

  async function handleGenerate() {
    if (evaluation && !confirm(t('evaluation.regenerateConfirm'))) return;
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
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  if (!hasQuestions) {
    return (
      <Card className="p-10 text-center text-sm text-zinc-500">{t('evaluation.needQuestions')}</Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="transcript">{t('evaluation.transcript')}</Label>
        <p className="text-xs text-zinc-500">{t('evaluation.transcriptHint')}</p>
        <Textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={t('evaluation.transcriptPlaceholder')}
          rows={12}
        />
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={generating || !transcript.trim()}>
            {generating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            {evaluation ? t('evaluation.regenerate') : t('evaluation.generate')}
          </Button>
        </div>
      </div>

      {generating && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('evaluation.generating')}</Card>
      )}

      {!generating && !evaluation && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('evaluation.empty')}</Card>
      )}

      {!generating && evaluation && (
        <div className="space-y-6">
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-xs text-zinc-500">{t('evaluation.overallScore')}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{evaluation.overallScore}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {t('evaluation.answeredCount', {
                  answered: answeredCount,
                  total: evaluation.questionEvaluations.length,
                })}
              </p>
            </div>
            <div className="text-right">
              <Badge className={RECOMMENDATION_STYLE[evaluation.recommendation]}>
                {t(`recommendation.${evaluation.recommendation}`)}
              </Badge>
              <p className="mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.recommendationReason}
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-2 text-sm font-medium">{t('evaluation.dimensionScores')}</h3>
            <DimensionRadar scores={evaluation.dimensionScores} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-3 text-sm font-medium text-emerald-600">
                {t('evaluation.strengths')}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-6">
              <h3 className="mb-3 text-sm font-medium text-amber-600">
                {t('evaluation.concerns')}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="mb-2 text-sm font-medium">{t('evaluation.overallComment')}</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {evaluation.overallComment}
            </p>
          </Card>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('evaluation.questionReview')}</h3>
            {evaluation.questionEvaluations.map((q, i) => (
              <Card key={q.questionId} className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {q.answered ? q.score : '—'}
                  </span>
                </div>
                {q.answered ? (
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs font-medium text-zinc-500">
                        {t('evaluation.answerSummary')}
                      </p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{q.answerSummary}</p>
                    </div>
                    {q.highlights.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-emerald-600">
                          {t('evaluation.highlights')}
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
                          {q.highlights.map((h, j) => (
                            <li key={j}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {q.weaknesses.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-600">
                          {t('evaluation.weaknesses')}
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
                          {q.weaknesses.map((w, j) => (
                            <li key={j}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">{t('evaluation.notAnswered')}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
