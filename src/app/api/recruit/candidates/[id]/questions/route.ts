import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { extractJson } from '@/lib/ai/extract-json';
import { questionsOutputSchema } from '@/lib/ai/recruit-schema';
import { buildDimensionQuestionsPrompt, planQuestionGeneration } from '@/lib/ai/recruit-prompts';
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

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const tasks = planQuestionGeneration({
      jobTitle: job.title,
      jobDescription: job.jobDescription,
      resumeText: candidate.resumeText,
      dimensions,
      questionCount: job.questionCount,
    });

    // 一个维度一路请求，并发发出去。拆开出题的题目质量高得多
    // （每一路只盯一个考察点），顺带把耗时从「串行出 14 题」压到「最慢的那一路」。
    const settled = await Promise.allSettled(
      tasks.map(async ({ dimension, count }) => {
        const { system, prompt } = buildDimensionQuestionsPrompt({
          jobTitle: job.title,
          jobDescription: job.jobDescription,
          resumeText: candidate.resumeText,
          dimensions,
          dimension,
          count,
        });

        const result = await generateText({
          model,
          maxOutputTokens: 8192,
          system,
          prompt,
          providerOptions: getJsonProviderOptions(aiConfig),
        });

        const parsed = extractJson(result.text, questionsOutputSchema);
        // 模型偶尔会把 label 当 key 返回，或者多出/少出一两道。key 直接按这一路
        // 的维度覆盖掉（这一路本来就只出这个维度），题数只截上限不补齐——
        // 少一道比塞一道凑数的题好。
        return parsed.questions.slice(0, count).map((q) => ({ ...q, dimension: dimension.key }));
      }),
    );

    const failures = settled.filter((s) => s.status === 'rejected');
    for (const f of failures) {
      console.error('[recruit] one dimension failed to generate:', (f as PromiseRejectedResult).reason);
    }

    // 按维度顺序拼回去，题目列表才不会因为哪一路先返回而乱序。
    const raw = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

    if (raw.length === 0) {
      return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
    }

    // id 由服务端生成——模型返回的 id 可能重复或缺失，而后面的评估要靠它对齐题目。
    const questions: InterviewQuestion[] = raw.map((q) => ({
      id: crypto.randomUUID(),
      dimension: q.dimension,
      question: q.question,
      intent: q.intent,
      rubric: q.rubric,
      followUps: q.followUps,
      referencePoints: q.referencePoints,
      redFlags: q.redFlags,
      referenceAnswer: q.referenceAnswer,
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
