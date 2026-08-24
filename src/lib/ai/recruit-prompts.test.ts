import { describe, expect, it } from 'vitest';
import {
  buildInterviewBlueprintPrompt,
  buildDimensionQuestionsPrompt,
  planQuestionGeneration,
  buildEvaluationPrompt,
} from './recruit-prompts';
import { PRESET_DIMENSION_GUIDES } from '@/lib/recruit/dimension-guides';
import type {
  DimensionConfig,
  InterviewBlueprint,
  InterviewQuestion,
  QuestionSlot,
} from '@/types/recruit';

const DIMENSIONS: DimensionConfig[] = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

describe('planQuestionGeneration', () => {
  it('按权重把题数分给各维度', () => {
    const tasks = planQuestionGeneration({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questionCount: 10,
    });
    // 3:2 权重、共 10 题 -> 专业技能 6 题、逻辑思维 4 题
    expect(tasks).toEqual([
      { dimension: DIMENSIONS[0], count: 6 },
      { dimension: DIMENSIONS[1], count: 4 },
    ]);
  });

  it('分到 0 题的维度不生成请求', () => {
    const tasks = planQuestionGeneration({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questionCount: 5,
    });
    expect(tasks.every((t) => t.count > 0)).toBe(true);
  });
});

describe('buildDimensionQuestionsPrompt', () => {
  const base = {
    jobTitle: '后端工程师',
    jobDescription: '需要熟悉分布式事务',
    resumeText: '在某厂做过订单系统',
    dimensions: DIMENSIONS,
  };

  const blueprint: InterviewBlueprint = {
    resumeFacts: ['1 年 Go 经验', '项目使用 Gin、gRPC、Redis'],
    jdRequirements: ['Golang 性能优化', '熟悉 MySQL'],
    gaps: ['简历未证明 MySQL 经验'],
    slots: [
      {
        category: 'go_fundamentals',
        source: 'jd',
        dimension: 'professional',
        topic: 'GMP 调度与阻塞调用',
        evidence: 'JD 要求 Go 性能优化',
        difficulty: 'hard',
      },
      {
        category: 'project_deep_dive',
        source: 'resume',
        dimension: 'professional',
        topic: 'gRPC 服务的个人职责',
        evidence: '简历写明项目使用 gRPC',
        difficulty: 'medium',
      },
    ],
  };

  it('按 slot 顺序渲染题目依据和全局事实列表', () => {
    const slots: QuestionSlot[] = [
      {
        category: 'go_fundamentals',
        source: 'jd',
        dimension: 'professional',
        topic: 'GMP scheduling and blocking calls',
        evidence: 'JD requires Go performance optimization',
        difficulty: 'hard',
      },
      {
        category: 'project_deep_dive',
        source: 'resume',
        dimension: 'professional',
        topic: 'gRPC service ownership',
        evidence: 'Resume says the project used gRPC',
        difficulty: 'medium',
      },
    ];
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots,
    });
    expect(prompt).toContain('需要熟悉分布式事务');
    expect(prompt).toContain('在某厂做过订单系统');
    expect(prompt).toContain('professional');
    expect(prompt).toContain('GMP scheduling and blocking calls');
    expect(prompt).toContain('JD requires Go performance optimization');
    expect(prompt).toContain('category: go_fundamentals');
    expect(prompt).toContain('source: jd');
    expect(prompt).toContain('gRPC service ownership');
    expect(prompt).toContain('Resume says the project used gRPC');
    expect(prompt).toContain('category: project_deep_dive');
    expect(prompt).toContain('source: resume');
    expect(prompt).toContain('1 年 Go 经验');
    expect(prompt).toContain('Golang 性能优化');
    expect(prompt).toContain('简历未证明 MySQL 经验');
    expect(prompt).toContain('one output question per slot, in order');
    const firstSlot = prompt.indexOf(`Slot 1
category: go_fundamentals
source: jd
dimension: professional
topic: GMP scheduling and blocking calls
evidence: JD requires Go performance optimization
difficulty: hard`);
    const secondSlot = prompt.indexOf(`Slot 2
category: project_deep_dive
source: resume
dimension: professional
topic: gRPC service ownership
evidence: Resume says the project used gRPC
difficulty: medium`);
    expect(firstSlot).toBeGreaterThan(-1);
    expect(secondSlot).toBeGreaterThan(firstSlot);
  });

  it('用户填的维度描述整段进 prompt', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: { ...DIMENSIONS[0], description: '重点问 Kafka 消息重复消费怎么处理' },
      blueprint,
      slots: blueprint.slots,
    });
    expect(prompt).toContain('重点问 Kafka 消息重复消费怎么处理');
  });

  it('没填描述时退回预置指引', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots: blueprint.slots,
    });
    expect(prompt).toContain(PRESET_DIMENSION_GUIDES.professional);
  });

  it('告诉模型别人负责哪些维度，避免出重复的题', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots: blueprint.slots,
    });
    expect(prompt).toContain('逻辑思维');
    expect(prompt).toContain('do NOT ask about them');
  });

  it('自定义维度没有预置指引时不留空指引段', () => {
    const custom: DimensionConfig = {
      key: '产品 sense',
      label: '产品 sense',
      weight: 1,
      custom: true,
    };
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimensions: [custom],
      dimension: custom,
      blueprint: { ...blueprint, slots: [{ ...blueprint.slots[0], dimension: custom.key }] },
      slots: [{ ...blueprint.slots[0], dimension: custom.key }],
    });
    expect(prompt).not.toContain('How to probe this competency');
  });

  it('system prompt 要求纯 JSON，且带参考答案字段', () => {
    const { system } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots: blueprint.slots,
    });
    expect(system).toContain('JSON');
    expect(system).toContain('referenceAnswer');
  });

  it('system prompt 要求严格按输入 slots 出题，不能自主选择题型', () => {
    const { system } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots: blueprint.slots,
    });
    expect(system).toContain('Do not choose or rebalance categories, sources, dimensions, or difficulty');
    expect(system).toContain('slot is the complete question assignment');
  });

  it('system prompt 分别约束简历题、JD 场景题和事实边界', () => {
    const { system } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots: blueprint.slots,
    });
    expect(system).toContain('Evidence anchor');
    expect(system).toContain('Resume-backed questions');
    expect(system).toContain('JD-backed questions');
    expect(system).toContain('Never invent');
    expect(system).toContain('resumeFacts');
    expect(system).toContain('jdRequirements');
    expect(system).toContain('gaps');
    expect(system).toContain('must not imply prior experience');
  });

  it('system prompt 要求从 JD 和简历推断资历并匹配题目难度', () => {
    const { system } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      blueprint,
      slots: blueprint.slots,
    });
    expect(system).toContain('Infer the expected seniority');
    expect(system).toContain('Junior');
    expect(system).toContain('Mid-level');
    expect(system).toContain('Senior / staff');
  });

  it('临时 count 分支使用独立 legacy system，而不是 slot-only 指令', () => {
    const { system, prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      count: 2,
    });

    expect(system).toContain('LEGACY COUNT REQUEST');
    expect(system).not.toContain('SLOT ASSIGNMENT');
    expect(system).toContain('At least one third must be "hard"');
    expect(prompt).toContain('exactly 2 questions');
    expect(prompt).not.toContain('Assigned slots:');
  });
});

