import { describe, expect, it } from 'vitest';
import { summarizeQuestions, sortCandidatesForSidebar } from './summary';
import type { CandidateSummary, DimensionConfig, InterviewQuestion } from '@/types/recruit';

function q(id: string, dimension: string, minutes: number): InterviewQuestion {
  return {
    id,
    dimension,
    question: 'Q',
    intent: 'I',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    followUps: [],
    referencePoints: [],
    estimatedMinutes: minutes,
    difficulty: 'medium',
  };
}

const DIMS: DimensionConfig[] = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

describe('summarizeQuestions', () => {
  it('统计题数与总时长', () => {
    const result = summarizeQuestions([q('1', 'logic', 8), q('2', 'logic', 10)], DIMS);
    expect(result.count).toBe(2);
    expect(result.totalMinutes).toBe(18);
  });

  it('按维度分组，用 label 而不是 key', () => {
    const result = summarizeQuestions(
      [q('1', 'logic', 5), q('2', 'professional', 5), q('3', 'logic', 5)],
      DIMS,
    );
    expect(result.byDimension).toEqual([
      { key: 'professional', label: '专业技能', count: 1 },
      { key: 'logic', label: '逻辑思维', count: 2 },
    ]);
  });

  it('维度顺序跟随配置，而不是题目出现顺序', () => {
    const result = summarizeQuestions([q('1', 'logic', 5), q('2', 'professional', 5)], DIMS);
    expect(result.byDimension.map((d) => d.key)).toEqual(['professional', 'logic']);
  });

  it('配置里没有的维度也要统计，label 退化成 key', () => {
    const result = summarizeQuestions([q('1', 'unknown-dim', 5)], DIMS);
    const unknown = result.byDimension.find((d) => d.key === 'unknown-dim');
    expect(unknown).toEqual({ key: 'unknown-dim', label: 'unknown-dim', count: 1 });
  });

  it('零题时不报错', () => {
    expect(summarizeQuestions([], DIMS)).toEqual({ count: 0, totalMinutes: 0, byDimension: [] });
  });
});

describe('sortCandidatesForSidebar', () => {
  function c(name: string, score: number | null): CandidateSummary {
    return {
      id: name,
      name,
      status: score === null ? 'pending' : 'evaluated',
      hasResume: true,
      questionCount: 0,
      answeredCount: 0,
      overallScore: score,
      recommendation: score === null ? null : 'hire',
      createdAt: '2026-08-20T00:00:00.000Z',
    };
  }

  it('按总分降序', () => {
    const result = sortCandidatesForSidebar([c('低', 60), c('高', 90), c('中', 75)]);
    expect(result.map((x) => x.name)).toEqual(['高', '中', '低']);
  });

  it('未评价的沉到最后，哪怕分数为 0 的排在它前面', () => {
    const result = sortCandidatesForSidebar([c('没评价', null), c('零分', 0)]);
    expect(result.map((x) => x.name)).toEqual(['零分', '没评价']);
  });

  it('同分按姓名排，保证顺序稳定', () => {
    const result = sortCandidatesForSidebar([c('B', 80), c('A', 80)]);
    expect(result.map((x) => x.name)).toEqual(['A', 'B']);
  });

  it('多个未评价的之间也按姓名排', () => {
    const result = sortCandidatesForSidebar([c('乙', null), c('甲', null)]);
    expect(result.map((x) => x.name)).toEqual(['甲', '乙']);
  });

  it('不修改传入的数组', () => {
    const input = [c('低', 60), c('高', 90)];
    sortCandidatesForSidebar(input);
    expect(input.map((x) => x.name)).toEqual(['低', '高']);
  });

  it('空数组返回空数组', () => {
    expect(sortCandidatesForSidebar([])).toEqual([]);
  });
});
