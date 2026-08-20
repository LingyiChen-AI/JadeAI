import { describe, expect, it } from 'vitest';
import {
  buildDimensionQuestionsPrompt,
  planQuestionGeneration,
  buildEvaluationPrompt,
} from './recruit-prompts';
import { PRESET_DIMENSION_GUIDES } from '@/lib/recruit/dimension-guides';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

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

  it('JD、简历、维度和题数都进了 prompt', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      count: 6,
    });
    expect(prompt).toContain('需要熟悉分布式事务');
    expect(prompt).toContain('在某厂做过订单系统');
    expect(prompt).toContain('professional');
    expect(prompt).toContain('exactly 6 questions');
  });

  it('用户填的维度描述整段进 prompt', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: { ...DIMENSIONS[0], description: '重点问 Kafka 消息重复消费怎么处理' },
      count: 2,
    });
    expect(prompt).toContain('重点问 Kafka 消息重复消费怎么处理');
  });

  it('没填描述时退回预置指引', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      count: 2,
    });
    expect(prompt).toContain(PRESET_DIMENSION_GUIDES.professional);
  });

  it('告诉模型别人负责哪些维度，避免出重复的题', () => {
    const { prompt } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      count: 2,
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
      count: 1,
    });
    expect(prompt).not.toContain('How to probe this competency');
  });

  it('system prompt 要求纯 JSON，且带参考答案字段', () => {
    const { system } = buildDimensionQuestionsPrompt({
      ...base,
      dimension: DIMENSIONS[0],
      count: 1,
    });
    expect(system).toContain('JSON');
    expect(system).toContain('referenceAnswer');
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
