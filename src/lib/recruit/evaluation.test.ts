import { describe, expect, it } from 'vitest';
import { finalizeEvaluationForHr } from './evaluation';

const raw = {
  questionEvaluations: [{
    questionId: 'q1',
    answerSummary: '候选人安俊逸说明使用了混合召回',
    answered: true,
    score: 60,
    highlights: ['该候选人能解释基本流程'],
    weaknesses: ['候选人没有给出评测指标'],
  }],
  dimensionScores: [],
  strengths: ['候选人安俊逸能说明 RAG 召回流程'],
  concerns: ['该候选人未说明 CLI 的异常处理'],
  overallComment: '候选人安俊逸整体符合要求。该候选人仍需补充工程证据。',
  recommendation: 'hire' as const,
  recommendationReason: '候选人安俊逸具备 Agent 项目经验。',
};

describe('finalizeEvaluationForHr', () => {
  it('HR 内部评价不保留姓名或候选人称呼', () => {
    const result = finalizeEvaluationForHr(raw, {
      candidateName: '安俊逸',
      substantiveQuestionCount: 8,
      assessedDimensionCount: 5,
      configuredDimensionCount: 7,
    });

    const narrative = JSON.stringify(result);
    expect(narrative).not.toContain('安俊逸');
    expect(narrative).not.toContain('候选人');
    expect(result.strengths[0]).toBe('能说明 RAG 召回流程');
  });

  it('题目或维度覆盖不足时强制待定并写明补面范围', () => {
    const result = finalizeEvaluationForHr(raw, {
      candidateName: '安俊逸',
      substantiveQuestionCount: 3,
      assessedDimensionCount: 3,
      configuredDimensionCount: 7,
    });

    expect(result.recommendation).toBe('hold');
    expect(result.recommendationReason).toContain('仅完成 3 道有效题');
    expect(result.recommendationReason).toContain('覆盖 3/7 个考察维度');
    expect(result.overallComment).toContain('本轮证据不足');
    expect(result.overallComment).toContain('补充面试');
  });
});
