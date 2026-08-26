import type { EvaluationOutput } from '@/lib/ai/recruit-schema';

interface EvaluationCoverage {
  candidateName: string;
  substantiveQuestionCount: number;
  assessedDimensionCount: number;
  configuredDimensionCount: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCandidateReferences(value: string, candidateName: string): string {
  const name = candidateName.trim();
  const patterns = [
    ...(name ? [`候选人\\s*${escapeRegExp(name)}`, escapeRegExp(name)] : []),
    '该候选人',
    '候选人',
  ];

  return value
    .replace(new RegExp(patterns.join('|'), 'g'), '')
    .replace(/(^|[。！？；]\s*)[，、：；]+/g, '$1')
    .replace(/\s+([，。！？；：])/g, '$1')
    .trim();
}

export function finalizeEvaluationForHr(
  evaluation: EvaluationOutput,
  coverage: EvaluationCoverage,
): EvaluationOutput {
  const clean = (value: string) => stripCandidateReferences(value, coverage.candidateName);
  const insufficientCoverage =
    coverage.substantiveQuestionCount < 5 ||
    coverage.assessedDimensionCount * 2 < coverage.configuredDimensionCount;

  const result: EvaluationOutput = {
    ...evaluation,
    questionEvaluations: evaluation.questionEvaluations.map((item) => ({
      ...item,
      answerSummary: clean(item.answerSummary),
      highlights: item.highlights.map(clean),
      weaknesses: item.weaknesses.map(clean),
    })),
    strengths: evaluation.strengths.map(clean),
    concerns: evaluation.concerns.map(clean),
    overallComment: clean(evaluation.overallComment),
    recommendationReason: clean(evaluation.recommendationReason),
  };

  if (!insufficientCoverage) return result;

  const coverageSummary = `本轮仅完成 ${coverage.substantiveQuestionCount} 道有效题，覆盖 ${coverage.assessedDimensionCount}/${coverage.configuredDimensionCount} 个考察维度`;
  return {
    ...result,
    recommendation: 'hold',
    recommendationReason: `${coverageSummary}，证据不足以支持明确的录用或淘汰结论。建议围绕 JD 必须项及未覆盖维度安排补充面试。`,
    overallComment: `${result.overallComment}\n\n证据充分性：本轮证据不足（${coverageSummary}）。建议补充面试后再形成最终录用结论。`,
  };
}
