import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { extractJson } from '@/lib/ai/extract-json';
import { dimensionSuggestionsOutputSchema } from '@/lib/ai/recruit-schema';
import { AIConfigError, extractAIConfig, getJsonProviderOptions, getModel } from '@/lib/ai/provider';
import { detectGoRole } from '@/lib/ai/recruit-blueprint';
import {
  defaultDimensions,
  QUESTION_DIMENSION_DESCRIPTIONS,
  QUESTION_DIMENSION_LABELS,
} from '@/lib/recruit/dimensions';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const jobDescription = typeof body.jobDescription === 'string' ? body.jobDescription.trim() : '';
    if (!title || !jobDescription) {
      return NextResponse.json({ error: 'Job title and JD are required' }, { status: 400 });
    }

    const isGoRole = detectGoRole(title, jobDescription);
    const base = defaultDimensions(
      (key) => QUESTION_DIMENSION_LABELS[key as keyof typeof QUESTION_DIMENSION_LABELS] ?? key,
      (key) => QUESTION_DIMENSION_DESCRIPTIONS[key as keyof typeof QUESTION_DIMENSION_DESCRIPTIONS] ?? key,
      isGoRole,
    );
    const allowedKeys = base.map((dimension) => dimension.key);
    const aiConfig = extractAIConfig(request);
    const result = await generateText({
      model: getModel(aiConfig),
      maxOutputTokens: 4096,
      providerOptions: getJsonProviderOptions(aiConfig),
      system: `You design interview scoring dimensions from a job description. Return strict JSON only.
Use exactly these dimension keys, once each: ${allowedKeys.join(', ')}.
For every dimension provide:
- weight: integer 1-5 meaning the exact number of questions to generate for this dimension;
- description: 250-600 Chinese characters, written as a professional competency model using exactly these sections:
  【考察目标】【知识/能力范围】【工程实践或行为场景】【追问与验证】【评价重点】.
  Each section must contain JD-specific, actionable content. Cover fundamentals, applied practice, failure diagnosis,
  trade-offs, evidence to request, strong-answer signals, and risk signals where applicable. Do not write a short summary.
Ground every technology-specific scope in the JD. Do not invent required technologies. Keep behavioral dimensions role-specific.
Shape: {"dimensions":[{"key":"...","weight":3,"description":"..."}]}`,
      prompt: `岗位名称：${title}\n\n职位描述（JD）：\n${jobDescription}`,
    });
    const parsed = extractJson(result.text, dimensionSuggestionsOutputSchema);
    const suggestions = new Map(parsed.dimensions.map((dimension) => [dimension.key, dimension]));
    const dimensions = base.map((dimension) => {
      const suggestion = suggestions.get(dimension.key as keyof typeof QUESTION_DIMENSION_LABELS);
      return suggestion
        ? { ...dimension, weight: suggestion.weight, description: suggestion.description }
        : dimension;
    });

    return NextResponse.json({ dimensions });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] dimension suggestion failed:', error);
    return NextResponse.json({ error: 'Failed to suggest dimensions' }, { status: 500 });
  }
}
