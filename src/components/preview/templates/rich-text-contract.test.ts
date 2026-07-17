import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { loadLegacyTemplateAdapter } from '@/components/templates/legacy-template-registry';
import { TEMPLATES } from '@/lib/constants';

const sections = [
  {
    id: 'personal', type: 'personal_info', title: 'Personal', visible: true, sortOrder: 0,
    content: { fullName: 'Test User', jobTitle: 'Engineer', email: '', phone: '', location: '' },
  },
  {
    id: 'work', type: 'work_experience', title: 'Work', visible: true, sortOrder: 1,
    content: { items: [{ id: 'work-1', company: 'Company', position: 'Role', startDate: '2024', endDate: '2025', current: false, description: '', technologies: [], highlights: ['**Work Impact**'] }] },
  },
  {
    id: 'education', type: 'education', title: 'Education', visible: true, sortOrder: 2,
    content: { items: [{ id: 'education-1', institution: 'School', degree: 'Degree', field: 'Field', startDate: '2020', endDate: '2024', highlights: ['**Education Impact**'] }] },
  },
  {
    id: 'projects', type: 'projects', title: 'Projects', visible: true, sortOrder: 3,
    content: { items: [{ id: 'project-1', name: 'Project', description: '', technologies: [], highlights: ['**Project Impact**'] }] },
  },
];

describe('legacy preview rich-text contract', () => {
  it('renders bold highlights without leaking markup in every template', async () => {
    for (const template of TEMPLATES) {
      const Component = await loadLegacyTemplateAdapter(template);
      const html = renderToStaticMarkup(createElement(Component, {
        resume: { title: 'Resume', language: 'en', template, sections } as never,
      }));

      expect(html, template).toContain('<strong>Work Impact</strong>');
      expect(html, template).toContain('<strong>Education Impact</strong>');
      expect(html, template).toContain('<strong>Project Impact</strong>');
      expect(html, template).not.toContain('**Work Impact**');
      expect(html, template).not.toContain('**Education Impact**');
      expect(html, template).not.toContain('**Project Impact**');
    }
  });
});
