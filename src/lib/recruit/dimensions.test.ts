import { describe, it, expect } from 'vitest';
import { fillPresetDescriptions, interviewDimensions } from './dimensions';
import type { DimensionConfig } from '@/types/recruit';

const describeOf = (key: string) => `默认描述:${key}`;

function dim(over: Partial<DimensionConfig>): DimensionConfig {
  return { key: 'project_deep_dive', label: '项目深挖', weight: 2, custom: false, ...over };
}

describe('fillPresetDescriptions', () => {
  it('老岗位没存 description 的预置维度，补上默认文案', () => {
    const out = fillPresetDescriptions([dim({ description: undefined })], describeOf);
    expect(out[0].description).toBe('默认描述:project_deep_dive');
  });

  it('只有空白的也算没填', () => {
    const out = fillPresetDescriptions([dim({ description: '   ' })], describeOf);
    expect(out[0].description).toBe('默认描述:project_deep_dive');
  });

  it('迁移时把维度名称当描述的占位值会替换成完整考察范围', () => {
    const out = fillPresetDescriptions(
      [dim({ description: '项目深挖' })],
      describeOf,
    );
    expect(out[0].description).toBe('默认描述:project_deep_dive');
  });

  it('用户改过的描述原样保留', () => {
    const out = fillPresetDescriptions([dim({ description: '我自己写的' })], describeOf);
    expect(out[0].description).toBe('我自己写的');
  });

  it('自定义维度不补——它的描述只能用户自己写', () => {
    const out = fillPresetDescriptions(
      [dim({ key: '产品 sense', label: '产品 sense', custom: true, description: '' })],
      describeOf,
    );
    expect(out[0].description).toBe('');
  });

  it('不认识的 key 也不补，免得 i18n 抛 missing message', () => {
    const out = fillPresetDescriptions([dim({ key: 'unknown', description: '' })], describeOf);
    expect(out[0].description).toBe('');
  });
});

describe('interviewDimensions', () => {
  it('把旧评分维度迁移成与题型一致的 Go 面试维度', () => {
    const result = interviewDimensions(
      [{ key: 'professional', label: '专业技能', weight: 3, custom: false }],
      true,
      (key) => key,
      (key) => `描述:${key}`,
    );

    expect(result.map((item) => item.key)).toEqual([
      'go_fundamentals',
      'middleware_database',
      'project_deep_dive',
      'system_scenario',
      'communication_pressure',
      'hr_motivation',
    ]);
  });
});