describe('buildInterviewBlueprintPrompt', () => {
  it('sets exact slot coverage and factual boundaries for the global blueprint', () => {
    const { system, prompt } = buildInterviewBlueprintPrompt({
      jobTitle: 'Golang 开发工程师',
      jobDescription: '3 年以上 Golang，熟悉 gRPC、Redis、MySQL',
      resumeText: '1 年 Go；项目使用 Gin、gRPC、Redis',
      dimensions: DIMENSIONS,
      questionCount: 10,
    });

    expect(system).toContain('exactly 10 slots');
    expect(system).toContain('at least 2 go_fundamentals');
    expect(system).toContain('resumeFacts');
    expect(system).toContain('jdRequirements');
    expect(system).toContain('gaps');
    expect(system).toContain('Never convert an inference into a résumé fact');
    expect(system).toContain('easy | medium | hard');
    expect(system).toContain('If gaps is non-empty, include at least one gap slot');
    expect(system).toContain('If gaps is empty, include at least one jd system_scenario slot');
    expect(prompt).toContain('Golang 开发工程师');
  });

  it.each([
    [
      5,
      'Technical foundations (go_fundamentals, backend_fundamentals, middleware_database): at least 2 slots',
      'Project deep-dives: 1–1 slots',
      'System scenarios: 1–1 slots',
      'Communication and HR: 1–1 slots',
    ],
    [
      8,
      'Technical foundations (go_fundamentals, backend_fundamentals, middleware_database): at least 3 slots',
      'Project deep-dives: 2–2 slots',
      'System scenarios: 1–2 slots',
      'Communication and HR: 1–2 slots',
    ],
    [
      10,
      'Technical foundations (go_fundamentals, backend_fundamentals, middleware_database): at least 3 slots',
      'Project deep-dives: 2–3 slots',
      'System scenarios: 2–2 slots',
      'Communication and HR: 2–2 slots',
    ],
  ])('emits feasible integer portfolio constraints for %i slots', (questionCount, ...rules) => {
    const { system } = buildInterviewBlueprintPrompt({
      jobTitle: '后端工程师',
      jobDescription: '熟悉分布式系统',
      resumeText: '做过订单服务',
      dimensions: DIMENSIONS,
      questionCount,
    });

    for (const rule of rules) {
      expect(system).toContain(rule);
    }
  });
});

