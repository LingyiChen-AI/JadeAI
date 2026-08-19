import { NextRequest, NextResponse } from 'next/server';
import { extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { parseResumeFile, validateResumeFile } from '@/lib/ai/parse-resume';
import type { ParsedResume } from '@/lib/ai/parse-schema';

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const template = (formData.get('template') as string) || 'classic';
    const language = (formData.get('language') as string) || 'zh';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const invalid = validateResumeFile(file);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const aiConfig = extractAIConfig(request);
    const resumeData = await parseResumeFile(file, aiConfig);

    // Create resume with parsed data
    const resume = await resumeRepository.create({
      userId: user.id,
      title: resumeData.personalInfo?.fullName || '未命名简历',
      template,
      language,
    });

    if (!resume) {
      return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 });
    }

    // Create sections from parsed data
    const sections = buildSections(resumeData, language);
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
    console.error('POST /api/resume/parse error:', error);
    return NextResponse.json({ error: 'Failed to parse resume' }, { status: 500 });
  }
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
