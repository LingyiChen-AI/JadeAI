import { generateText } from 'ai';
import type { ModelMessage } from 'ai';
import { getModel, getJsonProviderOptions, type AIConfig } from '@/lib/ai/provider';
import type { ParsedResume } from '@/lib/ai/parse-schema';

export const ACCEPTED_RESUME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SYSTEM_PROMPT = `You are a resume parser. Extract ALL information from the resume into the EXACT JSON schema below.

REQUIRED JSON SCHEMA:
{"personalInfo":{"fullName":"","jobTitle":"","age":"","gender":"","politicalStatus":"","ethnicity":"","hometown":"","maritalStatus":"","yearsOfExperience":"","educationLevel":"","email":"","phone":"","wechat":"","location":"","website":"","linkedin":"","github":""},"summary":"","workExperience":[{"company":"Company A","position":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM or null","current":false,"description":"","highlights":["bullet 1","bullet 2"]},{"company":"Company B","position":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","current":false,"description":"","highlights":[]}],"education":[{"institution":"University A","degree":"","field":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","gpa":"","highlights":[]},{"institution":"University B","degree":"","field":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM","gpa":"","highlights":[]}],"skills":[{"name":"category name","skills":["skill1","skill2"]}],"projects":[{"name":"Project A","description":"","technologies":[],"highlights":[]},{"name":"Project B","description":"","technologies":[],"highlights":[]}],"certifications":[{"name":"","issuer":"","date":""}],"languages":[{"language":"","proficiency":""}]}

RULES:
- You MUST use the EXACT field names shown above (fullName, jobTitle, workExperience, etc.)
- Output compact single-line JSON. No indentation, no newlines.
- You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.
- Use YYYY-MM for dates. Empty string "" for missing fields.
- For current jobs: current=true, endDate=null.
- Omit empty arrays (e.g. if no projects, omit "projects" entirely).
- Extract ALL items for EVERY section — every work experience, every project, every education entry, every certification, every language. Do NOT merge or omit any entries. If the resume has 3 projects, return 3 objects in the projects array. If the resume has 5 work experiences, return 5 objects in the workExperience array.
- Read ALL pages of the document thoroughly. Information may span multiple pages.`;

/** 解析失败（模型没能返回可用的 JSON）。调用方据此区分「解析不出来」和其它错误。 */
export class ResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeParseError';
  }
}

/** 文件类型/大小校验。通过返回 null，不通过返回错误信息。 */
export function validateResumeFile(file: File): string | null {
  if (!ACCEPTED_RESUME_TYPES.includes(file.type)) {
    return 'Unsupported file type. Accepted: PDF, PNG, JPG, WebP';
  }
  if (file.size > MAX_RESUME_FILE_SIZE) {
    return 'File too large. Maximum size: 10MB';
  }
  return null;
}

/**
 * 把简历文件解析成结构化数据。不落库——调用方决定存到哪。
 *
 * 从 /api/resume/parse 抽出来，好让招聘侧复用同一套多模态解析，
 * 而不必为候选人的简历在 resumes 表里造一条记录。
 */
export async function parseResumeFile(file: File, aiConfig: AIConfig): Promise<ParsedResume> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const model = getModel(aiConfig);

  // Build messages based on file type
  const messages: ModelMessage[] = [];
  const isPdf = file.type === 'application/pdf';

  if (isPdf) {
    // Try to extract text from PDF first
    const pdfText = await extractPdfText(buffer);

    if (pdfText.length > 200) {
      // Text-based PDF — send extracted text directly (handles multi-page perfectly)
      console.log('[parse] PDF text extraction: %d chars', pdfText.length);
      messages.push({
        role: 'user',
        content: `Below is the full text extracted from a resume PDF. Extract all resume information using the EXACT JSON schema from the system prompt.\n\n---\n${pdfText}\n---`,
      });
    } else {
      // Scanned/image-based PDF — convert each page to an image
      console.log('[parse] PDF has little text (%d chars), converting pages to images', pdfText.length);
      const pageImages = await pdfPagesToImages(buffer);
      console.log('[parse] Converted %d PDF pages to images', pageImages.length);
      const contentParts: Array<{ type: 'image'; image: string } | { type: 'text'; text: string }> = [];
      for (const png of pageImages) {
        contentParts.push({ type: 'image', image: `data:image/png;base64,${Buffer.from(png).toString('base64')}` });
      }
      contentParts.push({ type: 'text', text: 'Extract all resume information from these resume page images. Use the EXACT JSON schema from the system prompt.' });
      messages.push({ role: 'user', content: contentParts });
    }
  } else {
    // Image file — send as image directly
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;
    messages.push({
      role: 'user',
      content: [
        { type: 'image', image: dataUrl },
        { type: 'text', text: 'Extract all resume information from this image. Use the EXACT JSON schema from the system prompt.' },
      ],
    });
  }

  // Single call — generateText with explicit schema in prompt
  const result = await generateText({
    model,
    maxOutputTokens: 16384,
    system: SYSTEM_PROMPT,
    messages,
    providerOptions: getJsonProviderOptions(aiConfig),
  });

  console.log('[parse] finishReason=%s, length=%d', result.finishReason, result.text.length);

  // Parse JSON from response
  const raw = parseJsonFromText(result.text);
  if (!raw || typeof raw !== 'object') {
    console.error('[parse] Failed to parse JSON. Raw text:', result.text.slice(0, 500));
    throw new ResumeParseError('Failed to extract resume data');
  }

  // Map to our schema (handles models that return different field names)
  return mapToResumeSchema(raw as Record<string, unknown>);
}

