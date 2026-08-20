'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Copy, Loader2, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { QuestionCard } from './question-card';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { summarizeQuestions } from '@/lib/recruit/summary';
import type {
  DimensionConfig,
  InterviewQuestion,
  RecruitCandidate,
  RecruitJob,
} from '@/types/recruit';

interface QuestionsPanelProps {
  job: RecruitJob;
  candidate: RecruitCandidate;
  onUpdated: (candidate: RecruitCandidate) => void;
}

export function QuestionsPanel({ job, candidate, onUpdated }: QuestionsPanelProps) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const { fingerprint } = useFingerprint();
  const [generating, setGenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 「已问」只活在本次会话里：面试中的临时进度标记，不值得为它加一列存储
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());

  const dimensions: DimensionConfig[] = candidate.dimensionsOverride ?? job.dimensions;
  const questions = candidate.questions ?? [];
  const hasResume = Boolean(candidate.resumeText?.trim());

  const summary = useMemo(() => summarizeQuestions(questions, dimensions), [questions, dimensions]);
  const allExpanded = questions.length > 0 && expandedIds.size === questions.length;

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function toggleAllExpanded() {
    setExpandedIds(allExpanded ? new Set() : new Set(questions.map((q) => q.id)));
  }

  async function doGenerate() {
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
      // 新题目跟旧的没有对应关系，清掉展开与已问状态
      setExpandedIds(new Set());
      setAskedIds(new Set());
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (questions.length > 0) setRegenerateOpen(true);
    else doGenerate();
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
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {t('questions.needResume')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
          </Button>
          {questions.length > 0 && (
            <Button variant="outline" onClick={handleCopyAll} className="cursor-pointer gap-2">
              <Copy className="h-4 w-4" />
              {t('questions.copyAll')}
            </Button>
          )}
        </div>

        {questions.length > 0 && !generating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAllExpanded}
            className="cursor-pointer gap-2 text-zinc-500"
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
            {allExpanded ? t('questions.collapseAll') : t('questions.expandAll')}
          </Button>
        )}
      </div>

      {questions.length > 0 && !generating && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>
            {t('questions.summary', { count: summary.count, minutes: summary.totalMinutes })}
          </span>
          {summary.byDimension.map((d) => (
            <span key={d.key} className="text-zinc-400">
              {d.label} {d.count}
            </span>
          ))}
        </div>
      )}

      {generating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 py-16 dark:border-zinc-700">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">{t('questions.generating')}</p>
        </div>
      )}

      {!generating && questions.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('questions.empty')}
        </div>
      )}

      {!generating && (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              index={i}
              question={q}
              dimensions={dimensions}
              expanded={expandedIds.has(q.id)}
              onToggleExpanded={() => setExpandedIds((s) => toggle(s, q.id))}
              asked={askedIds.has(q.id)}
              onToggleAsked={() => setAskedIds((s) => toggle(s, q.id))}
              onRemove={() => handleRemove(q.id)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('questions.regenerateConfirm')}</AlertDialogDescription>
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
