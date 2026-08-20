import type { CandidateSummary, DimensionConfig, InterviewQuestion } from '@/types/recruit';

export interface DimensionCount {
  key: string;
  label: string;
  count: number;
}

export interface QuestionsSummary {
  count: number;
  totalMinutes: number;
  byDimension: DimensionCount[];
}

/**
 * 面试题 Tab 顶部概览条的数据。
 *
 * 维度顺序跟随岗位配置而不是题目出现顺序——面试官配的时候是那个顺序，
 * 看统计时顺序一致才对得上。配置外的维度（模型偶尔会返回意外 key）
 * 追加在后面，不丢。
 */
export function summarizeQuestions(
  questions: InterviewQuestion[],
  dimensions: DimensionConfig[],
): QuestionsSummary {
  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.dimension, (counts.get(q.dimension) ?? 0) + 1);
  }

  const byDimension: DimensionCount[] = [];
  for (const d of dimensions) {
    const count = counts.get(d.key);
    if (count) {
      byDimension.push({ key: d.key, label: d.label, count });
      counts.delete(d.key);
    }
  }
  // 配置里没有的维度，label 退化成 key
  for (const [key, count] of counts) {
    byDimension.push({ key, label: key, count });
  }

  return {
    count: questions.length,
    totalMinutes: questions.reduce((sum, q) => sum + q.estimatedMinutes, 0),
    byDimension,
  };
}

/**
 * 左栏候选人排序：总分降序，未评价的沉底。
 *
 * 未评价的混在中间，横向对比就没法看了。同分按姓名排是为了顺序稳定，
 * 否则每次渲染顺序可能变。
 */
export function sortCandidatesForSidebar(candidates: CandidateSummary[]): CandidateSummary[] {
  return [...candidates].sort((a, b) => {
    const aScored = a.overallScore !== null;
    const bScored = b.overallScore !== null;
    if (aScored !== bScored) return aScored ? -1 : 1;
    if (aScored && bScored && a.overallScore !== b.overallScore) {
      return (b.overallScore as number) - (a.overallScore as number);
    }
    return a.name.localeCompare(b.name, 'zh');
  });
}
