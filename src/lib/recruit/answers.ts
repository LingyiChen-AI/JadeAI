import type { InterviewQuestion } from '@/types/recruit';

/**
 * 已记录答案的题数。空白字符不算——面试官点进某题又退出来时，
 * 输入框可能留下空格，那不该算「记过了」。
 */
export function countAnswered(questions: InterviewQuestion[]): number {
  return questions.filter((q) => q.status !== 'skipped' && Boolean(q.answer?.trim())).length;
}

export function countSkipped(questions: InterviewQuestion[]): number {
  return questions.filter((q) => q.status === 'skipped').length;
}

/**
 * 是否至少有一道题记了答案。
 *
 * 评估接口用它放宽前置校验：只逐题记录、不粘贴整段记录是完全合理的用法，
 * 不该因为 transcript 为空就拒绝。
 */
export function hasAnyAnswer(questions: InterviewQuestion[]): boolean {
  return questions.some((q) => q.status !== 'skipped' && Boolean(q.answer?.trim()));
}
