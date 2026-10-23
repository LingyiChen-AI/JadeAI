import type { ResumeWithSections } from '@/app/api/resume/[id]/export/utils';

export function pdfResumeFixture(template = 'classic', lines = 3): ResumeWithSections {
  const section = (type: string, title: string, content: unknown, sortOrder: number) => ({
    id: `${type}-fixture`, resumeId: 'pdf-fixture', type, title, content, sortOrder, visible: true,
    createdAt: new Date(0), updatedAt: new Date(0),
  });
  const avatar = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#eab308"/><circle cx="50" cy="40" r="20" fill="#0f766e"/><path d="M15 130V95Q50 65 85 95V130Z" fill="#0f766e"/></svg>`;
  return {
    id: 'pdf-fixture', userId: 'pdf-fixture-user', title: `PDF fixture ${template}`,
    template, language: 'zh', themeConfig: null, isPublic: false, isDefault: false,
    shareToken: null, sharePassword: null, viewCount: 0,
    createdAt: new Date(0), updatedAt: new Date(0),
    sections: [
      section('personal_info', 'Personal info', {
        fullName: 'PDF Test 陈同学', jobTitle: 'Software Engineer', email: 'pdf@example.com',
        phone: '123456789', location: 'Shanghai',
        avatar: `data:image/svg+xml;base64,${Buffer.from(avatar).toString('base64')}`,
      }, 0),
      section('skills', 'Skills', { categories: [{ id: 'skill', name: 'Languages', skills: ['TypeScript', '中文'] }] }, 1),
      section('summary', 'Summary', {
        text: Array.from({ length: lines }, (_, i) => `Line${String(i).padStart(3, '0')}: Reliable systems and clear documentation.`).join('\n') + '\nLAST_LINE_SENTINEL 最后一行',
      }, 2),
      section('qr_codes', 'Links', { items: [{ id: 'qr', label: 'BOTTOM_QR_SENTINEL', url: 'https://example.com' }] }, 3),
    ],
  };
}
