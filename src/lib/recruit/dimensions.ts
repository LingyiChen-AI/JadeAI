import type { DimensionConfig } from '@/types/recruit';

/**
 * 预置的 8 个考察维度。label 走 i18n（`recruit.dimensions.<key>`），
 * 这里只存 key，避免把中文硬编码进逻辑层。
 */
export const PRESET_DIMENSION_KEYS = [
  'stress',
  'logic',
  'communication',
  'professional',
  'teamwork',
  'learning',
  'motivation',
  'leadership',
] as const;

export type PresetDimensionKey = (typeof PRESET_DIMENSION_KEYS)[number];

/**
 * 新建岗位时的默认勾选：专业技能最重，逻辑与沟通次之。
 * labelOf / describeOf 由调用方传入（客户端用 next-intl 的 t 函数）。
 */
export function defaultDimensions(
  labelOf: (key: string) => string,
  describeOf: (key: string) => string,
): DimensionConfig[] {
  return (['professional', 'logic', 'communication'] as const).map((key, i) => ({
    key,
    label: labelOf(key),
    description: describeOf(key),
    weight: i === 0 ? 3 : 2,
    custom: false,
  }));
}
