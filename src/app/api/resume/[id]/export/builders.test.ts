import { describe, expect, test } from 'vitest';

import { generateHtml } from './builders';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';
import type { TemplateManifestV1 } from '@/types/template';

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
