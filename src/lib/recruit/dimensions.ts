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
 * labelOf 由调用方传入（客户端用 next-intl 的 t 函数）。
 */
export function defaultDimensions(labelOf: (key: string) => string): DimensionConfig[] {
  return [
    { key: 'professional', label: labelOf('professional'), weight: 3, custom: false },
    { key: 'logic', label: labelOf('logic'), weight: 2, custom: false },
    { key: 'communication', label: labelOf('communication'), weight: 2, custom: false },
  ];
}
