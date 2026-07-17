import { describe, expect, test } from 'vitest';

import { generatePlainText } from '@/app/api/resume/[id]/export/plain-text';
import type { Resume } from '@/types/resume';

import { getDocxExportDecision } from './export-contract';

function resume(template: string): Resume {
  const now = new Date(0);
  return {
    id: 'r1', userId: 'u1', title: 'Resume', template,
    themeConfig: { primaryColor: '#111111', accentColor: '#2563eb', fontFamily: 'Inter', fontSize: 'medium', lineSpacing: 1.5, margin: { top: 20, right: 20, bottom: 20, left: 20 }, sectionSpacing: 16 },
    isDefault: false, language: 'en', revision: 1, templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    sections: [{ id: 's1', resumeId: 'r1', type: 'summary', title: 'Summary', sortOrder: 0, visible: true, content: { text: 'Same content' }, createdAt: now, updatedAt: now }],
    createdAt: now, updatedAt: now,
  };
}

describe('export contracts', () => {
  test('keeps TXT template-independent and reports DOCX fidelity without overstating support', () => {
    expect(generatePlainText(resume('classic'))).toBe(generatePlainText(resume('neon')));
    expect(getDocxExportDecision('high-fidelity', true)).toEqual({ mode: 'high-fidelity', warning: null });
    expect(getDocxExportDecision('high-fidelity', false)).toEqual({ mode: 'unsupported', warning: 'high_fidelity_mapper_unavailable' });
    expect(getDocxExportDecision('generic', false)).toEqual({ mode: 'generic', warning: 'generic_docx_style_fallback' });
    expect(getDocxExportDecision('unsupported', false)).toEqual({ mode: 'unsupported', warning: 'template_docx_unsupported' });
  });
});
