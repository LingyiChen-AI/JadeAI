import { describe, expect, it } from 'vitest';
import { aggregateJobStats, type CandidateStatRow } from './job-stats';

function row(jobId: string, recommendation: string | null): CandidateStatRow {
  return { jobId, recommendation: recommendation as CandidateStatRow['recommendation'] };
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
    expect(stats.a).toEqual({ total: 5, evaluated: 3, passed: 2 });
  });

  it('没有候选人的岗位不出现在结果里，调用方自己兜底', () => {
    const stats = aggregateJobStats([]);
    expect(stats).toEqual({});
    expect(stats['nope']).toBeUndefined();
  });
});
