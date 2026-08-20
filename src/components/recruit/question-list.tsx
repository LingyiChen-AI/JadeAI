'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countAnswered } from '@/lib/recruit/answers';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

interface QuestionListProps {
  questions: InterviewQuestion[];
  dimensions: DimensionConfig[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function QuestionList({ questions, dimensions, selectedId, onSelect }: QuestionListProps) {
  const t = useTranslations('recruit.questions');
  const done = countAnswered(questions);
  const labelOf = (key: string) => dimensions.find((d) => d.key === key)?.label ?? key;

  return (
    <div className="flex w-full min-h-0 flex-col gap-2 lg:w-[300px] lg:flex-none">
      {/* 题目多时（十几道很常见）列表自己滚，不把整页撑长 */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {questions.map((q, i) => {
          const answered = Boolean(q.answer?.trim());
          const active = q.id === selectedId;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelect(q.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-brand bg-brand/5 font-medium'
                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]',
                  answered
                    ? 'bg-brand text-white'
                    : 'border border-zinc-300 text-zinc-400 dark:border-zinc-600',
                )}
              >
                {answered ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{q.question}</span>
              {/* 小圆点是维度色，和详情里的维度标签同色——扫一眼列表就知道
                  哪几道是同一类题。难度在详情里有，不值得再占一个颜色通道。 */}
              <span
                title={labelOf(q.dimension)}
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  dimensionColor(q.dimension).dot,
                )}
              />
            </button>
          );
        })}
      </nav>

      <p className="shrink-0 px-3 text-xs text-zinc-400">
        {t('recorded', { done, total: questions.length })}
      </p>
    </div>
  );
}
