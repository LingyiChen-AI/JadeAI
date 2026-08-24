import { describe, expect, it } from 'vitest';
import { extractJson } from './extract-json';
import {
  interviewBlueprintOutputSchema,
  questionsOutputSchema,
  evaluationOutputSchema,
  dimensionsSchema,
} from './recruit-schema';

describe('interviewBlueprintOutputSchema', () => {
  const validBlueprint = {
    resumeFacts: ['食品产线项目使用 Go、MQTT、ONNX Runtime'],
    jdRequirements: ['Go 并发与高性能服务'],
    gaps: ['简历未证明 Prometheus 实践'],
    slots: [{
      category: 'go_fundamentals',
      source: 'jd',
      dimension: 'professional',
      topic: 'GMP 调度与阻塞',
      evidence: 'JD 要求 3 年以上 Golang 和高性能优化',
      difficulty: 'hard',
    }],
  };

  it('解析第一阶段的面试蓝图', () => {
    expect(interviewBlueprintOutputSchema.parse(validBlueprint)).toEqual(validBlueprint);
  });

  it('拒绝不支持的问题来源', () => {
    expect(() => interviewBlueprintOutputSchema.parse({
      ...validBlueprint,
      slots: [{ ...validBlueprint.slots[0], source: 'guess' }],
    })).toThrow();
  });

  it('拒绝不支持的问题分类', () => {
    expect(() => interviewBlueprintOutputSchema.parse({
      ...validBlueprint,
      slots: [{ ...validBlueprint.slots[0], category: 'guess' }],
    })).toThrow();
  });
});

describe('questionsOutputSchema', () => {
  it('解析正常的题目输出', () => {
    const raw = JSON.stringify({
      questions: [
        {
          dimension: 'logic',
          question: '讲一个你排查过的线上问题',
          intent: '看拆解问题的路径',
          rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只复述结论' },
          followUps: ['当时为什么先怀疑这里？'],
          referencePoints: ['定位手段'],
          estimatedMinutes: 8,
          difficulty: 'medium',
        },
      ],
    });
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].dimension).toBe('logic');
  });

  it('容忍模型漏掉 followUps / referencePoints，补成空数组', () => {
    const raw = JSON.stringify({
      questions: [
        {
          dimension: 'stress',
          question: '需求临时砍半你怎么办',
          intent: '看情绪稳定性',
          rubric: { excellent: 'a', pass: 'b', fail: 'c' },
          estimatedMinutes: 5,
          difficulty: 'easy',
        },
      ],
    });
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions[0].followUps).toEqual([]);
    expect(result.questions[0].referencePoints).toEqual([]);
  });

  it('接受没有 category、source、evidence 的历史题目输出', () => {
    const result = questionsOutputSchema.parse({
      questions: [{
        dimension: 'logic',
        question: '讲一个你排查过的线上问题',
        intent: '看拆解问题的路径',
        rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只复述结论' },
        followUps: [],
        referencePoints: [],
        estimatedMinutes: 8,
        difficulty: 'medium',
      }],
    });
    expect(result.questions[0]).not.toHaveProperty('category');
    expect(result.questions[0]).not.toHaveProperty('source');
    expect(result.questions[0]).not.toHaveProperty('evidence');
  });

  it('难度值不在枚举里时降级成 medium', () => {
    const raw = JSON.stringify({
      questions: [
        {
          dimension: 'logic',
          question: 'q',
          intent: 'i',
          rubric: { excellent: 'a', pass: 'b', fail: 'c' },
          estimatedMinutes: 5,
          difficulty: '中等',
        },
      ],
    });
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions[0].difficulty).toBe('medium');
  });

  it('能从带 markdown 代码围栏的输出里提取', () => {
    const raw = '```json\n' + JSON.stringify({
      questions: [
        {
          dimension: 'logic',
          question: 'q',
          intent: 'i',
          rubric: { excellent: 'a', pass: 'b', fail: 'c' },
          estimatedMinutes: 5,
          difficulty: 'hard',
        },
      ],
    }) + '\n```';
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions[0].difficulty).toBe('hard');
  });

  it('完全不是 JSON 时抛错', () => {
    expect(() => extractJson('抱歉，我无法完成这个请求。', questionsOutputSchema)).toThrow();
  });
});

