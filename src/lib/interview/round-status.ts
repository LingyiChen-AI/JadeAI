import type { InterviewRoundStatus, InterviewSessionStatus } from '@/types/interview';

/**
 * Whether a round should be shown in read-only history mode.
 *
 * A completed session is always view-only, regardless of round status:
 * rounds finished via the AI's [ROUND_COMPLETE] marker may still be
 * 'in_progress' in the DB (legacy data), so round status alone is not enough.
 */
export function isRoundViewOnly(
  roundStatus: InterviewRoundStatus | undefined,
  sessionStatus: string | undefined,
): boolean {
  if ((sessionStatus as InterviewSessionStatus) === 'completed') return true;
  return roundStatus === 'completed' || roundStatus === 'skipped';
}
