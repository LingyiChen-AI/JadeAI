import { describe, expect, it } from 'vitest';
import { allocateQuestions, computeOverallScore } from './scoring';
import type { DimensionConfig, DimensionScore } from '@/types/recruit';

function dim(key: string, weight: number): DimensionConfig {
  return { key, label: key, weight, custom: false };
}

describe('allocateQuestions', () => {
  it('按权重分配，且总数精确等于 total', () => {
    const dims = [dim('professional', 3), dim('logic', 2), dim('communication', 2)];
    const result = allocateQuestions(dims, 10);
    expect(result).toEqual({ professional: 4, logic: 3, communication: 3 });
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('每个维度至少分到 1 题，哪怕权重悬殊', () => {
    const dims = [dim('professional', 100), dim('teamwork', 1)];
    const result = allocateQuestions(dims, 10);
    expect(result.teamwork).toBeGreaterThanOrEqual(1);
    expect(result.professional + result.teamwork).toBe(10);
  });

  it('余数用最大余额法补齐，不丢题也不多题', () => {
    const dims = [dim('a', 1), dim('b', 1)];
    const result = allocateQuestions(dims, 5);
    expect(result.a + result.b).toBe(5);
    // 1 题打底后余 3，两边各 1.5，最大余额法把多出来的 1 给排在前面的 a
    expect(result).toEqual({ a: 3, b: 2 });
  });

  it('total 小于维度个数时，按权重降序只让前 total 个各出 1 题', () => {
    const dims = [dim('a', 1), dim('b', 5), dim('c', 3)];
    const result = allocateQuestions(dims, 2);
    expect(result).toEqual({ a: 0, b: 1, c: 1 });
  });

  it('权重相同时按原顺序决定谁先拿到名额', () => {
    const dims = [dim('a', 2), dim('b', 2), dim('c', 2)];
    const result = allocateQuestions(dims, 2);
    expect(result).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('权重全为 0 时视作等权', () => {
    const dims = [dim('a', 0), dim('b', 0)];
    const result = allocateQuestions(dims, 6);
    expect(result).toEqual({ a: 3, b: 3 });
  });

  it('单个维度拿走全部题目', () => {
    const result = allocateQuestions([dim('a', 5)], 10);
    expect(result).toEqual({ a: 10 });
  });

  it('没有维度时返回空对象', () => {
    expect(allocateQuestions([], 10)).toEqual({});
  });
});

describe('computeOverallScore', () => {
  function score(key: string, s: number, weight: number): DimensionScore {
    return { key, label: key, score: s, weight };
  }

  it('按权重加权平均并四舍五入', () => {
    // (90*3 + 60*2 + 70*2) / 7 = 530/7 = 75.71 -> 76
    const result = computeOverallScore([
      score('professional', 90, 3),
      score('logic', 60, 2),
      score('communication', 70, 2),
    ]);
    expect(result).toBe(76);
  });

  it('权重为 0 的维度不参与计算', () => {
    // teamwork 整个维度都没问到，weight 传 0，总分应等于只算 professional
    const result = computeOverallScore([
      score('professional', 80, 3),
      score('teamwork', 0, 0),
    ]);
    expect(result).toBe(80);
  });

  it('可用权重之和为 0 时返回 0', () => {
    expect(computeOverallScore([score('a', 90, 0)])).toBe(0);
  });

  it('空数组返回 0', () => {
    expect(computeOverallScore([])).toBe(0);
  });
});