// ─── PDF Helpers ─────────────────────────────────────────────────────────────

async function loadMupdfDoc(buffer: Uint8Array) {
  const mupdf = await import('mupdf');
  return { mupdf, doc: mupdf.Document.openDocument(buffer, 'application/pdf') };
}

function extractPdfText(buffer: Buffer): Promise<string> {
  return loadMupdfDoc(new Uint8Array(buffer)).then(({ doc }) => {
    const pageCount = doc.countPages();
    const parts: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      parts.push(page.toStructuredText('preserve-whitespace').asText());
    }
    return parts.join('\n').trim();
  }).catch((e) => {
    console.warn('[parse] mupdf text extraction failed:', (e as Error).message);
    return '';
  });
}

async function pdfPagesToImages(buffer: Uint8Array): Promise<Uint8Array[]> {
  const { mupdf, doc } = await loadMupdfDoc(buffer);
  const pageCount = doc.countPages();
  const images: Uint8Array[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    // Render at 2x scale for better OCR quality
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(2, 2),
      mupdf.ColorSpace.DeviceRGB,
      false, // no alpha
      true,  // annots
    );
    images.push(pixmap.asPNG());
  }

  return images;
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
        console.warn('[parse] JSON.parse error:', (e as Error).message?.slice(0, 100));
      }
      // Try repair for truncated JSON
      const repaired = repairTruncatedJson(c);
      if (repaired) {
        try { return JSON.parse(repaired); } catch { /* continue */ }
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
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack.length > 0) stack.pop();
  }

  if (inString) s += '"';
  while (stack.length > 0) s += stack.pop();

  return s;
}

// ─── Flexible Schema Mapping ─────────────────────────────────────────────────

/**
 * Map any model-returned JSON to our ParsedResume schema.
 * Handles different field names (name→fullName, position→jobTitle, etc.)
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
      endDate: w.endDate === null || w.end_date === null || str(w.endDate || w.end_date || w.endTime || '') === '至今'
        ? null : str(w.endDate || w.end_date || w.endTime || ''),
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

/**
 * Map skills which can come in different formats:
 * - [{name: "cat", skills: ["a","b"]}] — our expected format
 * - [{category: "cat", items: ["a","b"]}] — alt format
 * - ["skill1", "skill2"] — flat list
 * - {"cat1": ["a","b"], "cat2": ["c"]} — object format
 */
function mapSkills(raw: unknown): { name: string; skills: string[] }[] {
  if (!raw) return [];

  // Our format: array of {name, skills}
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];

    // Array of objects with skills
    if (typeof raw[0] === 'object' && raw[0] !== null) {
      return raw.map((s: Record<string, unknown>) => ({
        name: str(s.name || s.category || s.type || s.group || 'Skills'),
        skills: toStringArray(s.skills || s.items || s.list || s.keywords || []),
      })).filter((s) => s.skills.length > 0);
    }

    // Flat array of strings → single category
    if (typeof raw[0] === 'string') {
      return [{ name: 'Skills', skills: raw.map(String) }];
    }
  }

  // Object format: { category: [skills] }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => ({ name: k, skills: (v as unknown[]).map(String) }));
  }

  return [];
}
