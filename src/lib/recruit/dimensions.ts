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

export const QUESTION_DIMENSION_DESCRIPTIONS: Record<PresetDimensionKey, string> = {
  go_fundamentals: '考察 Go 语言核心机制与工程实践：GMP 调度、goroutine 与 channel、context 生命周期、内存逃逸与 GC、接口与反射、锁与并发安全、错误处理、pprof/trace 性能诊断。题目应结合可观察现象追问原理、定位方法和技术取舍，区分概念背诵与真实理解。',
  backend_fundamentals: '考察通用后端基础：网络协议与 HTTP/TCP、操作系统与 I/O、并发控制、接口设计、鉴权、超时重试与幂等、日志与可观测性。重点判断候选人能否从机制解释线上现象，并给出可验证、可落地的处理方案。',
  middleware_database: '考察 MySQL/PostgreSQL、Redis、Kafka/RabbitMQ 等数据库与中间件：索引与执行计划、事务隔离、锁与一致性、缓存穿透/击穿/雪崩、消息可靠性与重复消费、分库分表及故障恢复。重点追问适用边界、监控指标和方案代价。',
  project_deep_dive: '围绕简历中的真实项目深挖：业务目标与约束、个人职责、架构和技术选型、关键难点、线上问题、性能或稳定性指标、最终结果与复盘。要求候选人说清“为什么这样做、自己具体做了什么、证据是什么”，避免把团队成果直接算作个人能力。',
  system_scenario: '考察系统设计与故障处理：容量估算、高并发、限流降级、数据一致性、可用性、扩缩容、链路排障和灾难恢复。给出贴近岗位的真实场景，重点观察候选人如何澄清约束、拆分问题、提出假设、设计验证步骤并权衡成本。',
  communication_pressure: '考察沟通表达、冲突处理和压力决策：跨团队协作、需求冲突、技术方案被质疑、排期压缩、线上事故和客户沟通。重点判断是否先澄清目标、表达有结构、能基于事实推动决策，并在压力下守住质量与风险底线。',
  hr_motivation: '考察求职动机与岗位匹配：离职和转型原因、职业选择、稳定性、成长目标、工作偏好、期望与现实冲突。结合简历时间线追问，判断回答是否具体一致、是否理解岗位，以及候选人的长期诉求能否与团队环境匹配。',
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
    d.custom
      || (d.description?.trim() && d.description.trim() !== d.label.trim())
      || !PRESET_KEY_SET.has(d.key)
      ? d
      : { ...d, description: describeOf(d.key) },
  );
}
