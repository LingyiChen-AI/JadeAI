import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { generateResumeInputSchema, type GenerateResumeOutput } from '@/lib/ai/generate-resume-schema';
import { toResumeTemplateBindingInput } from '@/lib/templates/apply-template-binding.server';

const SECTION_TITLES: Record<string, Record<string, string>> = {
  zh: {
    personal_info: '个人信息',
    summary: '个人简介',
    work_experience: '工作经历',
    education: '教育背景',
    skills: '专业技能',
    projects: '项目经历',
  },
  en: {
    personal_info: 'Personal Information',
    summary: 'Professional Summary',
    work_experience: 'Work Experience',
    education: 'Education',
    skills: 'Skills',
    projects: 'Projects',
  },
};

function getSystemPrompt(language: string): string {
  const lang = language === 'en' ? 'English' : 'Simplified Chinese';

  return `You are a professional resume writer. Generate a complete, realistic, and professional resume in ${lang}.

Resume generation guidelines:
- Generate realistic and professional content that would be appropriate for the given job title and experience level
- Use concrete, quantifiable achievements (e.g., "Increased performance by 40%", "Led a team of 8 engineers")
- Create believable company names, institution names, and project names
- Use strong action verbs to start bullet points (e.g., "Spearheaded", "Architected", "Optimized")
- Dates should be in YYYY-MM format
- For personal_info, generate a plausible name, email, phone, and location — do NOT use obviously fake data like "John Doe" or "jane@example.com"
- Skills should be organized into relevant categories (e.g., "Programming Languages", "Frameworks", "Tools")
- The number of work experience items should scale with years of experience (1-2 for junior, 2-3 for mid, 3-4 for senior)
- Include 1-2 education entries
- Include 2-3 project entries with realistic technologies
- Each work experience and project should have 3-5 highlight bullet points
- CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;
}

import { extractJson } from '@/lib/ai/extract-json';
import { normalizeSectionContent } from '@/lib/resume/normalize-content';
import { z } from 'zod/v4';

const generateResumeOutputSchema = z.object({
  personal_info: z.any(),
  summary: z.any(),
  work_experience: z.any(),
  education: z.any(),
  skills: z.any(),
  projects: z.any(),
});

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = generateResumeInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { jobTitle, yearsOfExperience, skills, industry, experience, template, binding, language } = parsed.data;
    const lang = language || 'zh';

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const skillsContext = skills && skills.length > 0
      ? `\nKey skills to incorporate: ${skills.join(', ')}`
      : '';
    const industryContext = industry
      ? `\nIndustry: ${industry}`
      : '';
    const experienceContext = experience
      ? `\n\nThe candidate provided the following work experience description. Parse this into structured work_experience items, and use it to inform the summary, skills, and projects sections:\n---\n${experience}\n---`
      : '';

    const promptText = `Generate a complete resume for a ${jobTitle} ${yearsOfExperience === 0 ? 'at entry level (fresh graduate / no prior experience)' : `with ${yearsOfExperience} years of experience`}.${skillsContext}${industryContext}${experienceContext}

Return a JSON object with these exact top-level keys: personal_info, summary, work_experience, education, skills, projects.

The structure must be:
- personal_info: { fullName, jobTitle, email, phone, location, website?, linkedin?, github? }
- summary: { text }
- work_experience: { items: [{ company, position, location?, startDate, endDate (null if current), current, description, highlights: string[] }] }
- education: { items: [{ institution, degree, field, location?, startDate, endDate, gpa?, highlights: string[] }] }
- skills: { categories: [{ name, skills: string[] }] }
- projects: { items: [{ name, url?, startDate?, endDate?, description, technologies: string[], highlights: string[] }] }

Respond with JSON only.`;

    // Higher cap than a single chat turn: a full 6-section resume can exceed 8192
    // output tokens, which truncates the JSON and makes extractJson fail (issue #87).
    const generate = (providerOptions: ReturnType<typeof getJsonProviderOptions>) =>
      generateText({
        model,
        maxOutputTokens: 16384,
        system: getSystemPrompt(lang),
        prompt: promptText,
        providerOptions,
      });

    let result;
    try {
      result = await generate(getJsonProviderOptions(aiConfig));
    } catch (err) {
      // Some OpenAI-compatible endpoints reject `response_format: json_object`.
      // The prompt already demands raw JSON and extractJson repairs the output,
      // so retry once without the JSON-mode option before giving up.
      const opts = getJsonProviderOptions(aiConfig);
      if (Object.keys(opts).length > 0) {
        result = await generate({} as ReturnType<typeof getJsonProviderOptions>);
      } else {
        throw err;
      }
    }

    const generatedData: GenerateResumeOutput = extractJson(result.text, generateResumeOutputSchema) as GenerateResumeOutput;

    // Create a new resume in the database
    const resumeTitle = lang === 'zh'
      ? `${jobTitle} - AI生成简历`
      : `${jobTitle} - AI Generated Resume`;
    const titles = SECTION_TITLES[lang] || SECTION_TITLES.zh;
    const sectionTypes = ['personal_info', 'summary', 'work_experience', 'education', 'skills', 'projects'] as const;
    const generatedSections = sectionTypes.map((type, index) => ({
      id: crypto.randomUUID(),
      type,
      title: titles[type],
      sortOrder: index,
      visible: true,
      // Guard against the model returning list fields as strings (issue #87).
      content: normalizeSectionContent(type, generatedData[type]),
    }));

    const newResume = await resumeRepository.create({
      userId: user.id,
      title: resumeTitle,
      template: template || 'classic',
      ...(binding ? { binding: toResumeTemplateBindingInput(binding) } : {}),
      language: lang,
      sections: generatedSections,
    });

    if (!newResume) {
      return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 });
    }

    return NextResponse.json({
      resumeId: newResume.id,
      title: resumeTitle,
      sections: newResume.sections || [],
    });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/generate-resume error:', error);
    // Surface the underlying reason (bad model id, endpoint rejected the request,
    // JSON parse failure, …) so the user can actually diagnose it instead of a
    // generic message (issue #87).
    const detail = error instanceof Error && error.message ? error.message : '';
    return NextResponse.json(
      { error: detail ? `Failed to generate resume: ${detail}` : 'Failed to generate resume' },
      { status: 500 }
    );
  }
}
