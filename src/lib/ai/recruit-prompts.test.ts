import { describe, expect, it } from 'vitest';
import { buildQuestionsPrompt, buildEvaluationPrompt } from './recruit-prompts';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const DIMENSIONS: DimensionConfig[] = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

describe('buildQuestionsPrompt', () => {
  it('把每个维度分到几题写进 prompt', () => {
    const { prompt } = buildQuestionsPrompt({
      jobTitle: '高级前端工程师',
      jobDescription: 'JD 正文',
      resumeText: '简历正文',
      dimensions: DIMENSIONS,
      questionCount: 10,
    });
    // 3:2 权重、共 10 题 -> 专业技能 6 题、逻辑思维 4 题
    expect(prompt).toContain('专业技能');
    expect(prompt).toMatch(/专业技能[^\n]*6/);
    expect(prompt).toMatch(/逻辑思维[^\n]*4/);
  });

  it('返回的 allocation 与写进 prompt 的一致，供调用方校验模型输出', () => {
    const { allocation } = buildQuestionsPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questionCount: 10,
    });
    expect(allocation).toEqual({ professional: 6, logic: 4 });
  });

  it('JD 和简历正文都进了 prompt', () => {
    const { prompt } = buildQuestionsPrompt({
      jobTitle: '后端工程师',
      jobDescription: '需要熟悉分布式事务',
      resumeText: '在某厂做过订单系统',
      dimensions: DIMENSIONS,
      questionCount: 5,
    });
    expect(prompt).toContain('需要熟悉分布式事务');
    expect(prompt).toContain('在某厂做过订单系统');
  });

  it('system prompt 要求输出纯 JSON', () => {
    const { system } = buildQuestionsPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questionCount: 5,
    });
    expect(system).toContain('JSON');
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
