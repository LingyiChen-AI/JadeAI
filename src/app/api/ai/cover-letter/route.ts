import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { coverLetterInputSchema } from '@/lib/ai/cover-letter-schema';
import { serializeResumeForModel } from '@/lib/ai/model-context';

interface CoverLetterOutput {
  title: string;
  content: string;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Use a formal, professional tone. Be respectful and polished. Avoid casual language.',
  friendly: 'Use a warm, approachable tone while remaining professional. Show enthusiasm and personality.',
  confident: 'Use a confident, assertive tone. Highlight achievements boldly. Show strong conviction in your abilities.',
};

function getSystemPrompt(tone: string, language: string): string {
  const LANG_NAMES: Record<string, string> = {
    zh: 'Simplified Chinese', en: 'English', ja: 'Japanese', ko: 'Korean',
    fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic',
  };
  const lang = LANG_NAMES[language] || 'English';
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.formal;

  return `You are an expert cover letter writer. Write a tailored cover letter in ${lang}.

Tone: ${toneInstruction}

Cover letter guidelines:
- Carefully analyze the resume data and job description to identify the strongest matching points
- Open with a compelling hook — not a generic "I am writing to apply"
- Connect specific resume achievements to job requirements
- Show knowledge of the company/role based on the JD
- Highlight 2-3 key accomplishments that directly relate to the position
- Close with a confident call to action
- Keep the letter concise (3-4 paragraphs, ~300-400 words)
- Generate an appropriate title like "Cover Letter for [Position] at [Company]"

Output format — use EXACTLY this structure:
TITLE: <your title here>
---CONTENT---
<your full cover letter here>

Do NOT use JSON. Do NOT use markdown code fences. Just follow the format above.`;
}

/** Parse delimiter-based output: TITLE: ...\n---CONTENT---\n... */
function parseCoverLetter(text: string): CoverLetterOutput {
  const separator = '---CONTENT---';
  const sepIndex = text.indexOf(separator);
  if (sepIndex !== -1) {
    const titlePart = text.slice(0, sepIndex).trim();
    const content = text.slice(sepIndex + separator.length).trim();
    const title = titlePart.replace(/^TITLE:\s*/i, '').trim();
    return { title, content };
  }
  // Fallback: try to extract title from first line
  const lines = text.trim().split('\n');
  const firstLine = lines[0].replace(/^#+\s*/, '').replace(/^TITLE:\s*/i, '').trim();
  const content = lines.slice(1).join('\n').trim();
  return { title: firstLine, content: content || text.trim() };
}

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = coverLetterInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { resumeId, jobDescription, tone, language } = parsed.data;
    const lang = language || 'zh';

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
      maxOutputTokens: 4096,
      system: getSystemPrompt(tone, lang),
      prompt: `## Resume Data
${resumeContext}

## Job Description
${jobDescription}

Based on this resume and job description, write a tailored cover letter. Use the TITLE:/---CONTENT--- format specified in the system prompt.`,
    });

    const coverLetterData: CoverLetterOutput = parseCoverLetter(result.text);

    return NextResponse.json(coverLetterData);
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/cover-letter error:', error);
    return NextResponse.json({ error: 'Failed to generate cover letter' }, { status: 500 });
  }
}
