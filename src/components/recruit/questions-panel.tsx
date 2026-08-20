'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Copy, Loader2 } from 'lucide-react';
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
import { QuestionList } from './question-list';
import { QuestionDetail, type SaveState } from './question-detail';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { summarizeQuestions } from '@/lib/recruit/summary';
import type {
  DimensionConfig,
  InterviewQuestion,
  RecruitCandidate,
  RecruitJob,
} from '@/types/recruit';

const AUTOSAVE_DELAY = 800;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const dimensions: DimensionConfig[] = candidate.dimensionsOverride ?? job.dimensions;
  const questions = useMemo(() => candidate.questions ?? [], [candidate.questions]);
  const hasResume = Boolean(candidate.resumeText?.trim());
  const summary = useMemo(() => summarizeQuestions(questions, dimensions), [questions, dimensions]);

  // 待保存的答案：key 是题目 id。落库前一直留在这里，
  // 保存失败也不清空——否则面试中输入的内容就真丢了。
  const pendingRef = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 题目变化时把选中项复位到第一题（重新生成、切换候选人都会走到这）
  useEffect(() => {
    if (questions.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && questions.some((q) => q.id === prev) ? prev : questions[0].id));
  }, [questions]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const next = questions.map((q) =>
      pending.has(q.id) ? { ...q, answer: pending.get(q.id) } : q,
    );
    setSaveState('saving');
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
      pending.clear();
      setSaveState('saved');
      onUpdated(data.candidate);
    } catch {
      // 刻意不清 pending：内容还在，用户点重试即可重发
      setSaveState('error');
      toast.error(t('errors.saveFailed'));
    }
  }, [questions, candidate.id, fingerprint, onUpdated, t]);

  const handleAnswerChange = useCallback(
    (questionId: string, answer: string) => {
      pendingRef.current.set(questionId, answer);
      setSaveState('saving');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY);
    },
    [flush],
  );

  // 卸载时清掉定时器，避免对已卸载组件 setState
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

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
      // 题都换了，之前记的答案没有意义，pending 也一并丢弃
      pendingRef.current.clear();
      setSaveState('idle');
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (questions.length > 0) setRegenerateOpen(true);
    else void doGenerate();
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
          q.referenceAnswer?.trim()
            ? `   ${t('questions.referenceAnswer')}：${q.referenceAnswer.trim()}`
            : '',
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

  const selected = questions.find((q) => q.id === selectedId) ?? null;
  const selectedIndex = selected ? questions.findIndex((q) => q.id === selected.id) : -1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
        </Button>
        {questions.length > 0 && (
          <Button variant="outline" onClick={handleCopyAll} className="cursor-pointer gap-2">
            <Copy className="h-4 w-4" />
            {t('questions.copyAll')}
          </Button>
        )}
        {questions.length > 0 && !generating && (
          <span className="text-xs text-zinc-400">
            {t('questions.summary', { count: summary.count, minutes: summary.totalMinutes })}
          </span>
        )}
      </div>

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

      {!generating && questions.length > 0 && (
        // 定高 + 内部滚动，让整块在一屏内放得下。减掉的是页头、步骤条、
        // 工具条那些固定高度；min-h 兜底，避免小屏上被压扁。
        <div className="flex min-h-[420px] flex-col gap-4 lg:h-[calc(100vh-20.5rem)] lg:flex-row lg:items-stretch">
          <QuestionList
            questions={questions}
            dimensions={dimensions}
            selectedId={selectedId}
            // 切题前先把防抖窗口里未落库的输入冲刷掉。QuestionDetail 带
            // key={id} 会整体重挂载，指望它自己在卸载时保存是不可靠的。
            onSelect={(id) => {
              void flush();
              setSelectedId(id);
            }}
          />
          {selected ? (
            <QuestionDetail
              key={selected.id}
              question={selected}
              index={selectedIndex}
              dimensions={dimensions}
              saveState={saveState}
              onAnswerChange={handleAnswerChange}
              onFlush={() => void flush()}
              onRemove={() => handleRemove(selected.id)}
            />
          ) : (
            <div className="flex-1 rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
              {t('questions.selectOne')}
            </div>
          )}
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
              onClick={() => void doGenerate()}
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
