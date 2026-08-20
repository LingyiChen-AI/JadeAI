'use client';

import { useTranslations } from 'next-intl';
import { Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface QuestionCardProps {
  index: number;
  question: InterviewQuestion;
  dimensions: DimensionConfig[];
  onRemove: () => void;
}

export function QuestionCard({ index, question, dimensions, onRemove }: QuestionCardProps) {
  const t = useTranslations('recruit.questions');
  const label = dimensions.find((d) => d.key === question.dimension)?.label ?? question.dimension;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{label}</Badge>
            <Badge className={DIFFICULTY_STYLE[question.difficulty]}>{question.difficulty}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
              <Clock className="h-3 w-3" />
              {t('minutes', { count: question.estimatedMinutes })}
            </span>
          </div>
          <p className="font-medium">
            {index + 1}. {question.question}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} title={t('remove')}>
          <Trash2 className="h-4 w-4 text-zinc-400" />
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-medium text-zinc-500">{t('intent')}</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{question.intent}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-zinc-500">{t('rubric')}</p>
          <div className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="text-emerald-600">{t('excellent')}：</span>
              {question.rubric.excellent}
            </p>
            <p>
              <span className="text-amber-600">{t('pass')}：</span>
              {question.rubric.pass}
            </p>
            <p>
              <span className="text-red-600">{t('fail')}：</span>
              {question.rubric.fail}
            </p>
          </div>
        </div>

        {question.followUps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500">{t('followUps')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
              {question.followUps.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {question.referencePoints.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500">{t('referencePoints')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
              {question.referencePoints.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
