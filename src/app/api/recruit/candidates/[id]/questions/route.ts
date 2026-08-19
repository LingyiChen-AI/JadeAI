import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { extractJson } from '@/lib/ai/extract-json';
import { questionsOutputSchema } from '@/lib/ai/recruit-schema';
import { buildQuestionsPrompt } from '@/lib/ai/recruit-prompts';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { requireOwnedCandidate } from '@/lib/recruit/access';
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
    const dimensions = ((candidate.dimensionsOverride as DimensionConfig[] | null) ??
      (job.dimensions as DimensionConfig[])) as DimensionConfig[];

    if (!dimensions?.length) {
      return NextResponse.json({ error: 'No dimensions configured' }, { status: 400 });
    }

    const { system, prompt } = buildQuestionsPrompt({
      jobTitle: job.title,
      jobDescription: job.jobDescription,
      resumeText: candidate.resumeText,
      dimensions,
      questionCount: job.questionCount,
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

    const parsed = extractJson(result.text, questionsOutputSchema);

    // id 由服务端生成——模型返回的 id 可能重复或缺失，而后面的评估要靠它对齐题目。
    const knownKeys = new Set(dimensions.map((d) => d.key));
    const questions: InterviewQuestion[] = parsed.questions.map((q) => ({
      id: crypto.randomUUID(),
      // 模型偶尔会把 label 当 key 返回，落不到已知维度上就归到第一个维度，
      // 免得这道题在后面的维度打分里变成孤儿。
      dimension: knownKeys.has(q.dimension) ? q.dimension : dimensions[0].key,
      question: q.question,
      intent: q.intent,
      rubric: q.rubric,
      followUps: q.followUps,
      referencePoints: q.referencePoints,
      estimatedMinutes: q.estimatedMinutes,
      difficulty: q.difficulty,
    }));

    const updated = await recruitRepository.updateCandidate(id, {
      questions,
      status: 'questions_ready',
    });

    return NextResponse.json({ candidate: updated });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] question generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
