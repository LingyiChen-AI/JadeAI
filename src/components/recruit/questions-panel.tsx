'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuestionCard } from './question-card';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import type { DimensionConfig, InterviewQuestion, RecruitCandidate, RecruitJob } from '@/types/recruit';

interface QuestionsPanelProps {
  job: RecruitJob;
  candidate: RecruitCandidate;
  onUpdated: (candidate: RecruitCandidate) => void;
}

export function QuestionsPanel({ job, candidate, onUpdated }: QuestionsPanelProps) {
  const t = useTranslations('recruit');
  const { fingerprint } = useFingerprint();
  const [generating, setGenerating] = useState(false);

  const dimensions: DimensionConfig[] = candidate.dimensionsOverride ?? job.dimensions;
  const questions = candidate.questions ?? [];
  const hasResume = Boolean(candidate.resumeText?.trim());

  async function handleGenerate() {
    if (questions.length > 0 && !confirm(t('questions.regenerateConfirm'))) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidate.id}/questions`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('generate failed');
      const data = await res.json();
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleRemove(questionId: string) {
    const next = questions.filter((q) => q.id !== questionId);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ questions: next }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  // 面试官要把题目带进会议室，所以复制出来的是可读纯文本而不是 JSON。
  async function handleCopyAll() {
    const text = questions
      .map((q: InterviewQuestion, i) => {
        const label = dimensions.find((d) => d.key === q.dimension)?.label ?? q.dimension;
        return [
          `${i + 1}. [${label}] ${q.question}`,
          `   ${t('questions.intent')}：${q.intent}`,
          `   ${t('questions.excellent')}：${q.rubric.excellent}`,
          `   ${t('questions.pass')}：${q.rubric.pass}`,
          `   ${t('questions.fail')}：${q.rubric.fail}`,
          q.followUps.length ? `   ${t('questions.followUps')}：${q.followUps.join('；')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    toast.success(t('questions.copied'));
  }

  if (!hasResume) {
    return <Card className="p-10 text-center text-sm text-zinc-500">{t('questions.needResume')}</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
          </Button>
          {questions.length > 0 && (
            <Button variant="outline" onClick={handleCopyAll}>
              <Copy className="mr-1 h-4 w-4" />
              {t('questions.copyAll')}
            </Button>
          )}
        </div>
      </div>

      {generating && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('questions.generating')}</Card>
      )}

      {!generating && questions.length === 0 && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('questions.empty')}</Card>
      )}

      {!generating &&
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            dimensions={dimensions}
            onRemove={() => handleRemove(q.id)}
          />
        ))}
    </div>
  );
}
