import type { CandidateStatus, Recommendation } from '@/types/recruit';

/** 一行 = 一个候选人，recommendation 为 null 表示还没评价 */
export interface CandidateStatRow {
  jobId: string;
  status: CandidateStatus;
  recommendation: Recommendation | null;
}

export interface JobStats {
  /** 候选人数 */
  total: number;
  /** 面试中：已出题但还没评价 */
  interviewing: number;
  /** 已面（已出评价）人数 */
  evaluated: number;
  /** 通过人数 */
  passed: number;
}

/** 「通过」= 强烈推荐或推荐录用。hold 是待定，no_hire 是不推荐，都不算。 */
const PASSING: ReadonlySet<Recommendation> = new Set<Recommendation>(['strong_hire', 'hire']);

/**
 * 把候选人明细按岗位聚合成列表卡片要显示的三个数。
 *
 * 刻意在 JS 里聚合而不是写聚合 SQL：单个用户的候选人总量很小，
 * 而 `sum(case when ...)` 这类写法在 SQLite 与 PostgreSQL 之间要额外小心，
 * 不值得为此引入方言分支。
 *
 * 没有候选人的岗位不会出现在结果里——调用方按 0 兜底。
 */
export function aggregateJobStats(rows: CandidateStatRow[]): Record<string, JobStats> {
  const stats: Record<string, JobStats> = {};

  for (const row of rows) {
    const s = (stats[row.jobId] ??= { total: 0, interviewing: 0, evaluated: 0, passed: 0 });
    s.total += 1;
    if (row.recommendation) {
      s.evaluated += 1;
      if (PASSING.has(row.recommendation)) s.passed += 1;
    } else if (row.status === 'questions_ready') {
      // 已出题但还没评价 = 正在面。已评价的人不再算在「面试中」里。
      s.interviewing += 1;
    }
  }

  return stats;
}
