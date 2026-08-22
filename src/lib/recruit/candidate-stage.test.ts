import { describe, it, expect } from 'vitest';
import { candidateStage, stageFromSummary } from './candidate-stage';
import type { CandidateSummary, InterviewQuestion } from '@/types/recruit';

const q = [{ id: 'q1' } as InterviewQuestion];

describe('candidateStage', () => {
  it('什么都没有 -> 传简历', () => {
    expect(candidateStage({ hasEvaluation: false })).toBe('need_resume');
  });

  it('有简历没题目 -> 生成题目', () => {
    expect(candidateStage({ resumeText: '简历正文', hasEvaluation: false })).toBe('need_questions');
  });

  it('有题目没评价 -> 面试中', () => {
    expect(candidateStage({ resumeText: 'r', questions: q, hasEvaluation: false })).toBe(
      'interviewing',
    );
  });

  it('有评价 -> 看报告', () => {
    expect(candidateStage({ resumeText: 'r', questions: q, hasEvaluation: true })).toBe('done');
  });

  it('只有空白字符的简历视同没传', () => {
    expect(candidateStage({ resumeText: '   \n ', hasEvaluation: false })).toBe('need_resume');
  });

  it('空数组题目视同没出题', () => {
    expect(candidateStage({ resumeText: 'r', questions: [], hasEvaluation: false })).toBe(
      'need_questions',
    );
  });

  it('已评价的人即使简历被清空也停在看报告，不会打回第一步', () => {
    expect(candidateStage({ resumeText: '', questions: null, hasEvaluation: true })).toBe('done');
  });
});

describe('stageFromSummary', () => {
  const base: CandidateSummary = {
    id: 'c1',
    name: '张三',
    status: 'pending',
    hasResume: false,
    questionCount: 0,
    answeredCount: 0,
    overallScore: null,
    recommendation: null,
    createdAt: '2026-08-20T00:00:00.000Z',
  };

  it('和 candidateStage 的判定一致', () => {
    expect(stageFromSummary(base)).toBe('need_resume');
    expect(stageFromSummary({ ...base, hasResume: true })).toBe('need_questions');
    expect(stageFromSummary({ ...base, hasResume: true, questionCount: 8 })).toBe('interviewing');
    expect(
      stageFromSummary({ ...base, hasResume: true, questionCount: 8, recommendation: 'hold' }),
    ).toBe('done');
  });

  it('结论是 no_hire 也算已评价', () => {
    expect(stageFromSummary({ ...base, recommendation: 'no_hire' })).toBe('done');
  });
});
