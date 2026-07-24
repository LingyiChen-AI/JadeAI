import { describe, expect, test } from 'vitest';

import type { Resume, ResumeSection } from '@/types/resume';

import { buildEditorPreviewResume } from './editor-preview-resume';
import { buildTemplatePreviewResume } from './template-preview-fixture';

const NOW = new Date('2025-01-01T00:00:00.000Z');

function section(type: string, content: ResumeSection['content'], visible = true): ResumeSection {
  return {
    id: type,
    resumeId: 'resume-1',
    type,
    title: type,
    sortOrder: 0,
    visible,
    content,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function realResume(sections: ResumeSection[]): Resume {
  return {
    id: 'resume-1',
    userId: 'user-1',
    title: 'Real resume',
    template: 'classic',
    themeConfig: {
      primaryColor: '#111111',
      accentColor: '#2563eb',
      fontFamily: 'Inter',
      fontSize: 'medium',
      lineSpacing: 1.5,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      sectionSpacing: 16,
    },
    isDefault: false,
    language: 'zh',
    revision: 1,
    templateVersionId: null,
    templateSource: 'legacy',
    templateSnapshot: null,
    sections,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('buildEditorPreviewResume', () => {
  test('fills only blank scalar fields without mutating the real resume', () => {
    const real = realResume([
      section('personal_info', {
        fullName: '  ',
        jobTitle: undefined,
        email: null,
        phone: 'real-phone',
        location: '',
        yearsOfExperience: 0,
        maritalStatus: false,
      } as unknown as ResumeSection['content']),
      section('summary', { text: '\n\t' }),
    ]);
    const beforeJson = JSON.stringify(real);

    const result = buildEditorPreviewResume(real, buildTemplatePreviewResume('classic', 'zh'));
    const personal = result.resume.sections.find((item) => item.type === 'personal_info')!;

    expect(result.resume).not.toBe(real);
    expect(personal.content).toMatchObject({
      fullName: '陈曦',
      jobTitle: '高级软件工程师',
      email: 'alex@example.com',
      phone: 'real-phone',
      yearsOfExperience: 0,
      maritalStatus: false,
    });
    expect(result.placeholderPaths).toEqual(expect.objectContaining({ size: 5 }));
    expect([...result.placeholderPaths]).toEqual(expect.arrayContaining([
      'personal_info.fullName',
      'personal_info.jobTitle',
      'personal_info.email',
      'personal_info.location',
      'summary.text',
    ]));
    expect(JSON.stringify(real)).toBe(beforeJson);
  });

  test('uses whole fixture lists only for empty items or categories', () => {
    const fixture = buildTemplatePreviewResume('classic', 'en');
    const realWorkItems = [{
      id: 'real-work', company: '', position: '', startDate: '', endDate: null, current: false,
      description: '', technologies: [], highlights: [],
    }];
    const real = realResume([
      section('work_experience', { items: realWorkItems }),
      section('education', { items: [] }),
      section('skills', { categories: [] }),
    ]);

    const result = buildEditorPreviewResume(real, fixture);

    expect(result.resume.sections[0].content).toEqual({ items: realWorkItems });
    expect(result.resume.sections[0].content).not.toBe(real.sections[0].content);
    expect([...result.placeholderPaths].some((path) => path.startsWith('work_experience.items'))).toBe(false);
    expect((result.resume.sections[1].content as { items: unknown[] }).items).not.toHaveLength(0);
    expect((result.resume.sections[2].content as { categories: unknown[] }).categories).not.toHaveLength(0);
    expect(result.placeholderPaths).toEqual(expect.objectContaining({
      size: 2,
    }));
    expect([...result.placeholderPaths]).toEqual(expect.arrayContaining(['education.items', 'skills.categories']));
  });

  test('does not add deleted sections, reveal hidden sections, or invent custom data', () => {
    const custom = section('custom', { items: [] });
    const hidden = section('skills', { categories: [] }, false);
    const real = realResume([section('personal_info', { fullName: '' } as ResumeSection['content']), hidden, custom]);

    const result = buildEditorPreviewResume(real, buildTemplatePreviewResume('classic', 'zh'));

    expect(result.resume.sections.some((item) => item.type === 'education')).toBe(false);
    expect(result.resume.sections.find((item) => item.type === 'skills')).toEqual(hidden);
    expect(result.resume.sections.find((item) => item.type === 'custom')).toEqual(custom);
    expect([...result.placeholderPaths].some((path) => path.startsWith('skills'))).toBe(false);
    expect([...result.placeholderPaths].some((path) => path.startsWith('custom'))).toBe(false);
  });
});
