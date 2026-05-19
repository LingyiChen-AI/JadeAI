'use client';

import { useTranslations } from 'next-intl';
import { Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import type { InterviewSession } from '@/types/interview';

const AVATAR_GRADIENTS: Record<string, string> = {
  hr: 'from-brand to-brand-hover',
  technical: 'from-blue-500 to-blue-400',
  scenario: 'from-amber-500 to-amber-400',
  behavioral: 'from-purple-500 to-purple-400',
  project_deep_dive: 'from-green-500 to-green-400',
  leader: 'from-slate-600 to-slate-500',
};

const TAG_STYLES: Record<string, string> = {
  hr: 'bg-brand-muted text-brand dark:bg-brand-muted dark:text-brand',
  technical: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  scenario: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  behavioral: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
  project_deep_dive: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300',
  leader: 'bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-300',
};

const STATUS_DOT: Record<string, string> = {
  preparing: 'bg-brand',
  in_progress: 'bg-brand',
  paused: 'bg-brand',
  completed: 'bg-brand',
};

const PROGRESS_BAR: Record<string, string> = {
  preparing: 'bg-brand',
  in_progress: 'bg-brand',
  paused: 'bg-brand',
  completed: 'bg-brand',
};

function getGradeColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 75) return 'text-blue-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

interface InterviewCardProps {
  session: InterviewSession;
  onDelete: (id: string) => void;
}

export function InterviewCard({ session, onDelete }: InterviewCardProps) {
  const t = useTranslations('interview');
  const interviewers = session.selectedInterviewers as any[];
  const isCompleted = session.status === 'completed';
  const currentRound = session.currentRound ?? 0;
  const totalRounds = interviewers.length;
  const progressPercent = isCompleted ? 100 : totalRounds > 0 ? (currentRound / totalRounds) * 100 : 0;

  // For completed sessions, we'd need the score from the report
  // For now we show progress info
  const score = (session as any).report?.overallScore;

  return (
    <div className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header: dot + title + score/status */}
      <div className="mb-2 flex items-center gap-2">
        <div className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[session.status] || 'bg-zinc-400', session.status === 'in_progress' && 'animate-pulse')} />
        <span className="flex-1 truncate text-[15px] font-bold">{session.jobTitle || 'Untitled'}</span>
        {isCompleted && score != null ? (
          <div className="flex items-baseline gap-0.5">
            <span className={cn('text-xl font-extrabold', getGradeColor(score))}>{score}</span>
            <span className="text-[10px] text-zinc-400">/100</span>
          </div>
        ) : (
          <span className="text-[10px] font-medium text-zinc-400">{t(`lobby.status.${session.status}`)}</span>
        )}
      </div>

      {/* JD preview */}
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-zinc-500">
        {session.jobDescription.slice(0, 120)}...
      </p>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between">
          <span className="text-[10px] text-zinc-400">面试进度</span>
          <span className={cn('text-[10px] font-medium', isCompleted ? 'text-green-600' : 'text-zinc-500')}>
            {isCompleted ? `${totalRounds}/${totalRounds} 轮 · 已完成` : `${currentRound}/${totalRounds} 轮`}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={cn('h-full rounded-full transition-all', PROGRESS_BAR[session.status] || 'bg-zinc-400')}
            style={{ width: `${Math.max(progressPercent, 5)}%` }}
          />
        </div>
      </div>

      {/* Interviewer tags */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {interviewers.map((iv: any, i: number) => {
          const type = iv.type?.startsWith('custom_') ? 'custom' : iv.type;
          const gradient = AVATAR_GRADIENTS[type] || 'from-zinc-500 to-zinc-400';
          const tagStyle = TAG_STYLES[type] || 'bg-zinc-50 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
          const isDone = isCompleted || i < currentRound;
          const isCurrent = !isCompleted && i === currentRound;

          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-1 rounded-md px-1.5 py-0.5',
                tagStyle,
                isCurrent && 'ring-1 ring-blue-400'
              )}
            >
              <div className={cn('flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br text-[7px] font-bold text-white', gradient)}>
                {iv.name?.[0] || '?'}
              </div>
              <span className="text-[10px]">
                {t(`interviewers.${type}` as any)}
                {isDone && <Check className="ml-0.5 inline h-2.5 w-2.5" />}
                {isCurrent && <span className="ml-0.5 font-semibold">·当前</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action + date + delete */}
      <div className="flex items-center gap-2">
        {isCompleted ? (
          <>
            <Link href={`/interview/${session.id}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full rounded-lg border-brand-muted text-xs text-brand hover:bg-brand-muted dark:border-brand-muted dark:text-brand dark:hover:bg-brand-muted">
                {t('lobby.viewRecord')}
              </Button>
            </Link>
            <Link href={`/interview/${session.id}/report`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full rounded-lg border-brand-muted text-xs text-brand hover:bg-brand-muted dark:border-brand-muted dark:text-brand dark:hover:bg-brand-muted">
                {t('lobby.viewReport')}
              </Button>
            </Link>
          </>
        ) : (
          <Link href={`/interview/${session.id}`} className="flex-1">
            <Button size="sm" className="w-full rounded-lg bg-brand text-xs hover:bg-brand-hover">
              {session.status === 'preparing' ? t('lobby.start') : t('lobby.continue')}
            </Button>
          </Link>
        )}
        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
          {new Date(session.createdAt).toLocaleDateString()}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.preventDefault();
            onDelete(session.id);
          }}
          className="text-zinc-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
