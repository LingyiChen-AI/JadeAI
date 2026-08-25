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
  Sparkles,
  Eye,
  EyeOff,
  SkipForward,
  Ban,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import { countAnswered, countSkipped } from '@/lib/recruit/answers';
import { markQuestionSkipped, setQuestionAnswer } from '@/lib/recruit/questions';
import { cn } from '@/lib/utils';
import type {
  InterviewQuestion,
  RecruitCandidate,
  RecruitJob,
} from '@/types/recruit';

const AUTOSAVE_DELAY = 800;
const ANSWERS_KEY = 'jade-stage-show-answers';

const RUBRIC_TEXT = {
  excellent: 'text-emerald-600 dark:text-emerald-400',
  pass: 'text-amber-600 dark:text-amber-500',
  fail: 'text-red-600 dark:text-red-400',
} as const;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function InterviewStage({
  jobId,
  candidateId,
  readOnly = false,
}: {
  jobId: string;
  candidateId: string;
  readOnly?: boolean;
}) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [candidate, setCandidate] = useState<RecruitCandidate | null>(null);
  const [job, setJob] = useState<RecruitJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  /**
   * 一个开关控制所有参考答案：追问的答案 + 主参考答案。
   *
   * 默认开。之前默认关，理由是「先听人说再对照」——那是想当然：
   * 面试官记不住所有领域的知识点，答案本来就该在眼前，
   * 需要遮住的时候再关。选择存 localStorage，不是每题重设。
   */
  const [showAnswers, setShowAnswers] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(ANSWERS_KEY);
    if (saved !== null) setShowAnswers(saved === '1');
  }, []);

  function toggleAnswers() {
    setShowAnswers((v) => {
      localStorage.setItem(ANSWERS_KEY, v ? '0' : '1');
      return !v;
    });
  }

  const questions = useMemo(() => candidate?.questions ?? [], [candidate?.questions]);
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
        const firstBlank = qs.findIndex((q) => q.status !== 'skipped' && !q.answer?.trim());
        const start = readOnly || firstBlank === -1 ? 0 : firstBlank;
        setIndex(start);
        setDraft(qs[start]?.answer ?? '');
      } catch {
        toast.error(t('errors.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, [fpLoading, fingerprint, candidateId, readOnly, t]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const next = questionsRef.current.map((q) =>
      pending.has(q.id) ? setQuestionAnswer(q, pending.get(q.id) ?? '') : q,
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
    if (!current || readOnly) return;
    setDraft(value);
    pendingRef.current.set(current.id, value);
    setCandidate((prev) => prev && {
      ...prev,
      questions: (prev.questions ?? []).map((q) =>
        q.id === current.id ? setQuestionAnswer(q, value) : q,
      ),
    });
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
    },
    [flush],
  );

  const exit = useCallback(async () => {
    await flush();
    router.push(`/recruit/${jobId}`);
  }, [flush, router, jobId]);

  const finish = useCallback(async () => {
    if (readOnly) {
      router.push(`/recruit/${jobId}/c/${candidateId}/report`);
      return;
    }
    await flush();
    router.push(`/recruit/${jobId}/c/${candidateId}/report`);
  }, [flush, router, jobId, candidateId, readOnly]);

  async function doRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}/questions`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('generate failed');
      const data = await res.json();
      // 题都换了，之前记的答案没有意义，防抖窗口里待存的也一并丢弃，
      // 否则它会把旧答案写回到新题目上
      pendingRef.current.clear();
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaveState('idle');
      setCandidate(data.candidate);
      setIndex(0);
      setDraft('');
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setRegenerating(false);
    }
  }

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
        <Button onClick={() => setRegenerateOpen(true)} className="cursor-pointer gap-1.5">
          <Sparkles className="h-4 w-4" />
          {t('questions.generate')}
        </Button>
      </div>
    );
  }

  const done = countAnswered(questions);
  const skipped = countSkipped(questions);
  // 新题目给 referenceAnswer，老题目只有 referencePoints，两者都算「有正面参考」
  const hasAnswerBody =
    Boolean(current.referenceAnswer?.trim()) || current.referencePoints.length > 0;
  const color = dimensionColor(current.dimension);

  return (
    <div className={shell}>
      <header className="flex shrink-0 items-center gap-4 border-b bg-white px-5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="shrink-0 text-sm font-semibold">{candidate.name}</span>
        {/* 第几题和已记几道左栏都有，这里只留时间 */}
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
          {t('stage.elapsed', { minutes: elapsed })}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {readOnly ? (
            <Button size="sm" variant="outline" onClick={() => void finish()} className="cursor-pointer">
              {t('stage.backToReport')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => setRegenerateOpen(true)}
                disabled={regenerating}
                className="cursor-pointer gap-1.5"
              >
                {regenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {regenerating ? t('questions.generating') : t('questions.regenerate')}
              </Button>
              <Button
                size="sm"
                onClick={() => void finish()}
                className="cursor-pointer bg-red-600 text-white hover:bg-red-700"
              >
                {t('stage.finish')}
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => void exit()}
            aria-label={t('stage.exit')}
            className="cursor-pointer rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </header>

      {/* 控制台：什么都不折叠。左栏列出全部题目（色点即维度、勾即已记），
          右侧题干、评分标准三栏、追问与要点全部铺开。
          用网格线而不是圆角盒子分区——密度高，但眼睛有格可循。 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav className="shrink-0 overflow-y-auto border-b bg-zinc-50 py-3 dark:border-zinc-800 dark:bg-zinc-950 lg:w-[300px] lg:border-b-0 lg:border-r">
          <p className="px-4 pb-2 text-[10.5px] uppercase tracking-wider text-zinc-400">
            {skipped > 0
              ? t('questions.recordedWithSkipped', { done, skipped, total: questions.length })
              : t('questions.recorded', { done, total: questions.length })}
          </p>
          {questions.map((q, i) => {
            const answered = q.status !== 'skipped' && Boolean(q.answer?.trim());
            const on = i === index;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 px-4 py-1.5 text-left text-[12.5px]',
                  on
                    ? 'bg-white font-semibold text-zinc-900 shadow-[inset_2px_0_0_var(--brand)] dark:bg-zinc-900 dark:text-zinc-50'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dimensionColor(q.dimension).dot)}
                />
                <span className="w-4 shrink-0 text-right tabular-nums text-zinc-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{q.question}</span>
                {q.status === 'skipped'
                  ? <Ban className="h-3 w-3 shrink-0 text-zinc-400" />
                  : answered && <Check className="h-3 w-3 shrink-0 text-brand" />}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
          <div className="flex shrink-0 items-center gap-2.5 border-b px-6 py-2.5 text-xs text-zinc-500 dark:border-zinc-800">
            {current.category && (
              <Badge variant="outline" className={color.chip}>
                <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', color.dot)} />
                {t(`questions.categories.${current.category}`)}
              </Badge>
            )}
            <span>
              {current.difficulty} · {t('questions.minutes', { count: current.estimatedMinutes })}
            </span>
            <span className="ml-auto flex items-center gap-3">
              <SaveIndicator state={saveState} onRetry={() => void flush()} />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  aria-label={t('questions.remove')}
                  className="cursor-pointer text-zinc-300 hover:text-red-600 dark:text-zinc-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-6 py-5">
              <h1 className="text-[19px] font-semibold leading-[1.65] tracking-[-0.01em]">
                {current.question}
              </h1>
              {current.intent && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">{current.intent}</p>
              )}
            </div>

            <div className="grid border-y dark:border-zinc-800 sm:grid-cols-3">
              {(['excellent', 'pass', 'fail'] as const).map((level) => (
                <div
                  key={level}
                  className="border-b px-5 py-3 last:border-b-0 dark:border-zinc-800 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <p className={cn('text-[10.5px] font-semibold uppercase tracking-wider', RUBRIC_TEXT[level])}>
                    {t(`questions.${level}`)}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {current.rubric[level]}
                  </p>
                </div>
              ))}
            </div>

            {current.followUps.length > 0 && (
              <div className="border-b px-5 py-3 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <p className="text-[10.5px] uppercase tracking-wider text-zinc-400">
                    {t('questions.followUps')} · {current.followUps.length}
                  </p>
                  <button
                    type="button"
                    onClick={toggleAnswers}
                    className={cn(
                      'ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                      showAnswers
                        ? 'border-brand/40 bg-brand/10 text-brand'
                        : 'border-zinc-200 text-zinc-500 hover:text-zinc-800 dark:border-zinc-700 dark:hover:text-zinc-200',
                    )}
                  >
                    {showAnswers ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {showAnswers ? t('questions.hideAnswers') : t('questions.showAnswers')}
                  </button>
                </div>
                {/* 追问是一条阶梯，按目的分档——这是深度真正的来源 */}
                <ol className="mt-1.5 space-y-2">
                  {current.followUps.map((f, i) => (
                    <li key={i} className="text-[12.5px] leading-relaxed">
                      <div className="flex gap-2.5">
                        {f.purpose && (
                          <span className="mt-[3px] shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {f.purpose}
                          </span>
                        )}
                        <span className="text-zinc-700 dark:text-zinc-300">{f.question}</span>
                      </div>
                      {showAnswers && f.answer?.trim() && (
                        <p className="mt-1 border-l-2 border-brand/40 pl-2.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {f.answer}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* 正面（参考答案）和负面（危险信号）并排。之前「参考答案要点」和
                「参考答案」两个名字差两个字、内容重叠还挨着，是没清理干净的重复。 */}
            {(hasAnswerBody || (current.redFlags?.length ?? 0) > 0) && (
              <div className="grid border-b dark:border-zinc-800 sm:grid-cols-2">
                {showAnswers && hasAnswerBody && (
                  <div className="border-b bg-brand/[0.04] px-5 py-3 last:border-b-0 dark:border-zinc-800 sm:border-b-0 sm:border-r">
                    <p className="text-[10.5px] uppercase tracking-wider text-brand">
                      {t('questions.referenceAnswer')}
                    </p>
                    {current.referenceAnswer?.trim() ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {current.referenceAnswer}
                      </p>
                    ) : (
                      // 老题目只有 referencePoints，顶上来占这个位置，不另起一个标题
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {current.referencePoints.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {(current.redFlags?.length ?? 0) > 0 && (
                  <Col
                    title={t('questions.redFlags')}
                    count={current.redFlags!.length}
                    tone="bad"
                  >
                    {current.redFlags!.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </Col>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t bg-zinc-50 px-6 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
            <Textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              placeholder={readOnly ? t('stage.noRecord') : t('questions.answerPlaceholder')}
              readOnly={readOnly}
              autoFocus={!readOnly}
              // 五行。再高就是在假设你要写逐字稿了
              className="max-h-[40vh] min-h-[132px] bg-white text-[15px] leading-relaxed dark:bg-zinc-900"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="cursor-pointer gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('stage.prev')}
              </Button>
              {!readOnly && (
                <Button
                  variant="outline"
                  onClick={() => void handleSkipToggle()}
                  className="cursor-pointer gap-1.5 text-zinc-600"
                >
                  <SkipForward className="h-4 w-4" />
                  {current.status === 'skipped' ? t('stage.unskip') : t('stage.skip')}
                </Button>
              )}
              <Button
                onClick={() => (isLast ? void finish() : goTo(index + 1))}
                className="cursor-pointer gap-1.5"
              >
                {readOnly
                  ? isLast
                    ? t('stage.backToReport')
                    : t('stage.next')
                  : isLast
                    ? t('stage.recordFinish')
                    : t('stage.recordNext')}
                {!isLast && <ChevronRight className="h-4 w-4" />}
              </Button>
              {!readOnly && (
                <span className="ml-auto flex items-center gap-2 text-[11px] text-zinc-400">
                  <Kbd>⌘↵</Kbd> {t('stage.shortcutNext')}
                  <Kbd>esc</Kbd> {t('stage.shortcutExit')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('questions.regenerate')}</AlertDialogTitle>
            <AlertDialogDescription>{t('questions.regenerateConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doRegenerate()} className="cursor-pointer">
              {tc('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  async function handleSkipToggle() {
    if (!current) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const unskip = current.status === 'skipped';
    const next = questionsRef.current.map((q) => {
      if (q.id === current.id) return unskip ? setQuestionAnswer(q, '') : markQuestionSkipped(q);
      const pending = pendingRef.current.get(q.id);
      return pending === undefined ? q : setQuestionAnswer(q, pending);
    });

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
      pendingRef.current.clear();
      setCandidate(data.candidate);
      setSaveState('saved');
      setDraft('');
      if (!unskip && !isLast) {
        setIndex(index + 1);
      }
    } catch {
      // 跳过是一次显式动作，不复用答案自动保存的“重试”按钮；保存失败时
      // 保持当前题和草稿不动，面试官可以直接再次点击跳过。
      setSaveState('idle');
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

/** 网格里的一格：小标题 + 列表。用边框分格，不用圆角盒。 */
function Col({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  /** "bad" 用于危险信号：红色小标题，扫到就知道是负面清单 */
  tone?: 'bad';
  children: React.ReactNode;
}) {
  return (
    <div className="border-b px-5 py-3 last:border-b-0 dark:border-zinc-800 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p
        className={cn(
          'text-[10.5px] uppercase tracking-wider',
          tone === 'bad' ? 'text-red-500' : 'text-zinc-400',
        )}
      >
        {title} · {count}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </ul>
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
