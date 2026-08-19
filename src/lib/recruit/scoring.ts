import type { DimensionConfig, DimensionScore } from '@/types/recruit';

/**
 * 把 total 道题按权重分到各维度上。
 *
 * 这一步刻意放在服务端而不是交给模型：prompt 里会写死「抗压 3 题、逻辑 4 题」，
 * 否则用户配的权重形同虚设，模型会自己决定各维度出几题。
 *
 * 返回 { dimensionKey: 题目数 }，各值之和精确等于 total（total >= 0 时）。
 */
export function allocateQuestions(
  dimensions: DimensionConfig[],
  total: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (dimensions.length === 0) return result;

  const safeTotal = Math.max(0, Math.floor(total));

  // 名额不够人人有份：按权重降序（同权重保持原顺序）取前 safeTotal 个各给 1 题。
  if (safeTotal <= dimensions.length) {
    for (const d of dimensions) result[d.key] = 0;
    const ranked = dimensions
      .map((d, index) => ({ d, index }))
      .sort((a, b) => b.d.weight - a.d.weight || a.index - b.index);
    for (const { d } of ranked.slice(0, safeTotal)) result[d.key] = 1;
    return result;
  }

  // 权重全为 0（或全为负）时退化成等权，否则负权重会把分配算歪。
  const rawWeights = dimensions.map((d) => Math.max(d.weight, 0));
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = weightSum > 0 ? rawWeights : dimensions.map(() => 1);
  const effectiveSum = weights.reduce((a, b) => a + b, 0);

  // 先每人 1 题打底，剩下的按权重用最大余额法分。
  const remainder = safeTotal - dimensions.length;
  const exact = weights.map((w) => (w / effectiveSum) * remainder);
  const floors = exact.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);

  const byFraction = exact
    .map((v, index) => ({ index, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  let cursor = 0;
  while (assigned < remainder) {
    floors[byFraction[cursor % byFraction.length].index] += 1;
    assigned += 1;
    cursor += 1;
  }

  dimensions.forEach((d, i) => {
    result[d.key] = 1 + floors[i];
  });
  return result;
}

/**
 * 加权总分。
 *
 * 刻意不让模型算这个数：LLM 的算术不可靠，而且总分必须和权重配置严格对应，
 * 同岗位候选人的横向排序才有意义。
 *
 * weight <= 0 的维度被排除——某个维度一道题都没问到时，调用方把它的 weight
 * 置 0，该维度就不会把总分拉低。
 */
export function computeOverallScore(scores: DimensionScore[]): number {
  const usable = scores.filter((s) => s.weight > 0);
  const totalWeight = usable.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = usable.reduce((sum, s) => sum + s.score * s.weight, 0);
  return Math.round(weighted / totalWeight);
}
