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

const PRESET_KEY_SET = new Set<string>(PRESET_DIMENSION_KEYS);

/**
 * 给缺考察重点的预置维度补上默认文案。
 *
 * description 是后加的字段，之前建的岗位存的那份 dimensions 里根本没有这个键，
 * 打开编辑弹窗只能看到一个空输入框——看上去就像预置维度压根没有默认值。
 * 自定义维度不补：它的描述本来就只能用户自己写。
 */
export function fillPresetDescriptions(
  dimensions: DimensionConfig[],
  describeOf: (key: string) => string,
): DimensionConfig[] {
  return dimensions.map((d) =>
    d.custom || d.description?.trim() || !PRESET_KEY_SET.has(d.key)
      ? d
      : { ...d, description: describeOf(d.key) },
  );
}
