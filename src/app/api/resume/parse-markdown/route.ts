import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import type { ParsedResume } from '@/lib/ai/parse-schema';

const SYSTEM_PROMPT = `You are a resume parser. Extract ALL information from the Markdown resume into the EXACT JSON schema below.

REQUIRED JSON SCHEMA:
{"personalInfo":{"fullName":"","jobTitle":"","age":"","gender":"","politicalStatus":"","ethnicity":"","hometown":"","maritalStatus":"","yearsOfExperience":"","educationLevel":"","email":"","phone":"","wechat":"","location":"","website":"","linkedin":"","github":""},"summary":"","workExperience":[{"company":"Company A","position":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM or null","current":false,"description":"","highlights":["bullet 1","bullet 2"]},{"company":"Company B","position":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","current":false,"description":"","highlights":[]}],"education":[{"institution":"University A","degree":"","field":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","gpa":"","highlights":[]},{"institution":"University B","degree":"","field":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","gpa":"","highlights":[]}],"skills":[{"name":"category name","skills":["skill1","skill2"]}],"projects":[{"name":"Project A","description":"","technologies":[],"highlights":[]},{"name":"Project B","description":"","technologies":[],"highlights":[]}],"certifications":[{"name":"","issuer":"","date":""}],"languages":[{"language":"","proficiency":""}]}

RULES:
- You MUST use the EXACT field names shown above (fullName, jobTitle, workExperience, etc.)
- Output compact single-line JSON. No indentation, no newlines.
- You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.
- Use YYYY-MM for dates. Empty string "" for missing fields.
- For current jobs: current=true, endDate=null.
- Omit empty arrays (e.g. if no projects, omit "projects" entirely).
- Extract ALL items for EVERY section — every work experience, every project, every education entry, every certification, every language. If the resume has 3 projects, return 3 objects in the projects array. If the resume has 5 work experiences, return 5 objects in the workExperience array.
- Parse Markdown formatting carefully. List items (- or *) under work experience should become highlights. Bold text (**text**) indicates emphasis.
- Section headers in Markdown (## or ###) indicate different resume sections.`;

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, template, language } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Markdown content is required' }, { status: 400 });
    }

    if (content.trim().length < 50) {
      return NextResponse.json({ error: 'Content is too short to be a valid resume' }, { status: 400 });
    }

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    // Use AI to parse Markdown content
    const result = await generateText({
      model,
      maxOutputTokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Below is a resume written in Markdown format. Extract all resume information using the EXACT JSON schema from the system prompt.\n\n---\n${content}\n---`,
        },
      ],
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    console.log('[parse-markdown] finishReason=%s, length=%d', result.finishReason, result.text.length);

    // Parse JSON from response
    const raw = parseJsonFromText(result.text);
    if (!raw || typeof raw !== 'object') {
      console.error('[parse-markdown] Failed to parse JSON. Raw text:', result.text.slice(0, 500));
      return NextResponse.json({ error: 'Failed to extract resume data from Markdown' }, { status: 500 });
    }

    // Map to our schema
    const resumeData = mapToResumeSchema(raw as Record<string, unknown>);

    // Create resume with parsed data
    const resume = await resumeRepository.create({
      userId: user.id,
      title: resumeData.personalInfo?.fullName || '未命名简历',
      template: template || 'classic',
      language: language || 'zh',
    });

    if (!resume) {
      return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 });
    }

    // Create sections from parsed data
    const sections = buildSections(resumeData, language || 'zh');
    for (let i = 0; i < sections.length; i++) {
      await resumeRepository.createSection({
        resumeId: resume.id,
        type: sections[i].type,
        title: sections[i].title,
        sortOrder: i,
        content: sections[i].content,
      });
    }

    const fullResume = await resumeRepository.findById(resume.id);
    return NextResponse.json(fullResume, { status: 201 });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/resume/parse-markdown error:', error);
    return NextResponse.json({ error: 'Failed to parse Markdown resume' }, { status: 500 });
  }
}

// ─── JSON Parsing ────────────────────────────────────────────────────────────

function parseJsonFromText(text: string): unknown | null {
  let cleaned = text.trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '');
  cleaned = cleaned.trim();

  // Try candidates in order
  const candidates: string[] = [cleaned];

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch (e) {
      // Log first attempt error for diagnostics
      if (c === candidates[0]) {
        console.warn('[parse-markdown] JSON.parse error:', (e as Error).message?.slice(0, 100));
      }
      // Try repair for truncated JSON
      const repaired = repairTruncatedJson(c);
      if (repaired) {
        try {
          return JSON.parse(repaired);
        } catch {
          /* continue */
        }
      }
    }
  }

  return null;
}

function repairTruncatedJson(text: string): string | null {
  let s = text.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return null;

  s = s.replace(/,\s*$/, '');

  // Remove trailing incomplete key-value pair
  s = s.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '');
  if (s.match(/:\s*"[^"]*$/)) s += '"';
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*$/, '');
  s = s.replace(/,\s*$/, '');

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack.length > 0) stack.pop();
  }

  if (inString) s += '"';
  while (stack.length > 0) s += stack.pop()!;

  return s;
}

// ─── Flexible Schema Mapping ─────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function mapArray<T>(raw: unknown, mapper: (item: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => mapper(item as Record<string, unknown>));
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

function mapSkills(raw: unknown): { name: string; skills: string[] }[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];

    if (typeof raw[0] === 'object' && raw[0] !== null) {
      return raw
        .map((s: Record<string, unknown>) => ({
          name: str(s.name || s.category || s.type || s.group || 'Skills'),
          skills: toStringArray(s.skills || s.items || s.list || s.keywords || []),
        }))
        .filter((s) => s.skills.length > 0);
    }

    if (typeof raw[0] === 'string') {
      return [{ name: 'Skills', skills: raw.map(String) }];
    }
  }

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => ({ name: k, skills: (v as unknown[]).map(String) }));
  }

  return [];
}

/**
 * Map any model-returned JSON to our ParsedResume schema.
 */
function mapToResumeSchema(raw: Record<string, unknown>): ParsedResume {
  const pi = (raw.personalInfo || raw.personal_info || raw.basicInfo || raw.basic_info || {}) as Record<string, unknown>;
  const ji = (raw.jobIntention || raw.job_intention || {}) as Record<string, unknown>;

  const personalInfo = {
    fullName: str(pi.fullName || pi.name || pi.姓名 || ''),
    jobTitle: str(pi.jobTitle || pi.title || pi.position || ji.position || ji.jobTitle || pi.职位 || ''),
    age: str(pi.age || pi.年龄 || ''),
    gender: str(pi.gender || pi.sex || pi.性别 || ''),
    politicalStatus: str(pi.politicalStatus || pi.political_status || pi.政治面貌 || ''),
    ethnicity: str(pi.ethnicity || pi.nationality || pi.民族 || ''),
    hometown: str(pi.hometown || pi.nativePlace || pi.native_place || pi.籍贯 || ''),
    maritalStatus: str(pi.maritalStatus || pi.marital_status || pi.婚姻状况 || pi.婚姻 || ''),
    yearsOfExperience: str(pi.yearsOfExperience || pi.years_of_experience || pi.experience || pi.工作年限 || pi.工作经验 || ''),
    educationLevel: str(pi.educationLevel || pi.education_level || pi.education || pi.最高学历 || pi.学历 || ''),
    email: str(pi.email || pi.邮箱 || ''),
    phone: str(pi.phone || pi.tel || pi.mobile || pi.电话 || pi.手机 || ''),
    wechat: str(pi.wechat || pi.weixin || pi.微信 || ''),
    location: str(pi.location || pi.city || pi.address || ji.city || pi.地址 || pi.城市 || ''),
    website: str(pi.website || pi.url || pi.homepage || ''),
    linkedin: str(pi.linkedin || ''),
    github: str(pi.github || ''),
  };

  const summary = str(raw.summary || raw.objective || raw.selfIntroduction || raw.selfEvaluation || raw.profile || raw.about || '');

  const workExperience = mapArray(
    raw.workExperience || raw.work_experience || raw.experience || raw.work || [],
    (w: Record<string, unknown>) => ({
      company: str(w.company || w.companyName || w.employer || ''),
      position: str(w.position || w.title || w.jobTitle || w.role || ''),
      location: str(w.location || w.city || ''),
      startDate: str(w.startDate || w.start_date || w.startTime || ''),
      endDate:
        w.endDate === null || w.end_date === null || str(w.endDate || w.end_date || w.endTime || '') === '至今'
          ? null
          : str(w.endDate || w.end_date || w.endTime || ''),
      current: Boolean(w.current || w.isCurrent || str(w.endDate || w.end_date || '') === '至今'),
      description: str(w.description || w.desc || w.content || ''),
      highlights: toStringArray(w.highlights || w.achievements || w.bullets || w.duties || []),
    })
  );

  const education = mapArray(
    raw.education || raw.edu || [],
    (e: Record<string, unknown>) => ({
      institution: str(e.institution || e.school || e.university || e.college || e.schoolName || ''),
      degree: str(e.degree || e.学历 || ''),
      field: str(e.field || e.major || e.专业 || ''),
      location: str(e.location || ''),
      startDate: str(e.startDate || e.start_date || e.startTime || ''),
      endDate: str(e.endDate || e.end_date || e.endTime || ''),
      gpa: str(e.gpa || e.GPA || ''),
      highlights: toStringArray(e.highlights || e.achievements || e.courses || []),
    })
  );

  const skills = mapSkills(raw.skills || raw.skill || []);

  const projects = mapArray(
    raw.projects || raw.project || [],
    (p: Record<string, unknown>) => ({
      name: str(p.name || p.projectName || p.title || ''),
      url: str(p.url || p.link || ''),
      startDate: str(p.startDate || p.start_date || ''),
      endDate: str(p.endDate || p.end_date || ''),
      description: str(p.description || p.desc || p.content || ''),
      technologies: toStringArray(p.technologies || p.tech || p.techStack || p.skills || []),
      highlights: toStringArray(p.highlights || p.achievements || []),
    })
  );

  const certifications = mapArray(
    raw.certifications || raw.certificates || raw.certs || [],
    (c: Record<string, unknown>) => ({
      name: str(c.name || c.title || ''),
      issuer: str(c.issuer || c.organization || c.org || ''),
      date: str(c.date || c.issueDate || ''),
      url: str(c.url || ''),
    })
  );

  const languages = mapArray(
    raw.languages || raw.language || [],
    (l: Record<string, unknown>) => ({
      language: str(l.language || l.name || ''),
      proficiency: str(l.proficiency || l.level || ''),
    })
  );

  return {
    personalInfo,
    ...(summary ? { summary } : {}),
    ...(workExperience.length ? { workExperience } : {}),
    ...(education.length ? { education } : {}),
    ...(skills.length ? { skills } : {}),
    ...(projects.length ? { projects } : {}),
    ...(certifications.length ? { certifications } : {}),
    ...(languages.length ? { languages } : {}),
  };
}

// ─── Build Sections ──────────────────────────────────────────────────────────

function buildSections(parsed: ParsedResume, language: string) {
  const isEn = language === 'en';
  const sections: { type: string; title: string; content: unknown }[] = [];

  sections.push({
    type: 'personal_info',
    title: isEn ? 'Personal Info' : '个人信息',
    content: {
      fullName: parsed.personalInfo?.fullName || '',
      jobTitle: parsed.personalInfo?.jobTitle || '',
      age: parsed.personalInfo?.age || '',
      gender: parsed.personalInfo?.gender || '',
      politicalStatus: parsed.personalInfo?.politicalStatus || '',
      ethnicity: parsed.personalInfo?.ethnicity || '',
      hometown: parsed.personalInfo?.hometown || '',
      maritalStatus: parsed.personalInfo?.maritalStatus || '',
      yearsOfExperience: parsed.personalInfo?.yearsOfExperience || '',
      educationLevel: parsed.personalInfo?.educationLevel || '',
      email: parsed.personalInfo?.email || '',
      phone: parsed.personalInfo?.phone || '',
      wechat: parsed.personalInfo?.wechat || '',
      location: parsed.personalInfo?.location || '',
      website: parsed.personalInfo?.website || '',
      linkedin: parsed.personalInfo?.linkedin || '',
      github: parsed.personalInfo?.github || '',
    },
  });

  if (parsed.summary) {
    sections.push({
      type: 'summary',
      title: isEn ? 'Summary' : '个人简介',
      content: { text: parsed.summary },
    });
  }

  if (parsed.workExperience?.length) {
    sections.push({
      type: 'work_experience',
      title: isEn ? 'Work Experience' : '工作经历',
      content: {
        items: parsed.workExperience.map((w) => ({
          id: crypto.randomUUID(),
          company: w.company,
          position: w.position,
          location: w.location || '',
          startDate: w.startDate,
          endDate: w.endDate,
          current: w.current,
          description: w.description,
          technologies: [],
          highlights: w.highlights,
        })),
      },
    });
  }

  if (parsed.education?.length) {
    sections.push({
      type: 'education',
      title: isEn ? 'Education' : '教育背景',
      content: {
        items: parsed.education.map((e) => ({
          id: crypto.randomUUID(),
          institution: e.institution,
          degree: e.degree,
          field: e.field,
          location: e.location || '',
          startDate: e.startDate,
          endDate: e.endDate,
          gpa: e.gpa || '',
          highlights: e.highlights,
        })),
      },
    });
  }

  if (parsed.skills?.length) {
    sections.push({
      type: 'skills',
      title: isEn ? 'Skills' : '技能特长',
      content: {
        categories: parsed.skills.map((s) => ({
          id: crypto.randomUUID(),
          name: s.name,
          skills: s.skills,
        })),
      },
    });
  }

  if (parsed.projects?.length) {
    sections.push({
      type: 'projects',
      title: isEn ? 'Projects' : '项目经历',
      content: {
        items: parsed.projects.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          url: p.url || '',
          startDate: p.startDate || '',
          endDate: p.endDate || '',
          description: p.description,
          technologies: p.technologies,
          highlights: p.highlights,
        })),
      },
    });
  }

  if (parsed.certifications?.length) {
    sections.push({
      type: 'certifications',
      title: isEn ? 'Certifications' : '资格证书',
      content: {
        items: parsed.certifications.map((c) => ({
          id: crypto.randomUUID(),
          name: c.name,
          issuer: c.issuer,
          date: c.date,
          url: c.url || '',
        })),
      },
    });
  }

  if (parsed.languages?.length) {
    sections.push({
      type: 'languages',
      title: isEn ? 'Languages' : '语言能力',
      content: {
        items: parsed.languages.map((l) => ({
          id: crypto.randomUUID(),
          language: l.language,
          proficiency: l.proficiency,
        })),
      },
    });
  }

  return sections;
}
