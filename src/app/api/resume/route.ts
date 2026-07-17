import { NextRequest, NextResponse } from 'next/server';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { DEFAULT_SECTIONS } from '@/lib/constants';
import {
  parseClientTemplateBindingChoice,
  toResumeTemplateBindingInput,
} from '@/lib/templates/apply-template-binding.server';
import { ZodError } from 'zod/v4';

export async function GET(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resumes = await resumeRepository.findAllByUserId(user.id);
    return NextResponse.json(resumes);
  } catch (error) {
    console.error('GET /api/resume error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, template, language, sections, themeConfig } = body;
    if (sections !== undefined && !Array.isArray(sections)) {
      return NextResponse.json({ error: 'sections must be an array' }, { status: 400 });
    }
    const binding = Object.hasOwn(body, 'binding')
      ? toResumeTemplateBindingInput(parseClientTemplateBindingChoice(body.binding))
      : undefined;

    const lang = language || 'zh';
    const resumeSections = Array.isArray(sections) && sections.length > 0
      ? sections.map((section, index) => ({
          id: typeof section.id === 'string' ? section.id : crypto.randomUUID(),
          type: section.type,
          title: section.title,
          sortOrder: index,
          visible: section.visible ?? true,
          content: section.content,
        }))
      : DEFAULT_SECTIONS.map((section, index) => {
          let content: unknown = {};
          if (section.type === 'personal_info') {
            content = { fullName: '', jobTitle: '', email: '', phone: '', location: '' };
          } else if (section.type === 'summary') {
            content = { text: '' };
          } else if (section.type === 'work_experience' || section.type === 'education' || section.type === 'projects'
            || section.type === 'certifications' || section.type === 'languages' || section.type === 'github'
            || section.type === 'custom') {
            content = { items: [] };
          } else if (section.type === 'skills') {
            content = { categories: [] };
          }
          return {
            id: crypto.randomUUID(),
            type: section.type,
            title: lang === 'en' ? section.titleEn : section.titleZh,
            sortOrder: index,
            visible: true,
            content,
          };
        });

    const resume = await resumeRepository.create({
      userId: user.id,
      title: title || '未命名简历',
      template: template || 'classic',
      language: lang,
      ...(binding ? { binding } : {}),
      ...(themeConfig ? { themeConfig } : {}),
      sections: resumeSections,
    });

    if (resume) {
      return NextResponse.json(resume, { status: 201 });
    }

    return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid template binding', details: error.issues }, { status: 400 });
    }
    console.error('POST /api/resume error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
