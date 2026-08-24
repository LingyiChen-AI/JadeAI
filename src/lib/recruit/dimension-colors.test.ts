import { describe, it, expect } from 'vitest';
import { dimensionColor } from './dimension-colors';
import { PRESET_DIMENSION_KEYS } from './dimensions';

describe('dimensionColor', () => {
  it('预置面试维度各有一套颜色，且互不相同', () => {
    const dots = PRESET_DIMENSION_KEYS.map((k) => dimensionColor(k).dot);
    expect(new Set(dots).size).toBe(PRESET_DIMENSION_KEYS.length);
  });

  it('同一个 key 每次都得到同一个颜色', () => {
    expect(dimensionColor('产品 sense')).toEqual(dimensionColor('产品 sense'));
  });

  it('自定义维度也拿得到颜色', () => {
    const c = dimensionColor('这是一个自定义维度');
    expect(c.dot).toBeTruthy();
    expect(c.chip).toBeTruthy();
  });

  it('取色靠 key 的哈希而不是下标——删掉一个维度，剩下的不换色', () => {
    const before = ['自定义A', '自定义B', '自定义C'].map((k) => dimensionColor(k).dot);
    const after = ['自定义B', '自定义C'].map((k) => dimensionColor(k).dot);
    expect(after).toEqual([before[1], before[2]]);
  });
});
