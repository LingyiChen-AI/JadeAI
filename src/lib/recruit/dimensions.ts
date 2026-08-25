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
  go_fundamentals: '【考察目标】系统评估候选人对 Go 语言原理、运行时机制及生产级工程实践的掌握程度，而非 API 记忆。【知识范围】类型系统、接口与反射、slice/map/string、错误处理、泛型；GMP 调度、goroutine、channel、select、context；sync/atomic、内存模型、竞态与死锁；栈增长、逃逸分析、GC、对象复用；netpoll、I/O 与系统调用。【工程实践】并发模型设计、生命周期治理、优雅退出、限流与背压、资源泄漏防治、测试与可观测性。【诊断能力】能使用 race detector、pprof、trace、benchmark 和运行时指标定位 CPU、内存、阻塞、锁竞争及 goroutine 泄漏。【评价重点】优秀回答应从机制推导现象，给出验证步骤、指标与取舍；只背术语、绝对化结论或无法关联生产问题属于风险信号。',
  backend_fundamentals: '【考察目标】评估构建可靠后端服务所需的计算机基础和工程能力。【知识范围】进程/线程/协程、内存与文件 I/O；TCP、HTTP/1.1/2/3、DNS、TLS、连接复用；REST/RPC、序列化、鉴权授权、API 版本治理；并发控制、超时、重试、幂等、熔断、限流、降级。【工程实践】配置管理、日志、指标、链路追踪、灰度发布、错误码设计、单元/集成测试和安全基线。【场景能力】能处理慢请求、连接耗尽、重试风暴、接口兼容、流量突增和依赖异常。【评价重点】优秀回答应明确约束与 SLO，按证据定位问题并说明方案边界和失败模式；仅罗列组件而缺少机制与验证方法属于弱表现。',
  middleware_database: '【考察目标】评估候选人对数据存储和基础中间件的原理、选型、调优及故障治理能力。【数据库】数据建模、索引结构与执行计划、事务 ACID、隔离级别、MVCC、锁与死锁、复制、分片、备份恢复及一致性。【缓存】Redis 数据结构、淘汰与过期、穿透/击穿/雪崩、热点 Key、分布式锁、缓存一致性。【消息系统】Kafka/RabbitMQ 的分区、顺序、投递语义、重复消费、积压、再均衡和死信治理。【工程实践】连接池、容量规划、监控告警、数据迁移、故障演练和降级恢复。【评价重点】要求结合业务读写模型说明选型，能用指标和执行证据定位问题，并识别性能、一致性、成本和复杂度之间的取舍。',
  project_deep_dive: '【考察目标】验证简历项目的真实性、个人贡献深度及端到端交付能力。【考察范围】业务目标、用户与成功指标；规模、流量、数据量、延迟、成本及合规约束；候选人的职责边界和关键产出；架构演进、技术选型及备选方案；核心难点、线上事故、性能优化、质量保障、发布运维与复盘。【追问路径】背景与约束→个人决策→实现细节→量化结果→失败与教训→反事实方案。【证据要求】区分个人与团队贡献，要求提供设计、代码、指标、日志、实验或协作过程等可核验证据。【评价重点】优秀回答具体、前后一致并能解释代价；只讲技术名词、模糊使用“我们”、无法说明指标来源或把结果归因于自己属于风险信号。',
  system_scenario: '【考察目标】评估候选人在信息不完整条件下进行系统设计、容量规划和故障处置的能力。【设计范围】需求澄清、SLA/SLO、容量估算、数据模型、接口与服务边界、同步/异步链路、一致性、可用性、扩展性、安全、成本与可运维性。【稳定性】限流、熔断、降级、隔离、重试、幂等、容灾、多活、扩缩容和数据恢复。【排障路径】从现象和影响面出发，提出假设，按验证成本排序，选择日志/指标/追踪/实验获取证据，完成止损、根因定位和长期治理。【评价重点】优秀回答会主动澄清约束、量化规模、说明关键取舍与演进路线；直接堆砌组件、忽视失败模式或没有验证闭环属于弱表现。',
  communication_pressure: '【考察目标】评估候选人在复杂协作和高压环境中的结构化沟通、冲突处理与责任担当。【场景范围】需求频繁变化、技术方案被质疑、跨团队依赖延期、资源不足、排期压缩、线上事故、客户投诉、质量与交付冲突。【能力要点】识别利益相关方和共同目标；先结论后依据地表达；主动澄清事实与分歧；用数据推动决策；管理预期并形成责任人、时间点和升级机制；在压力下守住安全、质量与合规底线。【行为证据】重点追问候选人当时说了什么、做了什么、如何影响他人及结果如何。【评价重点】优秀回答兼顾同理心、原则和执行闭环；甩锅、回避冲突、只说“多沟通”或无底线承诺属于风险信号。',
  hr_motivation: '【考察目标】评估候选人的求职动机、职业稳定性、价值观与岗位长期匹配度。【考察范围】教育与工作时间线、每次选择和离开原因、转型动机、成就与挫折、自我认知、学习与成长目标、工作内容偏好、团队与管理偏好、地域/薪酬/到岗等现实约束。【岗位匹配】是否理解岗位职责、核心挑战和发展路径；现有能力如何迁移；能力缺口如何补齐；未来 1—3 年目标是否与团队机会一致。【一致性验证】结合简历和前序技术回答交叉追问，区分真实动机与通用话术。【评价重点】优秀回答具体、诚实且选择逻辑稳定；贬低前雇主、频繁归因外部、诉求与岗位明显冲突或回答前后矛盾属于风险信号。',
};

