import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { analysisRepository } from '@/lib/db/repositories/analysis.repository';
import { jdAnalysisInputSchema, jdAnalysisOutputSchema } from '@/lib/ai/jd-analysis-schema';
import { extractJson } from '@/lib/ai/extract-json';
import { serializeResumeForModel } from '@/lib/ai/model-context';

const JD_ANALYSIS_PROMPT = `You are an expert resume analyst and career coach. Analyze the match between the provided resume and job description.

IMPORTANT: Detect the primary language of the resume content. You MUST respond entirely in the same language as the resume. If the resume is written in Chinese, all your output (summary, suggestions, keywords) must be in Chinese. If in English, respond in English. Match the resume's language exactly.

Your analysis should be thorough and actionable. You MUST return a JSON object with these exact fields:
- overallScore (number 0-100): Overall match rating
- keywordMatches (string[]): Keywords from the JD that ARE present in the resume
- missingKeywords (string[]): Important keywords from the JD that are NOT in the resume
- suggestions (array of {section, current, suggested}): Actionable improvement suggestions
- atsScore (number 0-100): ATS compatibility rating
- summary (string): Concise overall assessment

CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = jdAnalysisInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { resumeId, jobDescription } = parsed.data;

    // Fetch the resume and verify ownership
    const resume = await resumeRepository.findById(resumeId);
    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }
    if (resume.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resumeContext = serializeResumeForModel(resume.sections);
    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 8192,
      system: JD_ANALYSIS_PROMPT,
      prompt: `Resume:\n${resumeContext}\n\nJob Description:\n${jobDescription}\n\nRespond with JSON only.`,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    const analysisData = extractJson(result.text, jdAnalysisOutputSchema);

    // Persist to database
    let historyId: string | undefined;
    try {
      const saved = await analysisRepository.createJdAnalysis({
        resumeId,
        jobDescription,
        result: analysisData,
        overallScore: analysisData.overallScore,
        atsScore: analysisData.atsScore,
      });
      historyId = saved?.id;
    } catch (e) {
      console.error('Failed to save JD analysis history:', e);
    }

    return NextResponse.json({ ...analysisData, historyId });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/jd-analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze job description match' }, { status: 500 });
  }
}
