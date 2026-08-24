import { describe, expect, it } from 'vitest';
import { allocateQuestions, computeOverallScore } from './scoring';
import type { DimensionConfig, DimensionScore } from '@/types/recruit';

function dim(key: string, weight: number): DimensionConfig {
  return { key, label: key, weight, custom: false };
}

describe('allocateQuestions', () => {
  it('每个维度配置的数字就是该维度题目数', () => {
    const dims = [dim('professional', 3), dim('logic', 2), dim('communication', 2)];
    const result = allocateQuestions(dims, 7);
    expect(result).toEqual({ professional: 3, logic: 2, communication: 2 });
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(7);
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
