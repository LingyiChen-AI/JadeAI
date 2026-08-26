import { describe, expect, it } from 'vitest';
import {
  buildInterviewBlueprintPrompt,
  buildDimensionQuestionsPrompt,
  buildEvaluationPrompt,
} from './recruit-prompts';
import { PRESET_DIMENSION_GUIDES } from '@/lib/recruit/dimension-guides';
import { normalizeQuestions } from '@/lib/recruit/questions';
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

  if (false) {
    buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      // @ts-expect-error Route-facing generation requires blueprint slots, not a legacy count.
      count: 2,
    });
  }

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

});

describe('buildInterviewBlueprintPrompt', () => {
  it('sets exact slot coverage and factual boundaries for the global blueprint', () => {
    const weightedDimensions: DimensionConfig[] = [
      {
        key: 'professional',
        label: '专业技能',
        description: '重点考察技术原理与工程取舍',
        weight: 3,
        custom: false,
      },
      {
        key: 'logic',
        label: '逻辑思维',
        description: '重点考察问题拆解与验证路径',
        weight: 2,
        custom: false,
      },
    ];
    const { system, prompt } = buildInterviewBlueprintPrompt({
      jobTitle: 'Golang 开发工程师',
      jobDescription: '3 年以上 Golang，熟悉 gRPC、Redis、MySQL',
      resumeText: '1 年 Go；项目使用 Gin、gRPC、Redis',
      dimensions: weightedDimensions,
      questionCount: 10,
    });

    expect(system).toContain('exactly 10 slots');
    expect(system).toContain('at least 2 go_fundamentals');
    expect(system).toContain('resumeFacts');
    expect(system).toContain('jdRequirements');
    expect(system).toContain('gaps');
    expect(system).toContain('Never convert an inference into a résumé fact');
    expect(system).toContain('easy | medium | hard');
    expect(system).toContain('If gaps is non-empty, satisfy the mandatory gap quota');
    expect(system).toContain('If gaps is empty, include at least one jd system_scenario slot');
    expect(system).toContain('jd + gap combined');
    expect(system).toContain('≥60%');
    expect(system).toContain('resume: at most 4 slots');
    expect(system).toContain('covering at least 3 distinct JD requirements');
    expect(system).toContain('professional');
    expect(system).toContain('exactly 6 slots');
    expect(system).toContain('重点考察技术原理与工程取舍');
    expect(system).toContain('logic');
    expect(system).toContain('exactly 4 slots');
    expect(system).toContain('重点考察问题拆解与验证路径');
    expect(system).toContain('at least 1 middleware_database slot');
    expect(system).toContain('at least 1 project_deep_dive slot');
    expect(system).toContain('at least 1 system_scenario slot');
    expect(system).toContain('at least 1 communication_pressure slot');
    expect(system).toContain('at least 1 hr_motivation slot');
    expect(system).toContain('copy one complete entry exactly from the corresponding source list');
    expect(prompt).toContain('Golang 开发工程师');
    expect(prompt).toContain('重点考察技术原理与工程取舍');
  });

  it('does not impose the eight-question Go portfolio on smaller interviews', () => {
    const { system } = buildInterviewBlueprintPrompt({
      jobTitle: 'Go 工程师',
      jobDescription: '精通 Go，熟悉 MySQL',
      resumeText: '使用 Go 开发服务',
      dimensions: DIMENSIONS,
      questionCount: 5,
    });

    expect(system).not.toContain('at least 1 hr_motivation slot');
    expect(system).not.toContain('at least 1 middleware_database slot');
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

  it('JD 情景题携带来源证据，且不当作候选人过往经历', () => {
    const jdScenario: InterviewQuestion[] = [{
      ...questions[0],
      category: 'system_scenario',
      source: 'jd',
      evidence: 'JD requires high-concurrency AI conversations',
    }];
    const { system, prompt } = buildEvaluationPrompt({
      jobTitle: 'Backend Engineer',
      jobDescription: 'Build high-concurrency AI conversations',
      resumeText: 'Built internal admin tools',
      dimensions: DIMENSIONS,
      questions: jdScenario,
      transcript: 'The candidate would first measure queue latency.',
    });

    expect(prompt).toContain('Category: system_scenario');
    expect(prompt).toContain('Source: jd');
    expect(prompt).toContain('Evidence: JD requires high-concurrency AI conversations');
    expect(system).toContain("A JD-sourced question's premise, reference answer, or hypothetical reasoning is not evidence of prior experience");
    expect(system).toContain("A gap-sourced question's premise, reference answer, or hypothetical reasoning is not evidence of prior experience");
    expect(system).toContain("An explicit concrete prior-work account in the candidate's recorded answer or transcript may be treated as interview evidence");
  });

  it('规范化后的历史题不把默认来源当作候选人经历证据', () => {
    const [legacyQuestion] = normalizeQuestions([questions[0]])!;
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: [legacyQuestion],
      transcript: 'x',
    });

    expect(legacyQuestion).toMatchObject({ source: 'resume', evidence: '' });
    expect(prompt).not.toContain('Category:');
    expect(prompt).not.toContain('Source:');
    expect(prompt).not.toContain('Evidence:');
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
    expect(system).toContain('3-5 substantive advantages');
    expect(system).toContain('3-5 substantive weaknesses or risks');
    expect(system).toContain('600-1000 Chinese');
    expect(system).toContain('match against the JD');
    expect(system).toContain('Distinguish "not demonstrated" from "cannot do"');
  });

  it('评价采用 HR 内部决策口径并禁止称呼、身份化和证据外推', () => {
    const { system, prompt } = buildEvaluationPrompt({
      jobTitle: 'AI 实习生',
      jobDescription: '负责 Python CLI 与 Agent 工程化',
      resumeText: '参与 RAG 项目',
      dimensions: [
        ...DIMENSIONS,
        { key: 'communication', label: '沟通协作', weight: 2, custom: false },
      ],
      questions,
      transcript: 'x',
    });

    expect(system).toContain('internal hiring decision memo for HR');
    expect(system).toContain('Never use the candidate name');
    expect(system).toContain('Do not use demographic or identity labels');
    expect(system).toContain('本轮未验证');
    expect(system).toContain('岗位匹配');
    expect(system).toContain('已验证能力');
    expect(system).toContain('主要风险');
    expect(system).toContain('录用建议');
    expect(prompt).toContain('Interview coverage: 1 questions across 1 of 3 configured dimensions');
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

  it('禁止偏题式冷知识，并要求不同题型遵循真实面试提问链', () => {
    expect(system).toContain('Do not ask for an obscure constant, default value, API name, or library name');
    expect(system).toContain('Project deep-dive stem');
    expect(system).toContain('Scenario stem');
    expect(system).toContain('Fundamentals stem');
    expect(system).toContain('Behavioral / pressure stem');
    expect(system).toContain('JD must-have');
  });

  it('返回格式里追问是「目的 + 问题」的对象', () => {
    expect(system).toContain('"followUps":[{"purpose":');
  });
});
