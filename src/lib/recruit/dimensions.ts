import type { DimensionConfig } from '@/types/recruit';

/**
 * 预置的 8 个考察维度。label 走 i18n（`recruit.dimensions.<key>`），
 * 这里只存 key，避免把中文硬编码进逻辑层。
 */
export const PRESET_DIMENSION_KEYS = [
  'go_fundamentals',
  'backend_fundamentals',
  'middleware_database',
  'project_deep_dive',
  'system_scenario',
  'communication_pressure',
  'hr_motivation',
] as const;

export type PresetDimensionKey = (typeof PRESET_DIMENSION_KEYS)[number];

export const QUESTION_DIMENSION_LABELS: Record<PresetDimensionKey, string> = {
  go_fundamentals: 'Go 基础',
  backend_fundamentals: '后端基础',
  middleware_database: '中间件与数据库',
  project_deep_dive: '项目深挖',
  system_scenario: '系统场景',
  communication_pressure: '沟通与压力',
  hr_motivation: '求职动机',
};

/**
 * 新建岗位时的默认勾选：专业技能最重，逻辑与沟通次之。
 * labelOf / describeOf 由调用方传入（客户端用 next-intl 的 t 函数）。
 */
export function defaultDimensions(
  labelOf: (key: string) => string,
  describeOf: (key: string) => string,
  isGoRole = false,
): DimensionConfig[] {
  const keys: PresetDimensionKey[] = [
    isGoRole ? 'go_fundamentals' : 'backend_fundamentals',
    'middleware_database',
    'project_deep_dive',
    'system_scenario',
    'communication_pressure',
    'hr_motivation',
  ];
  return keys.map((key) => ({
    key,
    label: labelOf(key),
    description: describeOf(key),
    weight: key === 'go_fundamentals' || key === 'backend_fundamentals' || key === 'project_deep_dive' ? 3 : 2,
    custom: false,
  }));
}

export function interviewDimensions(
  dimensions: DimensionConfig[],
  isGoRole: boolean,
  labelOf: (key: string) => string,
  describeOf: (key: string) => string,
): DimensionConfig[] {
  const allowed = new Set<string>(PRESET_DIMENSION_KEYS);
  const expectedFoundation = isGoRole ? 'go_fundamentals' : 'backend_fundamentals';
  const canonical = dimensions.length > 0
    && dimensions.every((dimension) => allowed.has(dimension.key))
    && dimensions.some((dimension) => dimension.key === expectedFoundation)
    && dimensions.every((dimension) => dimension.key !== (isGoRole ? 'backend_fundamentals' : 'go_fundamentals'));

  return canonical
    ? fillPresetDescriptions(dimensions, describeOf)
    : defaultDimensions(labelOf, describeOf, isGoRole);
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
