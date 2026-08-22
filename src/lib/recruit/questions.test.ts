import { describe, it, expect } from 'vitest';
import { normalizeFollowUps, normalizeQuestions } from './questions';

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
  });
});
