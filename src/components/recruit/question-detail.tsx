'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Loader2, Check, AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const RUBRIC_BAR = {
  excellent: 'bg-emerald-500',
  pass: 'bg-amber-500',
  fail: 'bg-red-500',
} as const;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface QuestionDetailProps {
  question: InterviewQuestion;
  index: number;
  dimensions: DimensionConfig[];
  saveState: SaveState;
  /** 答案变化时调用，父组件负责防抖与落库 */
  onAnswerChange: (questionId: string, answer: string) => void;
  /** 立即保存待存内容——保存失败后点「重试」用 */
  onFlush: () => void;
  onRemove: () => void;
}

export function QuestionDetail({
  question,
  index,
  dimensions,
  saveState,
  onAnswerChange,
  onFlush,
  onRemove,
}: QuestionDetailProps) {
  const t = useTranslations('recruit.questions');
  const label = dimensions.find((d) => d.key === question.dimension)?.label ?? question.dimension;
  // 父组件用 key={question.id} 渲染本组件，切题即重挂载，
  // 所以草稿用 useState 初始化就够，不需要 effect 同步。
  // 切题时冲刷未保存内容的责任在父组件的 onSelect 里。
  const [draft, setDraft] = useState(question.answer ?? '');
  const [answerOpen, setAnswerOpen] = useState(false);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-white dark:bg-zinc-900">
      {/* 细则区可滚，答案区钉在下面——面试中输入框必须始终在眼前 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <h3 className="text-[15px] font-semibold leading-relaxed">
        {index + 1}. {question.question}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* 和左侧列表里的小圆点同色 */}
        <Badge variant="outline" className={dimensionColor(question.dimension).chip}>
          {label}
        </Badge>
        <span className="text-xs text-zinc-400">
          {question.difficulty} · {t('minutes', { count: question.estimatedMinutes })}
        </span>
      </div>

      <Section title={t('intent')}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{question.intent}</p>
      </Section>

      <Section title={t('rubric')}>
        <div className="grid gap-1.5">
          {(['excellent', 'pass', 'fail'] as const).map((level) => (
            <div key={level} className="flex gap-2">
              <span className={cn('w-0.5 shrink-0 rounded-full', RUBRIC_BAR[level])} />
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-500 dark:text-zinc-400">{t(level)}：</span>
                {question.rubric[level]}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* 参考答案只有客观题才有，开放题模型会留空。默认收起——
          面试时先听候选人怎么说，需要对照再展开。 */}
      {question.referenceAnswer?.trim() && (
        <div className="mt-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setAnswerOpen((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform', answerOpen && 'rotate-90')}
            />
            {t('referenceAnswer')}
          </button>
          {answerOpen && (
            <p className="whitespace-pre-wrap border-t px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              {question.referenceAnswer}
            </p>
          )}
        </div>
      )}

      {/* 追问和要点都是短列表，并排放省掉一屏的一半高度 */}
      {(question.followUps.length > 0 || question.referencePoints.length > 0) && (
        <div className="grid gap-x-6 sm:grid-cols-2">
          {question.followUps.length > 0 && (
            <Section title={t('followUps')}>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                {question.followUps.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Section>
          )}

          {question.referencePoints.length > 0 && (
            <Section title={t('referencePoints')}>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                {question.referencePoints.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
      </div>

      <div className="shrink-0 border-t p-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="answer" className="text-sm font-medium">
            {t('answer')}
          </Label>
          <SaveIndicator state={saveState} onRetry={onFlush} />
        </div>
        <Textarea
          id="answer"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onAnswerChange(question.id, e.target.value);
          }}
          placeholder={t('answerPlaceholder')}
          // Textarea 带 field-sizing-content，rows 无效，必须用 min-h。
          // 钉底之后这块占的是固定版面，不宜太高。
          className="mt-2 max-h-[220px] min-h-[104px]"
        />

        <div className="mt-1.5 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-7 cursor-pointer gap-1.5 text-xs text-zinc-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('remove')}
          </Button>
        </div>
      </div>
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

/** 小标题弱化、正文正常，四个区块才有层次。 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}
