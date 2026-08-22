import { describe, it, expect } from 'vitest';
import { fillPresetDescriptions } from './dimensions';
import type { DimensionConfig } from '@/types/recruit';

const describeOf = (key: string) => `默认描述:${key}`;

function dim(over: Partial<DimensionConfig>): DimensionConfig {
  return { key: 'professional', label: '专业技能', weight: 2, custom: false, ...over };
}

describe('fillPresetDescriptions', () => {
  it('老岗位没存 description 的预置维度，补上默认文案', () => {
    const out = fillPresetDescriptions([dim({ description: undefined })], describeOf);
    expect(out[0].description).toBe('默认描述:professional');
  });

  it('只有空白的也算没填', () => {
    const out = fillPresetDescriptions([dim({ description: '   ' })], describeOf);
    expect(out[0].description).toBe('默认描述:professional');
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
