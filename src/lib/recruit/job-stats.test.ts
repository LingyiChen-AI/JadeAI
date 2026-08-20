import { describe, expect, it } from 'vitest';
import { aggregateJobStats, type CandidateStatRow } from './job-stats';

function row(
  jobId: string,
  recommendation: string | null,
  status: CandidateStatRow['status'] = 'pending',
): CandidateStatRow {
  return { jobId, status, recommendation: recommendation as CandidateStatRow['recommendation'] };
}

describe('aggregateJobStats', () => {
  it('按岗位分组统计总数', () => {
    const stats = aggregateJobStats([row('a', null), row('a', null), row('b', null)]);
    expect(stats.a.total).toBe(2);
    expect(stats.b.total).toBe(1);
  });

  it('有 recommendation 的才算已面', () => {
    const stats = aggregateJobStats([row('a', 'hire'), row('a', null)]);
    expect(stats.a.total).toBe(2);
    expect(stats.a.evaluated).toBe(1);
  });

  it('strong_hire 和 hire 算通过', () => {
    const stats = aggregateJobStats([row('a', 'strong_hire'), row('a', 'hire')]);
    expect(stats.a.passed).toBe(2);
  });

  it('hold 和 no_hire 不算通过', () => {
    const stats = aggregateJobStats([row('a', 'hold'), row('a', 'no_hire')]);
    expect(stats.a.evaluated).toBe(2);
    expect(stats.a.passed).toBe(0);
  });

  it('三个数一起算对', () => {
    const stats = aggregateJobStats([
      row('a', 'strong_hire'),
      row('a', 'hire'),
      row('a', 'no_hire'),
      row('a', null),
      row('a', null),
    ]);
    expect(stats.a).toEqual({ total: 5, interviewing: 0, evaluated: 3, passed: 2 });
  });

  it('没有候选人的岗位不出现在结果里，调用方自己兜底', () => {
    const stats = aggregateJobStats([]);
    expect(stats).toEqual({});
    expect(stats['nope']).toBeUndefined();
  });
});

describe('aggregateJobStats · 面试中', () => {
  it('已出题但没评价的算面试中', () => {
    const stats = aggregateJobStats([row('a', null, 'questions_ready')]);
    expect(stats.a.interviewing).toBe(1);
    expect(stats.a.evaluated).toBe(0);
  });

  it('还没出题的不算面试中', () => {
    const stats = aggregateJobStats([row('a', null, 'pending')]);
    expect(stats.a.interviewing).toBe(0);
  });

  it('已评价的不再算面试中——两个数不重复计', () => {
    const stats = aggregateJobStats([row('a', 'hire', 'evaluated')]);
    expect(stats.a.interviewing).toBe(0);
    expect(stats.a.evaluated).toBe(1);
  });

  it('四个数各算各的', () => {
    const stats = aggregateJobStats([
      row('a', null, 'pending'),
      row('a', null, 'questions_ready'),
      row('a', 'hold', 'evaluated'),
      row('a', 'hire', 'evaluated'),
    ]);
    expect(stats.a).toEqual({ total: 4, interviewing: 1, evaluated: 2, passed: 1 });
  });
});
