import { describe, expect, test } from 'vitest';

import { generatePlainText } from '@/app/api/resume/[id]/export/plain-text';
import { generateHtml } from '@/app/api/resume/[id]/export/builders';
import type { Resume } from '@/types/resume';
import type { ResolvedTemplate } from './resolve-template';
import type { TemplateManifestV1 } from '@/types/template';
import { buildEditorPreviewResume } from './editor-preview-resume';
import { buildTemplatePreviewResume } from './template-preview-fixture';

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
  test('keeps editor sample content out of HTML, TXT, and DOCX resume inputs', async () => {
    const real = resume('classic');
    real.sections[0].content = { text: '' };
    const fixture = buildTemplatePreviewResume('classic', 'en');
    fixture.sections.find((section) => section.type === 'summary')!.content = { text: 'JADEAI_EDITOR_SAMPLE_ONLY' };
    const derived = buildEditorPreviewResume(real, fixture);

    expect(JSON.stringify(derived.resume)).toContain('JADEAI_EDITOR_SAMPLE_ONLY');
    const html = await generateHtml(real as unknown as Parameters<typeof generateHtml>[0], false);
    const text = generatePlainText(real);
    const docxInput = JSON.stringify(real);

    for (const output of [html, text, docxInput]) {
      expect(output).not.toContain('JADEAI_EDITOR_SAMPLE_ONLY');
    }
  });

  test('keeps TXT template-independent and reports DOCX fidelity without overstating support', () => {
    expect(generatePlainText(resume('classic'))).toBe(generatePlainText(resume('neon')));
    expect(getDocxExportDecision('high-fidelity', true)).toEqual({ mode: 'high-fidelity', warning: null });
    expect(getDocxExportDecision('high-fidelity', false)).toEqual({ mode: 'unsupported', warning: 'high_fidelity_mapper_unavailable' });
    expect(getDocxExportDecision('generic', false)).toEqual({ mode: 'generic', warning: 'generic_docx_style_fallback' });
    expect(getDocxExportDecision('unsupported', false)).toEqual({ mode: 'unsupported', warning: 'template_docx_unsupported' });
  });

  test('uses effective declarative style in PDF and browser HTML without object margins', async () => {
    const manifest: TemplateManifestV1 = {
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'two-column', sidebarPosition: 'right', sidebarWidthPercent: 35, columnGapMm: 7 },
      typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 11, lineHeight: 1.4, headingScale: 1.3 },
      colors: { text: '#111111', muted: '#666666', accent: '#0f766e', background: '#ffffff' },
      spacing: { pageMarginMm: 14, sectionGapMm: 5 },
      sectionSlots: [{ sectionType: 'summary', placement: 'main', order: 0 }],
      sectionStyles: [],
      features: { showAvatar: true, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
    };
    const resolvedTemplate: ResolvedTemplate = {
      kind: 'declarative-v1', source: 'public', slug: 'test', version: '1.0.0', manifest, degraded: false,
      capabilities: {
        supportedSections: ['summary'], paperSizes: ['a4'], supportsAvatar: true, atsCompatible: true,
        supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'generic',
      },
    };
    const styledResume = {
      ...resume('classic'),
      themeConfig: {
        primaryColor: '#ABCDEF', accentColor: '#FEDCBA', fontFamily: 'Georgia', fontSize: 'small',
        lineSpacing: 1.8, sectionSpacing: 12, margin: { top: 8, right: 16, bottom: 24, left: 32 }, avatarStyle: 'circle' as const,
      },
    };

    const pdfHtml = await generateHtml(styledResume as unknown as Parameters<typeof generateHtml>[0], true, resolvedTemplate);
    const browserHtml = await generateHtml(styledResume as unknown as Parameters<typeof generateHtml>[0], false, resolvedTemplate);

    for (const output of [pdfHtml, browserHtml]) {
      expect(output).toContain('--template-heading:#ABCDEF');
      expect(output).toContain('--template-accent:#FEDCBA');
      expect(output).toContain('--template-font-size:9.9pt');
      expect(output).toContain('--template-line-height:1.8');
      expect(output).toContain('--template-section-gap:3.175mm');
      expect(output).toContain('data-avatar-style="circle"');
      expect(output).toContain('data-layout="two-column"');
      expect(output).toContain('Same content');
      expect(output).not.toContain('[object Object]mm');
    }
    expect(pdfHtml).toContain('margin: 2.117mm 4.233mm 6.35mm 8.467mm;');
    expect(pdfHtml).toContain('h2 { margin: 0 0 2mm; font-size: calc(var(--template-font-size) * 1.3); color: var(--template-heading); }');
    expect(pdfHtml).toContain('[data-avatar-style="circle"] [data-image-role="avatar"] { border-radius: 9999px; }');
    expect(browserHtml).toContain('body { padding: 2.117mm 4.233mm 6.35mm 8.467mm; font-family: "Noto Sans SC", sans-serif; }');

    const baselineHtml = await generateHtml({ ...styledResume, themeConfig: undefined } as unknown as Parameters<typeof generateHtml>[0], true, resolvedTemplate);
    expect(baselineHtml).toContain('margin: 14mm 14mm 14mm 14mm;');
    expect(baselineHtml).toContain('--template-heading:#111111');
    expect(baselineHtml).toContain('data-avatar-style="oneInch"');
    expect(baselineHtml).not.toContain('[object Object]mm');
  });
});
