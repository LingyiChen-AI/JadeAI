import { describe, expect, test } from 'vitest';

import { generateHtml } from './builders';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';
import type { TemplateManifestV1 } from '@/types/template';
import { TEMPLATES } from '@/lib/constants';

function resolution(showPageNumbers: boolean): ResolvedTemplate {
  const manifest: TemplateManifestV1 = {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [], sectionStyles: [],
    features: { showAvatar: false, showQrCodes: true, showPageNumbers, maxPages: 4 },
  };
  return {
    kind: 'declarative-v1', source: 'public', slug: 'test', version: '1.0.0', manifest,
    capabilities: { supportedSections: [], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: false, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'generic' },
    degraded: false,
  };
}

const resume = { title: 'Resume', language: 'en', template: 'classic', sections: [] };

describe('declarative export HTML', () => {
  test('uses the print page counter only when the manifest enables page numbers', async () => {
    const numbered = await generateHtml(resume as never, true, resolution(true));
    const plain = await generateHtml(resume as never, true, resolution(false));

    expect(numbered).toContain('@bottom-center');
    expect(numbered).toContain('counter(page)');
    expect(plain).not.toContain('@bottom-center');
    expect(plain).not.toContain('counter(page)');
  });

  test('emits executable CSS for every schema style element and non-default variant', async () => {
    const html = await generateHtml(resume as never, true, resolution(true));
    for (const element of ['body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr']) {
      for (const variant of ['compact', 'accent', 'muted', 'bordered']) {
        expect(html).toContain(`[data-style-${element}="${variant}"]`);
      }
    }
  });

  test('embeds locally generated QR SVG data instead of an external image request', async () => {
    const html = await generateHtml({
      ...resume,
      sections: [{
        type: 'qr_codes', title: 'QR', sortOrder: 0, visible: true,
        content: { items: [{ id: 'qr-1', label: 'Portfolio', url: 'https://example.com/work' }] },
      }],
    } as never, true, resolution(true));

    expect(html).toContain('data-block="qr"');
    expect(html).toContain('data-image-role="qr"');
    expect(html).toContain('src="data:image/svg+xml;base64,');
    expect(html).not.toContain('src="https://example.com/work"');
    expect(html).toContain('[data-image-role="avatar"] { max-width: 32mm;');
  });
});

describe('legacy rich-text export contract', () => {
  test('renders supported formatting in custom descriptions for every template', async () => {
    for (const template of TEMPLATES) {
      const html = await generateHtml({
        ...resume,
        template,
        sections: [
          {
            type: 'custom', title: 'Custom', sortOrder: 0, visible: true,
            content: { items: [{ id: 'custom-1', title: 'Item', description: '**Impact**' }] },
          },
          {
            type: 'work_experience', title: 'Work', sortOrder: 1, visible: true,
            content: { items: [{ id: 'work-1', company: 'Company', position: 'Role', startDate: '2024', endDate: '2025', current: false, description: '', technologies: [], highlights: ['**Highlight**'] }] },
          },
        ],
      } as never, false);

      expect(html, template).toContain('<strong>Impact</strong>');
      expect(html, template).toContain('<strong>Highlight</strong>');
      expect(html, template).not.toContain('**Impact**');
      expect(html, template).not.toContain('**Highlight**');
    }
  });

  test('forces the stable export font on text descendants for every template', async () => {
    for (const template of TEMPLATES) {
      const html = await generateHtml({ ...resume, template } as never, true);

      expect(html, template).toContain(
        '.resume-export, .resume-export * {\n      font-family: "Noto Sans SC", sans-serif !important;',
      );
      expect(html, template).toContain(
        '.resume-export *::before, .resume-export *::after {\n      font-family: "Noto Sans SC", sans-serif !important;',
      );
    }
  });
});