describe('evaluationOutputSchema', () => {
  const valid = {
    questionEvaluations: [
      {
        questionId: 'q1',
        answerSummary: '讲了一个缓存击穿的排查过程',
        answered: true,
        score: 82,
        highlights: ['有量化'],
        weaknesses: ['没说清最终收益'],
      },
    ],
    dimensionScores: [{ key: 'logic', score: 82 }],
    strengths: ['逻辑清晰'],
    concerns: ['缺乏大规模系统经验'],
    overallComment: '整体符合预期',
    recommendation: 'hire',
    recommendationReason: '基础扎实，可以进入下一轮',
  };

  it('解析正常的评价输出', () => {
    const result = extractJson(JSON.stringify(valid), evaluationOutputSchema);
    expect(result.recommendation).toBe('hire');
    expect(result.dimensionScores[0].score).toBe(82);
  });

  it('分数超出 0-100 时钳到边界，而不是整份丢弃', () => {
    const raw = JSON.stringify({
      ...valid,
      dimensionScores: [{ key: 'logic', score: 120 }],
      questionEvaluations: [{ ...valid.questionEvaluations[0], score: -5 }],
    });
    const result = extractJson(raw, evaluationOutputSchema);
    expect(result.dimensionScores[0].score).toBe(100);
    expect(result.questionEvaluations[0].score).toBe(0);
  });

  it('recommendation 不在枚举里时降级成 hold', () => {
    const raw = JSON.stringify({ ...valid, recommendation: '建议录用' });
    const result = extractJson(raw, evaluationOutputSchema);
    expect(result.recommendation).toBe('hold');
  });

  it('容忍 strengths / concerns 缺失', () => {
    const { strengths, concerns, ...rest } = valid;
    const result = extractJson(JSON.stringify(rest), evaluationOutputSchema);
    expect(result.strengths).toEqual([]);
    expect(result.concerns).toEqual([]);
  });
});

describe('dimensionsSchema', () => {
  const ok = { key: 'logic', label: '逻辑思维', weight: 2, custom: false };

  it('接受合法的维度配置', () => {
    expect(dimensionsSchema.safeParse([ok]).success).toBe(true);
  });

  it('拒绝空数组', () => {
    const result = dimensionsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('拒绝重复的 key', () => {
    const result = dimensionsSchema.safeParse([ok, { ...ok, label: '换个名字' }]);
    expect(result.success).toBe(false);
  });

  it('拒绝非正整数的权重', () => {
    expect(dimensionsSchema.safeParse([{ ...ok, weight: 0 }]).success).toBe(false);
    expect(dimensionsSchema.safeParse([{ ...ok, weight: -1 }]).success).toBe(false);
    expect(dimensionsSchema.safeParse([{ ...ok, weight: 1.5 }]).success).toBe(false);
  });

  it('拒绝空的 key 或 label', () => {
    expect(dimensionsSchema.safeParse([{ ...ok, key: '' }]).success).toBe(false);
    expect(dimensionsSchema.safeParse([{ ...ok, label: '' }]).success).toBe(false);
  });
});

describe('questionsOutputSchema · 追问与危险信号', () => {
  const base = {
    dimension: 'logic',
    question: '题干',
    intent: '',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    referencePoints: [],
    estimatedMinutes: 5,
    difficulty: 'medium',
  };

  it('追问给对象时原样保留目的', () => {
    const r = questionsOutputSchema.parse({
      questions: [{ ...base, followUps: [{ purpose: '要细节', question: '当时 QPS 多少' }] }],
    });
    expect(r.questions[0].followUps).toEqual([
      { purpose: '要细节', question: '当时 QPS 多少', answer: '' },
    ]);
  });

  it('模型偷懒给字符串时补成 purpose 为空——老数据也走这条', () => {
    const r = questionsOutputSchema.parse({
      questions: [{ ...base, followUps: ['当时 QPS 多少'] }],
    });
    expect(r.questions[0].followUps).toEqual([
      { purpose: '', question: '当时 QPS 多少', answer: '' },
    ]);
  });

  it('追问整个缺失时补空数组', () => {
    const r = questionsOutputSchema.parse({ questions: [base] });
    expect(r.questions[0].followUps).toEqual([]);
  });

  it('危险信号缺失时补空数组', () => {
    const r = questionsOutputSchema.parse({ questions: [{ ...base, followUps: [] }] });
    expect(r.questions[0].redFlags).toEqual([]);
  });
});

describe('questionsOutputSchema · 追问的参考答案', () => {
  const base = {
    dimension: 'logic',
    question: '题干',
    intent: '',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    referencePoints: [],
    estimatedMinutes: 5,
    difficulty: 'medium',
  };

  it('带答案时原样保留', () => {
    const r = questionsOutputSchema.parse({
      questions: [
        {
          ...base,
          followUps: [{ purpose: '要细节', question: 'QPS 多少', answer: '大促峰值 3 万左右' }],
        },
      ],
    });
    expect(r.questions[0].followUps[0].answer).toBe('大促峰值 3 万左右');
  });

  it('模型漏了答案时补空串，不是 undefined——UI 里少一个字段就是崩', () => {
    const r = questionsOutputSchema.parse({
      questions: [{ ...base, followUps: [{ purpose: '挑战', question: '为什么' }] }],
    });
    expect(r.questions[0].followUps[0].answer).toBe('');
  });
});
