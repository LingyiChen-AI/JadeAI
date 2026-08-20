'use client';

import { useTranslations } from 'next-intl';
import { Trash2, Clock, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const DIFFICULTY_DOT: Record<string, string> = {
  easy: 'bg-emerald-500',
  medium: 'bg-amber-500',
  hard: 'bg-red-500',
};

const RUBRIC_BAR: Record<'excellent' | 'pass' | 'fail', string> = {
  excellent: 'bg-emerald-500',
  pass: 'bg-amber-500',
  fail: 'bg-red-500',
};

interface QuestionCardProps {
  index: number;
  question: InterviewQuestion;
  dimensions: DimensionConfig[];
  expanded: boolean;
  onToggleExpanded: () => void;
  asked: boolean;
  onToggleAsked: () => void;
  onRemove: () => void;
}

export function QuestionCard({
  index,
  question,
  dimensions,
  expanded,
  onToggleExpanded,
  asked,
  onToggleAsked,
  onRemove,
}: QuestionCardProps) {
  const t = useTranslations('recruit.questions');
  const label = dimensions.find((d) => d.key === question.dimension)?.label ?? question.dimension;

  return (
    <Card className="overflow-hidden p-0">
      {/* 折叠行：面试中一屏要能扫完，所以只放题干和最必要的元信息 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleAsked}
          title={t('asked')}
          className={cn(
            'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors',
            asked
              ? 'border-brand bg-brand text-white'
              : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600',
          )}
        >
          {asked && <Check className="h-3 w-3" />}
        </button>

        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm font-medium',
              asked && 'text-zinc-400 line-through dark:text-zinc-500',
            )}
          >
            {index + 1}. {question.question}
          </span>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
            {label}
          </Badge>
          <span className="hidden shrink-0 items-center gap-1 text-xs text-zinc-400 sm:inline-flex">
            <span className={cn('h-1.5 w-1.5 rounded-full', DIFFICULTY_DOT[question.difficulty])} />
            <Clock className="h-3 w-3" />
            {t('minutes', { count: question.estimatedMinutes })}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-zinc-400 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t bg-zinc-50/50 px-4 py-4 dark:bg-zinc-900/50">
          <Section title={t('intent')}>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{question.intent}</p>
          </Section>

          <Section title={t('rubric')}>
            <div className="space-y-1.5">
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

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="cursor-pointer gap-2 text-zinc-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              {t('remove')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** 小标题弱化、正文正常，四个区块才有层次；原来全是同色同字号的灰字堆叠。 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}
