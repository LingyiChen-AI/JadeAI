import type { CandidateSummary, InterviewQuestion } from '@/types/recruit';

/**
 * 候选人当前处在哪一步。候选人列表那一行的主按钮由它决定。
 */
export type CandidateStage = 'need_resume' | 'need_questions' | 'interviewing' | 'done';

export interface StageInput {
  resumeText?: string | null;
  questions?: InterviewQuestion[] | null;
  hasEvaluation: boolean;
}

/**
 * 判定顺序是从后往前的，不能反过来：
 * 已经出了评价的人，就算简历被清空了也该停在「看报告」，
 * 而不是被打回「传简历」。
 */
export function candidateStage(input: StageInput): CandidateStage {
  if (input.hasEvaluation) return 'done';
  if (input.questions?.length) return 'interviewing';
  if (input.resumeText?.trim()) return 'need_questions';
  return 'need_resume';
}

/**
 * 列表页那一行用的版本。列表接口为了不回传大 JSON，
 * 只给了布尔和计数，判定规则和上面完全一致。
 */
export function stageFromSummary(c: CandidateSummary): CandidateStage {
  if (c.recommendation !== null) return 'done';
  if (c.questionCount > 0) return 'interviewing';
  if (c.hasResume) return 'need_questions';
  return 'need_resume';
}
