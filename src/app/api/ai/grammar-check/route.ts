import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { analysisRepository } from '@/lib/db/repositories/analysis.repository';
import { grammarCheckInputSchema, grammarCheckOutputSchema } from '@/lib/ai/grammar-check-schema';
import { extractJson } from '@/lib/ai/extract-json';
import { sanitizeResumeForModel } from '@/lib/ai/model-context';

const GRAMMAR_CHECK_PROMPT = `You are an expert resume reviewer and writing coach. Analyze the provided resume sections for writing quality issues.

IMPORTANT: Detect the primary language of the resume content. You MUST respond entirely in the same language as the resume. If the resume is written in Chinese, all your output (summary, suggestions, sectionTitle) must be in Chinese. If in English, respond in English. Match the resume's language exactly.

You must detect and report these types of issues:
- grammar: Grammatical errors, incorrect tense, subject-verb disagreement, article misuse
- spelling: Misspelled words or typos
- weak_verb: Weak or passive verbs that should be replaced with strong action verbs
- vague: Vague or generic descriptions that lack specificity
- quantify: Descriptions that could be improved with quantifiable metrics

Analysis guidelines:
- Check every text field in every section: titles, descriptions, highlights, summary text
- For each issue, provide the exact original text and a concrete suggestion
- Set severity: "high" for grammar/spelling errors, "medium" for weak verbs and vague descriptions, "low" for quantify suggestions
- Be thorough but practical — only flag genuinely improvable items
- Provide a brief overall summary of the writing quality
- Assign a score from 0-100 (100 = perfect, no issues found)

You MUST return a JSON object with exactly these fields:
- issues: array of { sectionId, sectionTitle, type, original, suggestion, severity }
- summary: string with overall assessment
- score: number from 0 to 100

CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = grammarCheckInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { resumeId, sectionIds } = parsed.data;

    // Fetch the resume and verify ownership
    const resume = await resumeRepository.findById(resumeId);
    if (!resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }
    if (resume.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Filter sections if specific IDs are provided
    const sectionsToCheck = sectionIds
      ? resume.sections.filter((s: any) => sectionIds.includes(s.id))
      : resume.sections;

    if (sectionsToCheck.length === 0) {
      return NextResponse.json({ error: 'No sections found to check' }, { status: 400 });
    }

    // Prepare sections data for AI analysis
    const sectionsData = sanitizeResumeForModel(sectionsToCheck.map((s: any) => ({
      sectionId: s.id,
      sectionTitle: s.title,
      type: s.type,
      content: s.content,
    })));

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 8192,
      system: GRAMMAR_CHECK_PROMPT,
      prompt: `Analyze the following resume sections. Respond with JSON only.\n\n${JSON.stringify(sectionsData, null, 2)}`,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    console.log('[grammar-check] raw response:\n', result.text);
    const checkResult = extractJson(result.text, grammarCheckOutputSchema);

    // Persist to database
    let historyId: string | undefined;
    try {
      const saved = await analysisRepository.createGrammarCheck({
        resumeId,
        result: checkResult,
        score: checkResult.score,
        issueCount: checkResult.issues.length,
      });
      historyId = saved?.id;
    } catch (e) {
      console.error('Failed to save grammar check history:', e);
    }

    return NextResponse.json({ ...checkResult, historyId });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/grammar-check error:', error);
    return NextResponse.json({ error: 'Failed to check grammar' }, { status: 500 });
  }
}
