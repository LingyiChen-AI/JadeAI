'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  AlertCircle,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StageRail } from './stage-rail';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import { cn } from '@/lib/utils';
import type {
  DimensionConfig,
  InterviewQuestion,
  RecruitCandidate,
  RecruitJob,
} from '@/types/recruit';

const AUTOSAVE_DELAY = 800;

const RUBRIC_BAR = {
  excellent: 'bg-emerald-500',
  pass: 'bg-amber-500',
  fail: 'bg-red-500',
} as const;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function InterviewStage({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const t = useTranslations('recruit');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [candidate, setCandidate] = useState<RecruitCandidate | null>(null);
  const [job, setJob] = useState<RecruitJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [answerOpen, setAnswerOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const questions = useMemo(() => candidate?.questions ?? [], [candidate?.questions]);
  const dimensions: DimensionConfig[] =
    candidate?.dimensionsOverride ?? (job?.dimensions as DimensionConfig[]) ?? [];
  const current = questions[index];

  // 待保存的答案。落库前一直留在这里，保存失败也不清空——
  // 否则面试中输入的内容就真丢了。
  const pendingRef = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionsRef = useRef<InterviewQuestion[]>([]);
  questionsRef.current = questions;

  // 计时只是个参考，不落库；刷新会归零，可以接受
  const startedAtRef = useRef(0);
  useEffect(() => {
    startedAtRef.current = performance.now();
    const id = setInterval(
      () => setElapsed(Math.floor((performance.now() - startedAtRef.current) / 60000)),
      20000,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (fpLoading) return;
    (async () => {
      try {
        const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
          headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
        });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        setCandidate(data.candidate);
        setJob(data.job);
        // 从第一道还没记答案的题开始，「继续面试」才名副其实
        const qs: InterviewQuestion[] = data.candidate.questions ?? [];
        const firstBlank = qs.findIndex((q) => !q.answer?.trim());
        const start = firstBlank === -1 ? 0 : firstBlank;
        setIndex(start);
        setDraft(qs[start]?.answer ?? '');
      } catch {
        toast.error(t('errors.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, [fpLoading, fingerprint, candidateId, t]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const next = questionsRef.current.map((q) =>
      pending.has(q.id) ? { ...q, answer: pending.get(q.id) } : q,
    );
    setSaveState('saving');
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
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
      setCandidate(data.candidate);
    } catch {
      // 刻意不清 pending：内容还在，点重试即可重发
      setSaveState('error');
      toast.error(t('errors.saveFailed'));
    }
  }, [candidateId, fingerprint, t]);

  function handleDraftChange(value: string) {
    if (!current) return;
    setDraft(value);
    pendingRef.current.set(current.id, value);
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY);
  }

  /** 切题前一定要先冲刷防抖窗口，否则最后敲的那句话跟着题一起没了 */
  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(questionsRef.current.length - 1, nextIndex));
      void flush();
      setIndex(clamped);
      setDraft(questionsRef.current[clamped]?.answer ?? '');
      setAnswerOpen(false);
    },
    [flush],
  );

  const exit = useCallback(async () => {
    await flush();
    router.push(`/recruit/${jobId}`);
  }, [flush, router, jobId]);

  const finish = useCallback(async () => {
    await flush();
    router.push(`/recruit/${jobId}/c/${candidateId}/report`);
  }, [flush, router, jobId, candidateId]);

  const isLast = index >= questions.length - 1;

  // 面试中手在键盘上，不该为了下一题去找鼠标
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        e.preventDefault();
        void exit();
      } else if (meta && e.key === 'Enter') {
        e.preventDefault();
        if (isLast) void finish();
        else goTo(index + 1);
      } else if (meta && e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index + 1);
      } else if (meta && e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(index - 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, isLast, goTo, exit, finish]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // 全屏盖住顶部导航。不盖的话「专注」是假的——屏幕上还挂着
  // 「工作台/模板/面试模拟」，人就还在一个通用页面里。
  const shell = 'fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950';

  if (loading) {
    return (
      <div className={shell}>
        <div className="space-y-4 p-8">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!candidate || !job) return null;

  if (questions.length === 0) {
    return (
      <div className={cn(shell, 'items-center justify-center gap-4')}>
        <p className="text-sm text-zinc-500">{t('stage.empty')}</p>
        <Button
          onClick={() => router.push(`/recruit/${jobId}/c/${candidateId}/prep`)}
          className="cursor-pointer"
        >
          {t('stage.goPrep')}
        </Button>
      </div>
    );
  }

  const color = dimensionColor(current.dimension);
  const label = dimensions.find((d) => d.key === current.dimension)?.label ?? current.dimension;

  return (
    <div className={shell}>
      <header className="flex shrink-0 items-center gap-4 border-b bg-white px-5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="shrink-0 text-sm font-semibold">{candidate.name}</span>
        <StageRail
          questions={questions}
          dimensions={dimensions}
          currentIndex={index}
          onJump={goTo}
        />
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
          {/* 记了几道靠进度带的颜色看，这里再写一遍 n/m 就是重复 */}
          {index + 1} / {questions.length} · {t('stage.elapsed', { minutes: elapsed })}
        </span>
        <Button variant="outline" size="sm" onClick={() => void finish()} className="shrink-0 cursor-pointer">
          {t('stage.finish')}
        </Button>
        <button
          type="button"
          onClick={() => void exit()}
          aria-label={t('stage.exit')}
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* 整块内容限宽后一起居中。之前是左栏内部 mx-auto，于是在 1580px 宽的
          主区里内容只占 670px，左右各空 455px，加上侧栏就成了四段式，很散。 */}
      <div className="mx-auto flex w-full min-h-0 max-w-[1180px] flex-1 flex-col gap-5 px-5 py-5 lg:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-white px-7 py-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className={color.chip}>
              <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', color.dot)} />
              {label}
            </Badge>
            <span className="text-xs text-zinc-400">
              {current.difficulty} · {t('questions.minutes', { count: current.estimatedMinutes })}
            </span>
            <span className="ml-auto">
              <SaveIndicator state={saveState} onRetry={() => void flush()} />
            </span>
          </div>

          {/* 题干可能很长（十几行的场景真实存在），单独给它一段可滚区域，
              不让它把答案框挤出屏幕 */}
          <h1 className="mt-3 max-h-[38vh] shrink-0 overflow-y-auto text-[20px] font-semibold leading-[1.6] tracking-[-0.01em]">
            {current.question}
          </h1>

          {/* 答案框吃掉剩下的全部高度。固定高度会在底部留一大片空白 */}
          <Textarea
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            placeholder={t('questions.answerPlaceholder')}
            autoFocus
            className="mt-4 min-h-[160px] flex-1 resize-none border-2 border-brand bg-white text-[15px] leading-relaxed focus-visible:ring-0 dark:bg-zinc-900"
          />

          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className="cursor-pointer gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('stage.prev')}
            </Button>
            <Button
              onClick={() => (isLast ? void finish() : goTo(index + 1))}
              className="cursor-pointer gap-1.5"
            >
              {isLast ? t('stage.recordFinish') : t('stage.recordNext')}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>

            <span className="ml-auto flex items-center gap-2 text-[11px] text-zinc-400">
              <Kbd>⌘↵</Kbd> {t('stage.shortcutNext')}
              <Kbd>esc</Kbd> {t('stage.shortcutExit')}
            </span>
          </div>
        </main>

        <aside className="min-h-0 shrink-0 overflow-y-auto rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 lg:w-[330px]">
          {/* 考察点挪到这里。它是给面试官瞟的元信息，不是要念的，
              压在题干下面就成了第二堵墙 */}
          {current.intent && (
            <Section title={t('questions.intent')}>
              <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {current.intent}
              </p>
            </Section>
          )}

          <Section title={t('questions.rubric')}>
            <div className="grid gap-2">
              {(['excellent', 'pass', 'fail'] as const).map((level) => (
                <div key={level} className="flex gap-2">
                  <span className={cn('w-0.5 shrink-0 rounded-full', RUBRIC_BAR[level])} />
                  <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {t(`questions.${level}`)}：
                    </span>
                    {current.rubric[level]}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {current.followUps.length > 0 && (
            <Section title={t('questions.followUps')}>
              <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                {current.followUps.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Section>
          )}

          {current.referencePoints.length > 0 && (
            <Section title={t('questions.referencePoints')}>
              <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                {current.referencePoints.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* 参考答案默认折叠——先听候选人怎么说 */}
          {current.referenceAnswer?.trim() && (
            <div className="mt-4 rounded-lg border dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setAnswerOpen((v) => !v)}
                className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <ChevronRight
                  className={cn('h-3.5 w-3.5 transition-transform', answerOpen && 'rotate-90')}
                />
                {t('questions.referenceAnswer')}
              </button>
              {answerOpen && (
                <p className="whitespace-pre-wrap border-t px-3 py-2 text-[13px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                  {current.referenceAnswer}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleRemove()}
            className="mt-5 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('questions.remove')}
          </button>
        </aside>
      </div>
    </div>
  );

  async function handleRemove() {
    if (!current) return;
    const next = questionsRef.current.filter((q) => q.id !== current.id);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ questions: next }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      pendingRef.current.delete(current.id);
      setCandidate(data.candidate);
      // 删的是最后一题就往前退一格，否则原地停留即可（后面的题会顶上来）
      const nextIndex = Math.min(index, next.length - 1);
      setIndex(Math.max(0, nextIndex));
      setDraft(next[Math.max(0, nextIndex)]?.answer ?? '');
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800">
      {children}
    </kbd>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useTranslations('recruit.questions');
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('saving')}
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <Check className="h-3.5 w-3.5 text-brand" />
        {t('saved')}
      </span>
    );
  }
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-red-600"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {t('saveRetry')}
      </button>
    );
  }
  return <span />;
}
