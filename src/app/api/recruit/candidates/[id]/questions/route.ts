import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { extractJson } from '@/lib/ai/extract-json';
import { interviewBlueprintOutputSchema, questionsOutputSchema } from '@/lib/ai/recruit-schema';
import { buildDimensionQuestionsPrompt, buildInterviewBlueprintPrompt } from '@/lib/ai/recruit-prompts';
import {
  assembleGeneratedQuestions,
  canonicalizeBlueprintEvidence,
  detectGoRole,
  groupBlueprintSlots,
  validateBlueprint,
} from '@/lib/ai/recruit-blueprint';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { requireOwnedCandidate } from '@/lib/recruit/access';
import {
  interviewDimensions,
  QUESTION_DIMENSION_DESCRIPTIONS,
  QUESTION_DIMENSION_LABELS,
} from '@/lib/recruit/dimensions';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedCandidate(request, id);
    if ('error' in access) return access.error;

    const { candidate, job } = access;

    if (!candidate.resumeText) {
      return NextResponse.json(
        { error: 'Candidate resume is required before generating questions' },
        { status: 400 },
      );
    }

    // 候选人可覆盖岗位的维度配置；没覆盖就用岗位的。
    const configuredDimensions = ((candidate.dimensionsOverride as DimensionConfig[] | null) ??
      (job.dimensions as DimensionConfig[])) as DimensionConfig[];
    const isGoRole = detectGoRole(job.title, job.jobDescription);
    const dimensions = interviewDimensions(
      configuredDimensions,
      isGoRole,
      (key) => QUESTION_DIMENSION_DESCRIPTIONS[key as keyof typeof QUESTION_DIMENSION_DESCRIPTIONS] ?? key,
      (key) => QUESTION_DIMENSION_LABELS[key as keyof typeof QUESTION_DIMENSION_LABELS] ?? key,
    );
    const questionCount = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);

    if (!dimensions?.length) {
      return NextResponse.json({ error: 'No dimensions configured' }, { status: 400 });
    }

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const blueprintPrompt = buildInterviewBlueprintPrompt({
      jobTitle: job.title,
      jobDescription: job.jobDescription,
      resumeText: candidate.resumeText,
      dimensions,
      questionCount,
    });
    const blueprintResult = await generateText({
      model,
      maxOutputTokens: 8192,
      system: blueprintPrompt.system,
      prompt: blueprintPrompt.prompt,
      providerOptions: getJsonProviderOptions(aiConfig),
    });
    const extractedBlueprint = canonicalizeBlueprintEvidence(
      extractJson(blueprintResult.text, interviewBlueprintOutputSchema),
    );
    const blueprint = validateBlueprint(
      {
        ...extractedBlueprint,
        // 题型就是评分维度；模型返回的第二套 dimension 不再作为独立分类使用。
        slots: extractedBlueprint.slots.map((slot) => ({ ...slot, dimension: slot.category })),
      },
      {
        questionCount,
        dimensions,
        isGoRole,
        enforceJdCoverage: true,
      },
    );
    const groups = groupBlueprintSlots(blueprint.slots);
    const dimensionsByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));

    // 一个维度一路请求，并发发出去。拆开出题的题目质量高得多
    // （每一路只盯一个考察点），顺带把耗时从「串行出 14 题」压到「最慢的那一路」。
    const settled = await Promise.allSettled(
      groups.map(async (group) => {
        const dimension = dimensionsByKey.get(group.dimension);
        if (!dimension) {
          throw new Error(`Blueprint dimension "${group.dimension}" is not configured.`);
        }
        const { system, prompt } = buildDimensionQuestionsPrompt({
          jobTitle: job.title,
          jobDescription: job.jobDescription,
          resumeText: candidate.resumeText,
          dimensions,
          dimension,
          blueprint,
          slots: group.slots,
        });

        const result = await generateText({
          model,
          maxOutputTokens: 8192,
          system,
          prompt,
          providerOptions: getJsonProviderOptions(aiConfig),
        });

        const parsed = extractJson(result.text, questionsOutputSchema);
        return { slots: group.slots, questions: parsed.questions };
      }),
    );

    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        console.error(
          `[recruit] dimension "${groups[index].dimension}" failed to generate:`,
          result.reason,
        );
      }
    }

    // 只有每个蓝图槽位都生成题目并恢复全局顺序后，才覆盖候选人的旧题。
    const raw = assembleGeneratedQuestions(
      settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
      questionCount,
    );

    // id 由服务端生成——模型返回的 id 可能重复或缺失，而后面的评估要靠它对齐题目。
    const questions: InterviewQuestion[] = raw.map((q) => ({
      id: crypto.randomUUID(),
      dimension: q.dimension,
      category: q.category,
      source: q.source,
      evidence: q.evidence,
      question: q.question,
      intent: q.intent,
      rubric: q.rubric,
      followUps: q.followUps,
      referencePoints: q.referencePoints,
      redFlags: q.redFlags,
      referenceAnswer: q.referenceAnswer,
      estimatedMinutes: q.estimatedMinutes,
      difficulty: q.difficulty,
      status: 'pending',
    }));

    const updated = await recruitRepository.updateCandidate(id, {
      questions,
      dimensionsOverride: dimensions,
      status: 'questions_ready',
    });
    if (job.questionCount !== questionCount) {
      await recruitRepository.updateJob(job.id, { questionCount });
    }

    return NextResponse.json({ candidate: updated });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] question generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
