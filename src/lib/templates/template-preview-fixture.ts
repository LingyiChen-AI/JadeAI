import type { Resume, ResumeSection } from '@/types/resume';

const DATE = new Date('2025-01-01T00:00:00.000Z');

export function buildTemplatePreviewResume(template: string, language: string): Resume {
  const zh = language.startsWith('zh');
  const section = (
    id: string,
    type: string,
    title: string,
    sortOrder: number,
    content: ResumeSection['content'],
  ): ResumeSection => ({
    id,
    resumeId: 'template-preview',
    type,
    title,
    sortOrder,
    visible: true,
    content,
    createdAt: DATE,
    updatedAt: DATE,
  });

  return {
    id: 'template-preview',
    userId: 'template-preview',
    title: 'Template Preview',
    template,
    language,
    themeConfig: {
      primaryColor: '#18181b',
      accentColor: '#2563eb',
      fontFamily: 'Inter',
      fontSize: 'medium',
      lineSpacing: 1.5,
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      sectionSpacing: 16,
    },
    isDefault: false,
    revision: 1,
    templateVersionId: null,
    templateSource: 'legacy',
    templateSnapshot: null,
    sections: [
      section('personal', 'personal_info', zh ? '个人信息' : 'Personal Info', 0, {
        fullName: zh ? '陈曦' : 'Alex Chen',
        jobTitle: zh ? '高级软件工程师' : 'Senior Software Engineer',
        email: 'alex@example.com',
        phone: '+1 555 0100',
        location: 'Berlin',
      }),
      section('summary', 'summary', zh ? '个人简介' : 'Summary', 1, {
        text: zh ? '专注于构建可靠、易用的软件产品。' : 'Building reliable, useful software products.',
      }),
      section('work', 'work_experience', zh ? '工作经历' : 'Experience', 2, {
        items: [{
          id: 'work-1',
          company: 'Jade Labs',
          position: zh ? '高级工程师' : 'Senior Engineer',
          startDate: '2022-01',
          endDate: null,
          current: true,
          description: zh ? '负责跨栈产品工程。' : 'Led product engineering across the stack.',
          technologies: ['TypeScript', 'React', 'PostgreSQL'],
          highlights: [zh ? '提升了性能与可访问性' : 'Improved performance and accessibility'],
        }],
      }),
      section('education', 'education', zh ? '教育经历' : 'Education', 3, {
        items: [{
          id: 'education-1',
          institution: zh ? '柏林工业大学' : 'Technical University of Berlin',
          degree: zh ? '硕士' : 'Master of Science',
          field: zh ? '计算机科学' : 'Computer Science',
          startDate: '2018-09',
          endDate: '2020-06',
          highlights: [],
        }],
      }),
      section('skills', 'skills', zh ? '技能' : 'Skills', 4, {
        categories: [{ id: 'skills-1', name: zh ? '工程能力' : 'Engineering', skills: ['TypeScript', 'React', 'PostgreSQL'] }],
      }),
      section('projects', 'projects', zh ? '项目经历' : 'Projects', 5, {
        items: [{
          id: 'project-1',
          name: 'JadeAI',
          url: 'https://example.com/jadeai',
          description: zh ? '面向求职者的智能简历工具。' : 'An intelligent resume tool for job seekers.',
          technologies: ['Next.js', 'TypeScript'],
          highlights: [zh ? '交付了可靠的模板预览体验' : 'Delivered a reliable template preview experience'],
        }],
      }),
      section('certifications', 'certifications', zh ? '证书' : 'Certifications', 6, {
        items: [{ id: 'certification-1', name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2024-03' }],
      }),
      section('languages', 'languages', zh ? '语言能力' : 'Languages', 7, {
        items: [{ id: 'language-1', language: zh ? '英语' : 'English', proficiency: zh ? '流利' : 'Fluent' }],
      }),
    ],
    createdAt: DATE,
    updatedAt: DATE,
  };
}
