import { tool, generateText, type ToolSet } from 'ai';
import { z } from 'zod/v4';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { getModel, getJsonProviderOptions, type AIConfig } from '@/lib/ai/provider';
import { jdAnalysisOutputSchema } from '@/lib/ai/jd-analysis-schema';
import { extractJson } from '@/lib/ai/extract-json';
import { normalizeSectionContent } from '@/lib/resume/normalize-content';
import {
  restoreGitHostingUrls,
  sanitizeResumeForModel,
  serializeResumeForModel,
} from '@/lib/ai/model-context';

export function createExecutableTools(
  resumeId: string,
  aiConfig: AIConfig,
  options: { userId: string; beautify?: boolean },
): ToolSet {
  const findOwnedResume = async () => {
    const resume = await resumeRepository.findById(resumeId);
    return resume?.userId === options.userId ? resume : null;
  };

  const updateResumeStyle = tool({
    description: 'Update the resume theme. Only use this tool when the user explicitly enabled Beautify.',
    inputSchema: z.object({
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      fontFamily: z.literal('Noto Sans SC').optional(),
      fontSize: z.enum(['small', 'medium', 'large']).optional(),
      lineSpacing: z.number().min(1).max(2.5).optional(),
      sectionSpacing: z.number().int().min(4).max(32).optional(),
      margin: z.object({
        top: z.number().int().min(0).max(60).optional(),
        right: z.number().int().min(0).max(60).optional(),
        bottom: z.number().int().min(0).max(60).optional(),
        left: z.number().int().min(0).max(60).optional(),
      }).strict().optional(),
      avatarStyle: z.enum(['circle', 'oneInch']).optional(),
    }).strict(),
    execute: async (input) => {
      const resume = await findOwnedResume();
      if (!resume) return { success: false, error: 'Resume not found' };
      const current = (resume.themeConfig || {}) as Record<string, unknown>;
      const patch = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
      if (Object.keys(patch).length === 0) return { success: false, error: 'No style changes requested' };
      const nextTheme = {
        ...current,
        ...patch,
        ...(input.margin ? {
          margin: { ...((current.margin as Record<string, number> | undefined) || {}), ...input.margin },
        } : {}),
      };
      const updated = await resumeRepository.replaceContent(resumeId, resume.revision, { themeConfig: nextTheme });
      if (!updated) return { success: false, error: 'Resume changed during beautification; please retry' };
      return { success: true, changed: Object.keys(patch) };
    },
  });

  return {
    updateSection: tool({
      description: `Update the content of a specific resume section. Section content structures:
- personal_info: { fullName, jobTitle, email, phone, location, website, linkedin, github }
- summary: { text: string }
- work_experience: { items: [{ id, company, position, location, startDate, endDate, current, description, highlights }] }
- education: { items: [{ id, institution, degree, field, location, startDate, endDate, gpa, highlights }] }
- skills: { categories: [{ id, name, skills: string[] }] }
- projects: { items: [{ id, name, url, description, technologies, highlights }] }
- certifications: { items: [{ id, name, issuer, date, url }] }
- languages: { items: [{ id, language, proficiency }] }
- github: { items: [{ id, repoUrl, name, stars, language, description }] } — repoUrl/name/stars/language are READ-ONLY (auto-fetched from GitHub API), only modify description
- custom: { items: [{ id, title, subtitle, date, description }] }
Use field="items" or field="categories" to update list sections. Each item MUST include a unique "id" (use a UUID).`,
      inputSchema: z.object({
        sectionId: z.string().describe('The ID of the section to update'),
        field: z.string().describe('The field within the section to update (e.g., "fullName", "text", "items", "categories")'),
        value: z.string().describe('The new value for the field. For complex values (arrays, objects), pass a JSON string.'),
      }),
      execute: async ({ sectionId, field, value }) => {
        const resume = await findOwnedResume();
        if (!resume) return { success: false, error: 'Resume not found' };

        const section = resume.sections.find((s: any) => s.id === sectionId);
        if (!section) return { success: false, error: 'Section not found' };

        let parsedValue: unknown = value;
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Use as string if not valid JSON
        }

        // Fix field name for item-based sections when AI uses wrong field
        const itemSections = ['work_experience', 'education', 'projects', 'certifications', 'languages', 'github', 'custom'];
        let actualField = field;
        if (itemSections.includes(section.type) && field !== 'items') {
          // AI sent wrong field (e.g. "text") for an items-based section — convert to items
          if (typeof parsedValue === 'string') {
            // Convert plain text to a single custom item
            parsedValue = [{ id: crypto.randomUUID(), title: '', description: parsedValue }];
          } else if (!Array.isArray(parsedValue)) {
            // If it's an object with items inside, extract them
            if (Array.isArray((parsedValue as any)?.items)) {
              parsedValue = (parsedValue as any).items;
            }
          }
          actualField = section.type === 'skills' ? 'categories' : 'items';
        }
        if (section.type === 'skills' && field !== 'categories') {
          actualField = 'categories';
        }

        // Reject null/undefined values — these would corrupt the DB and cause persistent page crashes
        if (parsedValue === null || parsedValue === undefined) {
          return { success: false, error: `Invalid value: ${actualField} cannot be null or undefined` };
        }

        // List fields (items/categories) MUST end up as arrays, or the editor crashes on
        // `items.map is not a function` and the bad data is persisted (issue #69).
        if (actualField === 'items' || actualField === 'categories') {
          // Recover double-encoded JSON: the AI sometimes JSON-stringifies the value twice,
          // so a single JSON.parse above leaves us with a string that is itself JSON.
          let depth = 0;
          while (typeof parsedValue === 'string' && depth < 3) {
            try {
              parsedValue = JSON.parse(parsedValue);
            } catch {
              break;
            }
            depth++;
          }
          // Unwrap an object that wraps the list, e.g. { items: [...] } / { categories: [...] }.
          if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
            const wrapper = parsedValue as Record<string, unknown>;
            const inner = wrapper[actualField] ?? wrapper.items ?? wrapper.categories;
            if (Array.isArray(inner)) parsedValue = inner;
          }
          // Anything that is still not an array is rejected — never write it to the DB.
          if (!Array.isArray(parsedValue)) {
            return { success: false, error: `Invalid value: ${actualField} must be an array` };
          }
        }

        // Ensure items/categories always have id fields
        if (Array.isArray(parsedValue)) {
          parsedValue = (parsedValue as any[]).map((item) =>
            typeof item === 'object' && item !== null && !item.id
              ? { ...item, id: crypto.randomUUID() }
              : item
          );
        }

        const originalField = (section.content as Record<string, unknown>)?.[actualField];
        parsedValue = restoreGitHostingUrls(originalField, parsedValue);

        // GitHub sections: protect read-only fields for existing items, auto-fetch for new items
        if (section.type === 'github' && actualField === 'items' && Array.isArray(parsedValue)) {
          const existingItems = ((section.content as any)?.items || []) as any[];
          const readonlyMap = new Map(existingItems.map((it: any) => [it.id, { stars: it.stars, name: it.name, repoUrl: it.repoUrl, language: it.language }]));
          parsedValue = await Promise.all((parsedValue as any[]).map(async (item: any) => {
            // Existing item: restore read-only fields
            if (item.id && readonlyMap.has(item.id)) {
              return { ...item, ...readonlyMap.get(item.id) };
            }
            // New item with repoUrl: fetch real data from GitHub API
            if (item.repoUrl && /github\.com\/[^/]+\/[^/]+/.test(item.repoUrl)) {
              try {
                const match = item.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
                if (match) {
                  const repoName = match[2].replace(/\.git$/, '');
                  const ghRes = await fetch(`https://api.github.com/repos/${match[1]}/${repoName}`, {
                    headers: { Accept: 'application/vnd.github.v3+json' },
                  });
                  if (ghRes.ok) {
                    const gh = await ghRes.json();
                    return { ...item, name: gh.full_name, stars: gh.stargazers_count, language: gh.language || '', description: item.description || gh.description || '' };
                  }
                }
              } catch { /* fallback to AI-provided data */ }
            }
            return item;
          }));
        }

        const merged = { ...(section.content as Record<string, unknown>), [actualField]: parsedValue };
        // Coerce inner list fields (highlights/technologies/skills) to arrays so a
        // string written by the model can't crash the renderer (issue #87).
        const updatedContent = normalizeSectionContent(section.type, merged);
        const updated = await resumeRepository.updateSectionWithRevision(resumeId, resume.revision, sectionId, { content: updatedContent });
        if (!updated) return { success: false, error: 'Section not found' };

        return { success: true, sectionId, sectionType: section.type, field: actualField };
      },
    }),

    addSection: tool({
      description: 'Add a new section to the resume. Use this when the user wants to add a new section type.',
      inputSchema: z.object({
        type: z.string().describe('The type of section to add (e.g., "work_experience", "education", "skills", "projects", "certifications", "languages", "custom")'),
        title: z.string().describe('The display title for the section'),
        content: z.string().optional().describe('Initial content as a JSON string. Defaults to empty structure.'),
      }),
      execute: async ({ type, title, content }) => {
        const resume = await findOwnedResume();
        if (!resume) return { success: false, error: 'Resume not found' };

        const maxOrder = resume.sections.reduce((max: number, s: any) => Math.max(max, s.sortOrder), -1);

        let parsedContent: unknown = {};
        if (content) {
          try { parsedContent = JSON.parse(content); } catch { /* use default */ }
        } else {
          // Default content based on type
          if (type === 'skills') parsedContent = { categories: [] };
          else if (type === 'summary') parsedContent = { text: '' };
          else if (type === 'personal_info') parsedContent = { fullName: '', jobTitle: '', email: '', phone: '', location: '' };
          else parsedContent = { items: [] };
        }

        const sectionId = crypto.randomUUID();
        await resumeRepository.createSectionWithRevision(resumeId, resume.revision, {
          id: sectionId,
          type,
          title,
          sortOrder: maxOrder + 1,
          content: parsedContent,
        });

        return { success: true, sectionType: type, sectionId };
      },
    }),

    rewriteText: tool({
      description: 'Rewrite a text field to improve its impact, clarity, and professionalism. Use this when the user asks to improve or rewrite text.',
      inputSchema: z.object({
        sectionId: z.string().describe('The section containing the text'),
        field: z.string().describe('The field to rewrite (e.g., "text", "description")'),
        improvedText: z.string().describe('The improved text to replace the original'),
      }),
      execute: async ({ sectionId, field, improvedText }) => {
        const resume = await findOwnedResume();
        if (!resume) return { success: false, error: 'Resume not found' };

        const section = resume.sections.find((s: any) => s.id === sectionId);
        if (!section) return { success: false, error: 'Section not found' };

        const originalField = (section.content as Record<string, unknown>)?.[field];
        const safeImprovedText = restoreGitHostingUrls(originalField, improvedText);
        const merged = { ...(section.content as Record<string, unknown>), [field]: safeImprovedText };
        const updatedContent = normalizeSectionContent(section.type, merged);
        const updated = await resumeRepository.updateSectionWithRevision(resumeId, resume.revision, sectionId, { content: updatedContent });
        if (!updated) return { success: false, error: 'Section not found' };

        return { success: true, sectionId, sectionType: section.type, field };
      },
    }),

    suggestSkills: tool({
      description: 'Suggest relevant skills based on work experience and add them to the skills section.',
      inputSchema: z.object({
        skills: z.array(z.string()).describe('List of suggested skills'),
        category: z.string().describe('The skill category name'),
      }),
      execute: async ({ skills, category }) => {
        const resume = await findOwnedResume();
        if (!resume) return { success: false, error: 'Resume not found' };

        const skillsSection = resume.sections.find((s: any) => s.type === 'skills');
        if (!skillsSection) return { success: false, error: 'Skills section not found' };

        const content = skillsSection.content as { categories?: { id: string; name: string; skills: string[] }[] };
        const categories = content.categories || [];

        const existing = categories.find((c) => c.name === category);
        if (existing) {
          const merged = [...new Set([...existing.skills, ...skills])];
          existing.skills = merged;
        } else {
          categories.push({ id: crypto.randomUUID(), name: category, skills });
        }

        const updated = await resumeRepository.updateSectionWithRevision(resumeId, resume.revision, skillsSection.id, { content: { categories } });
        if (!updated) return { success: false, error: 'Skills section not found' };

        return { success: true, sectionId: skillsSection.id, sectionType: skillsSection.type, category };
      },
    }),

    analyzeJdMatch: tool({
      description: 'Analyze how well the current resume matches a job description. Use this when the user pastes a JD or asks about job fit.',
      inputSchema: z.object({
        jobDescription: z.string().describe('The job description text to analyze against the resume'),
      }),
      execute: async ({ jobDescription }) => {
        const resume = await findOwnedResume();
        if (!resume) return { success: false, error: 'Resume not found' };

        const model = getModel(aiConfig);
        const resumeContext = serializeResumeForModel(resume.sections);

        const result = await generateText({
          model,
          maxOutputTokens: 8192,
          system: `You are an expert resume analyst. Analyze the match between the resume and job description. Be specific and actionable.
CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences.`,
          prompt: `## Resume Data\n${resumeContext}\n\n## Job Description\n${jobDescription}\n\nReturn a JSON object with: overallScore (0-100), keywordMatches (string[]), missingKeywords (string[]), suggestions ([{section, current, suggested}]), atsScore (0-100), summary (string).`,
          providerOptions: getJsonProviderOptions(aiConfig),
        });

        const analysis = extractJson(result.text, jdAnalysisOutputSchema);
        return { success: true, analysis };
      },
    }),

    translateResume: tool({
      description: 'Translate the resume to a different language. Use this when the user asks to translate their resume to Chinese or English.',
      inputSchema: z.object({
        targetLanguage: z.enum(['zh', 'en']).describe('Target language: "zh" for Chinese, "en" for English'),
      }),
      execute: async ({ targetLanguage }) => {
        const resume = await findOwnedResume();
        if (!resume) return { success: false, error: 'Resume not found' };

        const model = getModel(aiConfig);
        const langName = targetLanguage === 'zh' ? 'Simplified Chinese' : 'English';

        const singleSectionSchema = z.object({
          sectionId: z.string(),
          title: z.string(),
          content: z.any(),
        });

        // Translate each section concurrently (max 4 at a time)
        const sections = resume.sections.map((s: any) => sanitizeResumeForModel({
          sectionId: s.id,
          type: s.type,
          title: s.title,
          content: s.content,
        }));

        const CONCURRENCY = 4;
        let succeeded = 0;
        let failed = 0;

        const translateOne = async (section: typeof sections[number]) => {
          const result = await generateText({
            model,
            maxOutputTokens: 4096,
            system: `You are a professional resume translator. Translate the given resume section into ${langName}.
Rules:
- Use professional, formal ${langName} appropriate for resumes
- Technical terms and programming languages stay in English
- Preserve the exact JSON structure and all field names — only translate string values
- Keep all IDs, URLs, emails, phone numbers unchanged
- CRITICAL: Return a single valid JSON object with keys: sectionId, title, content. No markdown, no code fences.`,
            prompt: `Translate this resume section. Return JSON with keys: sectionId, title, content.\n\n${JSON.stringify(section)}`,
            providerOptions: getJsonProviderOptions(aiConfig),
          });

          return extractJson(result.text, singleSectionSchema);
        };

        // Run with concurrency limit
        const results: ({ ok: true; data: z.infer<typeof singleSectionSchema> } | { ok: false; error: unknown })[] = new Array(sections.length);
        let nextIdx = 0;

        async function worker() {
          while (nextIdx < sections.length) {
            const i = nextIdx++;
            try {
              const data = await translateOne(sections[i]);
              results[i] = { ok: true, data };
            } catch (e) {
              results[i] = { ok: false, error: e };
            }
          }
        }

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sections.length) }, () => worker()));

        // Apply results to DB
        const typeById = new Map<string, string>(
          sections.map((s: { sectionId: string; type: string }) => [s.sectionId, s.type] as [string, string])
        );
        const translatedUpdates: { sectionId: string; title: string; content: unknown }[] = [];
        for (const r of results) {
          if (!r.ok) { failed++; continue; }
          const translated = r.data;
          const sectionType: string = typeById.get(translated.sectionId) || '';
          const originalSection = resume.sections.find((s: any) => s.id === translated.sectionId);
          const restoredContent = originalSection
            ? restoreGitHostingUrls(originalSection.content, translated.content)
            : translated.content;
          translatedUpdates.push({
            sectionId: translated.sectionId,
            title: originalSection
              ? restoreGitHostingUrls(originalSection.title, translated.title)
              : translated.title,
            // A mistranslated structure could crash the renderer — normalize it (issue #87).
            content: normalizeSectionContent(sectionType, restoredContent),
          });
          succeeded++;
        }

        const updated = await resumeRepository.updateSectionsWithRevision(
          resumeId,
          resume.revision,
          translatedUpdates,
          targetLanguage,
        );
        if (!updated) return { success: false, error: 'Resume changed during translation; please retry' };

        return {
          success: true,
          language: targetLanguage,
          translatedSections: succeeded,
          failedSections: failed,
        };
      },
    }),
    ...(options.beautify === true ? { updateResumeStyle } : {}),
  };
}
