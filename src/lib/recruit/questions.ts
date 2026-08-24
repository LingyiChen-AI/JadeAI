import type { FollowUp, InterviewQuestion, InterviewQuestionStatus } from '@/types/recruit';

function normalizeQuestionStatus(q: InterviewQuestion): InterviewQuestionStatus {
  if (q.status === 'pending' || q.status === 'answered' || q.status === 'skipped') {
    return q.status;
  }
  return q.answer?.trim() ? 'answered' : 'pending';
}

/**
 * 把库里存的题目规整成当前的形状。
 *
 * `followUps` 从 `string[]` 升级成了 `{purpose, question}[]`，但升级之前
 * 生成的题目还躺在库里。zod 的兼容 transform 只在「解析模型输出」时跑，
 * 读库不经过它——所以必须在读取这一侧再兜一次，否则老题目的追问会
 * 显示成一串空行（计数是对的，内容是 undefined）。
 */
export function normalizeFollowUps(raw: unknown): FollowUp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f): FollowUp | null => {
      if (typeof f === 'string') {
        const q = f.trim();
        return q ? { purpose: '', question: q, answer: '' } : null;
      }
      if (f && typeof f === 'object') {
        const o = f as { purpose?: unknown; question?: unknown; answer?: unknown };
        const q = typeof o.question === 'string' ? o.question.trim() : '';
        if (!q) return null;
        return {
          purpose: typeof o.purpose === 'string' ? o.purpose : '',
          question: q,
          answer: typeof o.answer === 'string' ? o.answer : '',
        };
      }
      return null;
    })
    .filter((f): f is FollowUp => f !== null);
}

/** 单道题的规整。只碰会变形的字段，其余原样带过。 */
export function normalizeQuestion(q: InterviewQuestion): InterviewQuestion {
  const category = [
    'go_fundamentals',
    'backend_fundamentals',
    'middleware_database',
    'project_deep_dive',
    'system_scenario',
    'communication_pressure',
    'hr_motivation',
  ].includes(q.category ?? '')
    ? q.category
    : 'project_deep_dive';
  const source = ['resume', 'jd', 'gap'].includes(q.source ?? '') ? q.source : 'resume';

  return {
    ...q,
    category,
    source,
    evidence: typeof q.evidence === 'string' ? q.evidence : '',
    followUps: normalizeFollowUps(q.followUps),
    referencePoints: Array.isArray(q.referencePoints) ? q.referencePoints : [],
    redFlags: Array.isArray(q.redFlags) ? q.redFlags : undefined,
    status: normalizeQuestionStatus(q),
  };
}

export function normalizeQuestions(raw: unknown): InterviewQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as InterviewQuestion[]).map(normalizeQuestion);
}

export function setQuestionAnswer(q: InterviewQuestion, answer: string): InterviewQuestion {
  return { ...q, answer, status: answer.trim() ? 'answered' : 'pending' };
}

export function markQuestionSkipped(q: InterviewQuestion): InterviewQuestion {
  return { ...q, answer: '', status: 'skipped' };
}

export function questionsForEvaluation(questions: InterviewQuestion[]): InterviewQuestion[] {
  return questions.filter((q) => q.status !== 'skipped');
}