const LEGACY_DEFAULT_DESCRIPTIONS = new Set([
  '考察 Go 语言核心机制与工程实践：GMP 调度、goroutine 与 channel、context 生命周期、内存逃逸与 GC、接口与反射、锁与并发安全、错误处理、pprof/trace 性能诊断。题目应结合可观察现象追问原理、定位方法和技术取舍，区分概念背诵与真实理解。',
  '考察通用后端基础：网络协议与 HTTP/TCP、操作系统与 I/O、并发控制、接口设计、鉴权、超时重试与幂等、日志与可观测性。重点判断候选人能否从机制解释线上现象，并给出可验证、可落地的处理方案。',
  '考察 MySQL/PostgreSQL、Redis、Kafka/RabbitMQ 等数据库与中间件：索引与执行计划、事务隔离、锁与一致性、缓存穿透/击穿/雪崩、消息可靠性与重复消费、分库分表及故障恢复。重点追问适用边界、监控指标和方案代价。',
  '围绕简历中的真实项目深挖：业务目标与约束、个人职责、架构和技术选型、关键难点、线上问题、性能或稳定性指标、最终结果与复盘。要求候选人说清为什么这样做、自己具体做了什么、证据是什么，避免把团队成果直接算作个人能力。',
  '考察系统设计与故障处理：容量估算、高并发、限流降级、数据一致性、可用性、扩缩容、链路排障和灾难恢复。给出贴近岗位的真实场景，重点观察候选人如何澄清约束、拆分问题、提出假设、设计验证步骤并权衡成本。',
  '考察沟通表达、冲突处理和压力决策：跨团队协作、需求冲突、技术方案被质疑、排期压缩、线上事故和客户沟通。重点判断是否先澄清目标、表达有结构、能基于事实推动决策，并在压力下守住质量与风险底线。',
  '考察求职动机与岗位匹配：离职和转型原因、职业选择、稳定性、成长目标、工作偏好、期望与现实冲突。结合简历时间线追问，判断回答是否具体一致、是否理解岗位，以及候选人的长期诉求能否与团队环境匹配。',
]);

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
      || (d.description?.trim()
        && d.description.trim() !== d.label.trim()
        && !LEGACY_DEFAULT_DESCRIPTIONS.has(d.description.trim()))
      || !PRESET_KEY_SET.has(d.key)
      ? d
      : { ...d, description: describeOf(d.key) },
  );
}
