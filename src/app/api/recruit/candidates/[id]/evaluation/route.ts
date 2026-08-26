import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { extractJson } from '@/lib/ai/extract-json';
import { evaluationOutputSchema } from '@/lib/ai/recruit-schema';
import { buildEvaluationPrompt } from '@/lib/ai/recruit-prompts';
import { computeOverallScore } from '@/lib/recruit/scoring';
import { hasAnyAnswer } from '@/lib/recruit/answers';
import { questionsForEvaluation } from '@/lib/recruit/questions';
import { finalizeEvaluationForHr } from '@/lib/recruit/evaluation';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { requireOwnedCandidate } from '@/lib/recruit/access';
import type {
  DimensionConfig,
  DimensionScore,
  InterviewQuestion,
  QuestionEvaluation,
} from '@/types/recruit';

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedCandidate(request, id);
    if ('error' in access) return access.error;

    const { candidate, job } = access;
    const allQuestions = (candidate.questions as InterviewQuestion[] | null) ?? [];

    if (!allQuestions.length) {
      return NextResponse.json({ error: 'Generate questions first' }, { status: 400 });
    }
    const questions = questionsForEvaluation(allQuestions);
    if (!questions.length) {
      return NextResponse.json({ error: 'All interview questions were skipped' }, { status: 400 });
    }
    // 逐题记录和粘贴整段记录二选一即可——只逐题记的场景 transcript 会是空的。
    if (!candidate.transcript?.trim() && !hasAnyAnswer(questions)) {
      return NextResponse.json({ error: 'Interview transcript is required' }, { status: 400 });
    }

    const dimensions = ((candidate.dimensionsOverride as DimensionConfig[] | null) ??
      (job.dimensions as DimensionConfig[])) as DimensionConfig[];

    const { system, prompt } = buildEvaluationPrompt({
      jobTitle: job.title,
      jobDescription: job.jobDescription,
      resumeText: candidate.resumeText,
      dimensions,
      questions,
      transcript: candidate.transcript,
    });

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 16384,
      system,
      prompt,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    const parsed = extractJson(result.text, evaluationOutputSchema);

    // 把模型的逐题评估对齐回真实题目。模型可能漏题或编造 questionId，
    // 以我们自己的题目列表为准。
    const byId = new Map(parsed.questionEvaluations.map((e) => [e.questionId, e]));
    const questionEvaluations: QuestionEvaluation[] = questions.map((q) => {
      const e = byId.get(q.id);
      return {
        questionId: q.id,
        question: q.question,
        answerSummary: e?.answerSummary ?? '',
        answered: e?.answered ?? false,
        score: e?.answered ? e.score : 0,
        highlights: e?.highlights ?? [],
        weaknesses: e?.weaknesses ?? [],
      };
    });

    // 某个维度一道题都没答的话，把它的权重置 0——computeOverallScore 会把
    // weight <= 0 的维度排除掉，这样没问到的维度不会把总分拉低。
    const answeredDimensions = new Set(
      questionEvaluations
        .filter((e) => e.answered)
        .map((e) => questions.find((q) => q.id === e.questionId)?.dimension)
        .filter(Boolean) as string[],
    );

    const scoreByKey = new Map(parsed.dimensionScores.map((d) => [d.key, d.score]));
    const dimensionScores: DimensionScore[] = dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      score: answeredDimensions.has(d.key) ? (scoreByKey.get(d.key) ?? 0) : 0,
      weight: answeredDimensions.has(d.key) ? d.weight : 0,
    }));

    const overallScore = computeOverallScore(dimensionScores);
    const finalized = finalizeEvaluationForHr({
      ...parsed,
      questionEvaluations: questionEvaluations.map((evaluation) => ({
        questionId: evaluation.questionId,
        answerSummary: evaluation.answerSummary,
        answered: evaluation.answered,
        score: evaluation.score,
        highlights: evaluation.highlights,
        weaknesses: evaluation.weaknesses,
      })),
    }, {
      candidateName: candidate.name,
      substantiveQuestionCount: questionEvaluations.filter((evaluation) => evaluation.answered).length,
      assessedDimensionCount: answeredDimensions.size,
      configuredDimensionCount: dimensions.length,
    });
    const finalizedQuestionById = new Map(
      finalized.questionEvaluations.map((evaluation) => [evaluation.questionId, evaluation]),
    );
    const finalizedQuestionEvaluations = questionEvaluations.map((evaluation) => ({
      ...evaluation,
      ...(finalizedQuestionById.get(evaluation.questionId) ?? {}),
    }));

    const evaluation = await recruitRepository.upsertEvaluation({
      candidateId: id,
      overallScore,
      dimensionScores,
      questionEvaluations: finalizedQuestionEvaluations,
      recommendation: finalized.recommendation,
      recommendationReason: finalized.recommendationReason,
      strengths: finalized.strengths,
      concerns: finalized.concerns,
      overallComment: finalized.overallComment,
    });

    await recruitRepository.updateCandidate(id, { status: 'evaluated' });

    return NextResponse.json({ evaluation });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] evaluation failed:', error);
    return NextResponse.json({ error: 'Failed to generate evaluation' }, { status: 500 });
  }
}
