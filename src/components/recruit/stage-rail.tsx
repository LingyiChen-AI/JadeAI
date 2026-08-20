'use client';

import { dimensionColor } from '@/lib/recruit/dimension-colors';
import { cn } from '@/lib/utils';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

/**
 * 面试台顶部的进度带。一格一题，颜色即维度——扫一眼就知道
 * 还剩几道、分别是什么类型。点一格跳到那题。
 */
export function StageRail({
  questions,
  dimensions,
  currentIndex,
  onJump,
}: {
  questions: InterviewQuestion[];
  dimensions: DimensionConfig[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const labelOf = (key: string) => dimensions.find((d) => d.key === key)?.label ?? key;

  return (
    <div className="flex min-w-0 flex-1 gap-[3px]">
      {questions.map((q, i) => {
        const answered = Boolean(q.answer?.trim());
        const current = i === currentIndex;
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onJump(i)}
            title={`${i + 1}. ${labelOf(q.dimension)}`}
            aria-label={`${i + 1}. ${labelOf(q.dimension)}`}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'group h-5 min-w-0 flex-1 cursor-pointer',
              // 点击热区给足 5px 高，视觉上只画 4px 的条
              'flex items-center',
            )}
          >
            <span
              className={cn(
                'h-1 w-full rounded-full transition-all group-hover:h-1.5',
                current
                  ? cn(dimensionColor(q.dimension).dot, 'h-1.5')
                  : answered
                    ? cn(dimensionColor(q.dimension).dot, 'opacity-45')
                    : 'bg-zinc-200 dark:bg-zinc-700',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
