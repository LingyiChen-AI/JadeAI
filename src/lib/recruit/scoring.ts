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
  const configuredTotal = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (configuredTotal === total) {
    return Object.fromEntries(dimensions.map((dimension) => [dimension.key, dimension.weight]));
  }

  // 兼容还没打开岗位设置保存过的旧数据；新配置的 total 总是等于各维度题数之和。
  const result: Record<string, number> = {};
  if (dimensions.length === 0) return result;
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal <= dimensions.length) {
    for (const dimension of dimensions) result[dimension.key] = 0;
    const ranked = dimensions
      .map((dimension, index) => ({ dimension, index }))
      .sort((a, b) => b.dimension.weight - a.dimension.weight || a.index - b.index);
    for (const { dimension } of ranked.slice(0, safeTotal)) result[dimension.key] = 1;
    return result;
  }

  const weights = dimensions.map((dimension) => Math.max(dimension.weight, 0));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = weightSum > 0 ? weights : dimensions.map(() => 1);
  const effectiveSum = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
  const remainder = safeTotal - dimensions.length;
  const exact = effectiveWeights.map((weight) => (weight / effectiveSum) * remainder);
  const floors = exact.map(Math.floor);
  let assigned = floors.reduce((sum, count) => sum + count, 0);
  const fractions = exact
    .map((count, index) => ({ index, fraction: count - Math.floor(count) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (assigned < remainder) {
    floors[fractions[cursor % fractions.length].index] += 1;
    assigned += 1;
    cursor += 1;
  }
  dimensions.forEach((dimension, index) => {
    result[dimension.key] = 1 + floors[index];
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
