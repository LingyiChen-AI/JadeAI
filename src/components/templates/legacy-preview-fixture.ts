import type { Resume } from '@/types/resume';

const DATE = new Date('2025-01-01T00:00:00.000Z');

export function buildLegacyPreviewResume(template: string, language: string): Resume {
  return {
    id: 'template-preview',
    userId: 'template-preview',
    title: 'Template Preview',
    template,
    language,
    themeConfig: {
      primaryColor: '#18181b', accentColor: '#2563eb', fontFamily: 'Inter', fontSize: 'medium',
      lineSpacing: 1.5, margin: { top: 20, right: 20, bottom: 20, left: 20 }, sectionSpacing: 16,
    },
    isDefault: false,
    sections: [
      {
        id: 'personal', resumeId: 'template-preview', type: 'personal_info', title: 'Personal Info',
        sortOrder: 0, visible: true, createdAt: DATE, updatedAt: DATE,
        content: {
          fullName: language.startsWith('zh') ? '陈曦' : 'Alex Chen',
          jobTitle: language.startsWith('zh') ? '高级软件工程师' : 'Senior Software Engineer',
          email: 'alex@example.com', phone: '+1 555 0100', location: 'Berlin',
        },
      },
      {
        id: 'summary', resumeId: 'template-preview', type: 'summary', title: language.startsWith('zh') ? '个人简介' : 'Summary',
        sortOrder: 1, visible: true, createdAt: DATE, updatedAt: DATE,
        content: { text: language.startsWith('zh') ? '专注于构建可靠、易用的软件产品。' : 'Building reliable, useful software products.' },
      },
      {
        id: 'work', resumeId: 'template-preview', type: 'work_experience', title: language.startsWith('zh') ? '工作经历' : 'Experience',
        sortOrder: 2, visible: true, createdAt: DATE, updatedAt: DATE,
        content: { items: [{ id: 'work-1', company: 'Jade Labs', position: 'Senior Engineer', startDate: '2022-01', endDate: null, current: true, description: 'Led product engineering across the stack.', highlights: ['Improved performance and accessibility'] }] },
      },
      {
        id: 'skills', resumeId: 'template-preview', type: 'skills', title: language.startsWith('zh') ? '技能' : 'Skills',
        sortOrder: 3, visible: true, createdAt: DATE, updatedAt: DATE,
        content: { categories: [{ id: 'skills-1', name: 'Engineering', skills: ['TypeScript', 'React', 'PostgreSQL'] }] },
      },
    ],
    createdAt: DATE,
    updatedAt: DATE,
  } as Resume;
}
