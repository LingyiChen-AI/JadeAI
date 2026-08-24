import { describe, expect, it } from 'vitest';
import { countAnswered, countSkipped, hasAnyAnswer } from './answers';
import type { InterviewQuestion } from '@/types/recruit';

function q(id: string, answer?: string): InterviewQuestion {
  return {
    id,
    dimension: 'logic',
    question: 'Q',
    intent: 'I',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    followUps: [],
    referencePoints: [],
    estimatedMinutes: 5,
    difficulty: 'medium',
    ...(answer === undefined ? {} : { answer }),
  };
}

describe('countAnswered', () => {
  it('数出填了答案的题', () => {
    expect(countAnswered([q('1', '答了'), q('2'), q('3', '也答了')])).toBe(2);
  });

  it('只有空白字符的不算已记录', () => {
    expect(countAnswered([q('1', '   '), q('2', '\n\t'), q('3', '')])).toBe(0);
  });

  it('没有 answer 字段的不算', () => {
    expect(countAnswered([q('1'), q('2')])).toBe(0);
  });

  it('空数组返回 0', () => {
    expect(countAnswered([])).toBe(0);
  });
});

describe('跳过题统计', () => {
  it('只统计 skipped，且跳过题即使有旧答案也不算已回答', () => {
    const questions = [
      { answer: '旧答案', status: 'skipped' },
      { answer: '有效答案', status: 'answered' },
      { answer: '', status: 'pending' },
    ] as never;
    expect(countSkipped(questions)).toBe(1);
    expect(countAnswered(questions)).toBe(1);
    expect(hasAnyAnswer([questions[0]])).toBe(false);
  });
});

describe('hasAnyAnswer', () => {
  it('至少一道题有实质内容就返回 true', () => {
    expect(hasAnyAnswer([q('1'), q('2', '答了')])).toBe(true);
  });

  it('全是空白答案返回 false', () => {
    expect(hasAnyAnswer([q('1', '  '), q('2')])).toBe(false);
  });

  it('空数组返回 false', () => {
    expect(hasAnyAnswer([])).toBe(false);
  });
});
