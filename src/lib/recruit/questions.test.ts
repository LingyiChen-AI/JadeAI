import { describe, it, expect } from 'vitest';
import {
  markQuestionSkipped,
  normalizeFollowUps,
  normalizeQuestions,
  questionsForEvaluation,
  setQuestionAnswer,
} from './questions';

describe('normalizeFollowUps', () => {
  it('老数据的纯字符串补成 purpose 为空', () => {
    expect(normalizeFollowUps(['当时 QPS 多少'])).toEqual([
      { purpose: '', question: '当时 QPS 多少', answer: '' },
    ]);
  });

  it('新数据的对象原样保留', () => {
    expect(normalizeFollowUps([{ purpose: '要细节', question: '多少', answer: '3 万' }])).toEqual([
      { purpose: '要细节', question: '多少', answer: '3 万' },
    ]);
  });

  it('新旧混在一起也能处理', () => {
    expect(normalizeFollowUps(['旧', { purpose: '挑战', question: '新' }])).toEqual([
      { purpose: '', question: '旧', answer: '' },
      { purpose: '挑战', question: '新', answer: '' },
    ]);
  });

  it('丢掉空条目——否则列表里会出现空行，计数还是对的', () => {
    expect(normalizeFollowUps(['  ', { question: '' }, null, 42])).toEqual([]);
  });

  it('purpose 不是字符串时退成空', () => {
    expect(normalizeFollowUps([{ purpose: 123, question: '问' }])).toEqual([
      { purpose: '', question: '问', answer: '' },
    ]);
  });

  it('不是数组时返回空数组', () => {
    expect(normalizeFollowUps(null)).toEqual([]);
    expect(normalizeFollowUps(undefined)).toEqual([]);
  });
});

describe('normalizeQuestions', () => {
  it('没有题目时返回 null，不是空数组', () => {
    expect(normalizeQuestions(null)).toBeNull();
  });

  it('规整每一道题，其余字段原样带过', () => {
    const out = normalizeQuestions([
      {
        id: 'q1',
        dimension: 'logic',
        question: '题干',
        intent: '意图',
        rubric: { excellent: 'a', pass: 'b', fail: 'c' },
        followUps: ['旧格式'],
        referencePoints: ['要点'],
        estimatedMinutes: 5,
        difficulty: 'medium',
        answer: '记过的答案',
      },
    ] as never);
    expect(out![0].followUps).toEqual([{ purpose: '', question: '旧格式', answer: '' }]);
    expect(out![0].answer).toBe('记过的答案');
    expect(out![0].referencePoints).toEqual(['要点']);
    expect(out![0].status).toBe('answered');
  });

  it('老题目根据答案补齐 pending 或 answered 状态', () => {
    const base = {
      id: 'q', dimension: 'logic', question: '题', intent: '',
      rubric: { excellent: '', pass: '', fail: '' }, followUps: [],
      referencePoints: [], estimatedMinutes: 5, difficulty: 'medium',
    };
    const out = normalizeQuestions([
      { ...base, id: 'blank', answer: '  ' },
      { ...base, id: 'done', answer: '记录' },
    ] as never)!;
    expect(out.map((q) => q.status)).toEqual(['pending', 'answered']);
  });

  it('保留合法 skipped 状态，非法状态按答案重新推导', () => {
    const base = {
      id: 'q', dimension: 'logic', question: '题', intent: '',
      rubric: { excellent: '', pass: '', fail: '' }, followUps: [],
      referencePoints: [], estimatedMinutes: 5, difficulty: 'medium', answer: '',
    };
    const out = normalizeQuestions([
      { ...base, id: 'skip', status: 'skipped' },
      { ...base, id: 'bad', status: 'unknown', answer: '记录' },
    ] as never)!;
    expect(out.map((q) => q.status)).toEqual(['skipped', 'answered']);
  });

  it('为旧题补齐默认元数据，同时保留新题的元数据', () => {
    const legacyQuestion = {
      id: 'legacy', dimension: 'logic', question: '题', intent: '',
      rubric: { excellent: '', pass: '', fail: '' }, followUps: [],
      referencePoints: [], estimatedMinutes: 5, difficulty: 'medium',
    };
    const [legacy] = normalizeQuestions([legacyQuestion] as never)!;
    expect(legacy).toMatchObject({
      category: 'project_deep_dive',
      source: 'resume',
      evidence: '',
    });

    const [modern] = normalizeQuestions([{
      ...legacyQuestion,
      category: 'go_fundamentals',
      source: 'jd',
      evidence: 'JD 要求 Go 高性能优化',
    }] as never)!;
    expect(modern).toMatchObject({
      category: 'go_fundamentals',
      source: 'jd',
      evidence: 'JD 要求 Go 高性能优化',
    });
  });

  it('将无效元数据归一为旧题默认值', () => {
    const [question] = normalizeQuestions([{
      id: 'invalid', dimension: 'logic', question: '题', intent: '',
      rubric: { excellent: '', pass: '', fail: '' }, followUps: [],
      referencePoints: [], estimatedMinutes: 5, difficulty: 'medium',
      category: 'unknown', source: 'unknown', evidence: 42,
    }] as never)!;

    expect(question).toMatchObject({
      category: 'project_deep_dive',
      source: 'resume',
      evidence: '',
    });
  });
});

describe('题目状态转换', () => {
  const question = {
    id: 'q1', dimension: 'logic', question: '题干', intent: '',
    rubric: { excellent: '', pass: '', fail: '' }, followUps: [], referencePoints: [],
    estimatedMinutes: 5, difficulty: 'medium' as const, status: 'pending' as const,
  };

  it('填写答案变为 answered，清空答案恢复 pending', () => {
    const answered = setQuestionAnswer(question, '候选人回答');
    expect(answered).toMatchObject({ answer: '候选人回答', status: 'answered' });
    expect(setQuestionAnswer(answered, '  ')).toMatchObject({ answer: '  ', status: 'pending' });
  });

  it('跳过时清空答案并标记 skipped', () => {
    expect(markQuestionSkipped({ ...question, answer: '草稿', status: 'answered' })).toMatchObject({
      answer: '',
      status: 'skipped',
    });
  });

  it('评分题集彻底排除 skipped 题', () => {
    const answered = setQuestionAnswer(question, '回答');
    const skipped = markQuestionSkipped({ ...question, id: 'q2' });
    expect(questionsForEvaluation([answered, skipped]).map((q) => q.id)).toEqual(['q1']);
  });
});
