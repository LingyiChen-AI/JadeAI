'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countAnswered } from '@/lib/recruit/answers';
import type { InterviewQuestion } from '@/types/recruit';

const DIFFICULTY_DOT: Record<string, string> = {
  easy: 'bg-emerald-500',
  medium: 'bg-amber-500',
  hard: 'bg-red-500',
};

interface QuestionListProps {
  questions: InterviewQuestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function QuestionList({ questions, selectedId, onSelect }: QuestionListProps) {
  const t = useTranslations('recruit.questions');
  const done = countAnswered(questions);

  return (
    <div className="flex w-full flex-col gap-3 lg:w-[300px] lg:flex-none">
      <nav className="flex flex-col gap-1">
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
              <span
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DIFFICULTY_DOT[q.difficulty])}
              />
            </button>
          );
        })}
      </nav>

      <p className="px-3 text-xs text-zinc-400">
        {t('recorded', { done, total: questions.length })}
      </p>
    </div>
  );
}