describe('buildEvaluationPrompt', () => {
  const questions: InterviewQuestion[] = [
    {
      id: 'q1',
      dimension: 'logic',
      question: '讲一个你排查过的线上问题',
      intent: '看拆解路径',
      rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只复述结论' },
      followUps: [],
      referencePoints: ['定位手段'],
      estimatedMinutes: 8,
      difficulty: 'medium',
    },
  ];

  it('题目的 id、题干和评分标准都进了 prompt', () => {
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: '候选人说了缓存击穿的排查过程',
    });
    expect(prompt).toContain('q1');
    expect(prompt).toContain('讲一个你排查过的线上问题');
    expect(prompt).toContain('有假设有验证');
    expect(prompt).toContain('候选人说了缓存击穿的排查过程');
  });

  it('system prompt 明确要求不给总分、且未作答的题不计入维度分', () => {
    const { system } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: 'x',
    });
    expect(system).toContain('answered');
    // 总分由服务端算，prompt 里不能让模型给 overallScore
    expect(system).not.toContain('overallScore');
  });

  it('填了答案的题，把答案写进 prompt', () => {
    const withAnswer: InterviewQuestion[] = [
      { ...questions[0], id: 'q1', answer: '双十一订单页白屏，先看监控发现接口 500' },
    ];
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: withAnswer,
      transcript: '整段记录',
    });
    expect(prompt).toContain('双十一订单页白屏，先看监控发现接口 500');
    expect(prompt).toContain('recorded answer');
  });

  it('没填答案的题不出现 recorded answer 行', () => {
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: '整段记录',
    });
    expect(prompt).not.toContain('recorded answer');
  });

  it('空白答案视同没填', () => {
    const blank: InterviewQuestion[] = [{ ...questions[0], answer: '   ' }];
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: blank,
      transcript: '整段记录',
    });
    expect(prompt).not.toContain('recorded answer');
  });

  it('system prompt 说明有答案的题不要再去记录里找', () => {
    const { system } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: 'x',
    });
    expect(system).toContain('recorded answer');
    expect(system).toContain('do not search the transcript');
  });
});

describe('buildEvaluationPrompt 与参考答案', () => {
  const q: InterviewQuestion = {
    id: 'q1',
    dimension: 'logic',
    question: '题干',
    intent: '意图',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    followUps: [],
    referencePoints: [],
    estimatedMinutes: 5,
    difficulty: 'medium',
  };

  it('客观题的参考答案进 prompt，供打分时对照', () => {
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: [{ ...q, referenceAnswer: 'MVCC 靠 undo log 和 read view' }],
      transcript: 'x',
    });
    expect(prompt).toContain('Reference answer: MVCC 靠 undo log 和 read view');
  });

  it('开放题没有参考答案时不留空行', () => {
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: [{ ...q, referenceAnswer: '  ' }],
      transcript: 'x',
    });
    expect(prompt).not.toContain('Reference answer:');
  });
});

describe('出题 system prompt 的硬约束', () => {
  const blueprint: InterviewBlueprint = {
    resumeFacts: [],
    jdRequirements: [],
    gaps: [],
    slots: [
      {
        category: 'backend_fundamentals',
        source: 'jd',
        dimension: 'professional',
        topic: '数据库索引',
        evidence: 'JD',
        difficulty: 'medium',
      },
    ],
  };
  const { system } = buildDimensionQuestionsPrompt({
    jobTitle: 'T',
    jobDescription: 'JD',
    resumeText: 'R',
    dimensions: DIMENSIONS,
    dimension: DIMENSIONS[0],
    blueprint,
    slots: blueprint.slots,
  });

  it('明确要求题干短、且深度放在追问里', () => {
    expect(system).toContain('One sentence');
    expect(system).toMatch(/Depth lives in "followUps"/);
  });

  it('追问要 4-6 条并带目的标签', () => {
    expect(system).toContain('4-6 of them');
    for (const purpose of ['要细节', '要归因', '反事实', '挑战', '要教训']) {
      expect(system).toContain(purpose);
    }
  });

  it('要求给危险信号，且不许写成泛泛的话', () => {
    expect(system).toContain('redFlags');
    expect(system).toContain('回答不深入');
  });

  it('返回格式里追问是「目的 + 问题」的对象', () => {
    expect(system).toContain('"followUps":[{"purpose":');
  });
});
