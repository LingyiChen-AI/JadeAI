import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { DeclarativeTemplateDocument } from '@/components/preview/declarative-template-document';
import type { Resume } from '@/types/resume';
import type { TemplateManifestV1, TemplateManifestV2 } from '@/types/template';

import {
  buildTemplateDocument,
  collectTemplateDocumentLinks,
  collectTemplateDocumentText,
  normalizeResumeForTemplate,
  serializeTemplateDocumentHtml,
} from './template-document';

const manifest: TemplateManifestV1 = {
  schemaVersion: 1,
  rendererKind: 'declarative-v1',
  layout: { type: 'two-column', sidebarPosition: 'right', sidebarWidthPercent: 35, columnGapMm: 7 },
  typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 11, lineHeight: 1.4, headingScale: 1.3 },
  colors: { text: '#111111', muted: '#666666', accent: '#0f766e', background: '#ffffff' },
  spacing: { pageMarginMm: 14, sectionGapMm: 5 },
  sectionSlots: [
    { sectionType: 'projects', placement: 'main', order: 0 },
    { sectionType: 'summary', placement: 'sidebar', order: 1 },
  ],
  sectionStyles: [
    { sectionType: 'projects', element: 'heading', variant: 'accent' },
    { sectionType: 'summary', element: 'heading', variant: 'bordered' },
  ],
  features: { showAvatar: true, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
};

const v2Manifest: TemplateManifestV2 = {
  ...manifest,
  schemaVersion: 2,
  rendererKind: 'declarative-v2',
  header: { variant: 'band', contactLayout: 'separated' },
  entry: { variant: 'timeline' },
  section: { headingVariant: 'side-rule' },
  skills: { variant: 'compact-grid' },
  decoration: { variant: 'corner-accent' },
  density: 'compact',
  palette: { secondary: '#334155', surface: '#f8fafc', border: '#cbd5e1' },
  border: { widthPt: 1.5, radiusMm: 2 },
};

function resume(): Resume {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'resume-secret-id', userId: 'user-secret-id', title: 'Platform Engineer', template: 'classic',
    themeConfig: { primaryColor: '#000000', accentColor: '#000000', fontFamily: 'Inter', fontSize: 'medium', lineSpacing: 1.5, margin: { top: 20, right: 20, bottom: 20, left: 20 }, sectionSpacing: 16 },
    isDefault: false, language: 'en', revision: 7, templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    sections: [
      { id: 'summary-id', resumeId: 'resume-secret-id', type: 'summary', title: 'Summary', sortOrder: 0, visible: true, content: { text: 'Builds reliable systems', aiState: 'model-internal-secret' } as unknown as Resume['sections'][number]['content'], createdAt: now, updatedAt: now },
      { id: 'project-id', resumeId: 'resume-secret-id', type: 'projects', title: 'Projects', sortOrder: 1, visible: true, content: { items: [{ id: 'p1', name: 'Jade', url: 'https://example.com/work?q=1&x=2', description: 'A <safe> project', technologies: ['TypeScript'], highlights: [] }, { id: 'p2', name: 'Unsafe', url: 'javascript:alert(1)', description: '', technologies: [], highlights: [] }] }, createdAt: now, updatedAt: now },
      { id: 'personal-id', resumeId: 'resume-secret-id', type: 'personal_info', title: 'Profile', sortOrder: 2, visible: true, content: { fullName: 'Alex Chen', avatar: 'data:image/png;base64,AAAA', adminState: 'never expose' } as unknown as Resume['sections'][number]['content'], createdAt: now, updatedAt: now },
      { id: 'hidden-id', resumeId: 'resume-secret-id', type: 'custom', title: 'Hidden', sortOrder: 3, visible: false, content: { items: [{ id: 'x', title: 'Never render', description: '' }] }, createdAt: now, updatedAt: now },
    ],
    createdAt: now, updatedAt: now,
  };
}

describe('declarative template document', () => {
  test('keeps declarative-v2 presentation metadata identical in React and HTML', () => {
    const document = buildTemplateDocument(normalizeResumeForTemplate(resume()), v2Manifest);
    const outputs = [serializeTemplateDocumentHtml(document), renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />)];

    expect(document.kind).toBe('template-document-v2');
    for (const output of outputs) {
      expect(output).toContain('data-renderer-kind="declarative-v2"');
      expect(output).toContain('data-header-variant="band"');
      expect(output).toContain('data-contact-layout="separated"');
      expect(output).toContain('data-entry-variant="timeline"');
      expect(output).toContain('data-section-heading="side-rule"');
      expect(output).toContain('data-skills-variant="compact-grid"');
      expect(output).toContain('data-decoration="corner-accent"');
      expect(output).toContain('data-density="compact"');
      expect(output).toContain('#f8fafc');
      expect(output).toContain('#cbd5e1');
    }
  });

  test('keeps split headers in two explicit columns so long contact links cannot create implicit narrow columns', () => {
    const splitManifest: TemplateManifestV2 = {
      ...v2Manifest,
      header: { variant: 'split', contactLayout: 'sidebar' },
      sectionSlots: [
        { sectionType: 'personal_info', placement: 'header', order: 0 },
        ...v2Manifest.sectionSlots,
      ],
    };
    const source = resume();
    source.sections = source.sections.map((section) => section.type === 'personal_info'
      ? {
          ...section,
          content: {
            fullName: 'Alex Chen',
            website: 'https://portfolio.example.test/alex-chen/platform-engineering',
            customLinks: [{ label: 'Technical writing', url: 'https://blog.example.test/articles/platform-reliability' }],
          } as unknown as Resume['sections'][number]['content'],
        }
      : section);

    const document = buildTemplateDocument(normalizeResumeForTemplate(source), splitManifest);
    const reactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />);

    expect(reactHtml).toContain('grid-template-columns:minmax(24mm, auto) minmax(0, 1fr)');
    expect(reactHtml).toMatch(/<h2 style="[^"]*grid-column:1[^"]*">Profile<\/h2>/);
    expect(reactHtml.match(/data-block="contact" style="[^"]*grid-column:2/g)).toHaveLength(2);
    expect(reactHtml).toMatch(/href="https:\/\/portfolio\.example\.test[^\"]+"[^>]+overflow-wrap:anywhere/);
    expect(reactHtml).toMatch(/href="https:\/\/blog\.example\.test[^\"]+"[^>]+overflow-wrap:anywhere/);
  });

  test('keeps React and HTML text, links, section order, colors and layout metadata identical', () => {
    const view = normalizeResumeForTemplate(resume());
    expect(JSON.stringify(view)).not.toMatch(/user-secret-id|resume-secret-id|revision|createdAt|updatedAt|aiState|model-internal-secret/);
    expect(view.sections.find((section) => section.type === 'personal_info')?.content).toMatchObject({ avatar: 'data:image/png;base64,AAAA' });

    const document = buildTemplateDocument(view, manifest);
    const html = serializeTemplateDocumentHtml(document);
    const reactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />);

    expect(document.sections.map((section) => section.type)).toEqual(['projects', 'summary', 'personal_info']);
    const avatarImages = document.sections.find((section) => section.type === 'personal_info')!
      .blocks.flatMap((block) => (block as { images?: Array<{ src: string }> }).images ?? []);
    expect(avatarImages).toEqual([{ src: 'data:image/png;base64,AAAA', alt: '', role: 'avatar' }]);
    expect(collectTemplateDocumentText(document)).toEqual(expect.arrayContaining([
      'Projects', 'Jade', 'A <safe> project', 'Summary', 'Builds reliable systems',
    ]));
    expect(collectTemplateDocumentLinks(document)).toEqual(['https://example.com/work?q=1&x=2']);
    for (const output of [html, reactHtml]) {
      expect(output).toContain('data-layout="two-column"');
      expect(output).toContain('data-sidebar-position="right"');
      expect(output).toContain('#0f766e');
      expect(output).toContain('Projects');
      expect(output.indexOf('Projects')).toBeLessThan(output.indexOf('Summary'));
      expect(output).toContain('href="https://example.com/work?q=1&amp;x=2"');
      expect(output).not.toContain('javascript:');
      expect(output).not.toContain('Never render');
      expect(output).not.toContain('never expose');
      expect(output).toContain('A &lt;safe&gt; project');
      expect(output).toContain('src="data:image/png;base64,AAAA"');
    }
    expect(reactHtml).toContain('display:grid');
    expect(reactHtml).toContain('grid-auto-flow:row dense');
    expect(reactHtml).toContain('grid-template-columns:minmax(0, 1fr) 35%');
    expect(reactHtml).toContain('color:#0f766e');
    expect(reactHtml).toContain('border-bottom:1px solid #0f766e');
    expect(html).toContain('grid-auto-flow:row dense');
    expect(html).toContain('data-heading-variant="bordered"');
    expect(html).toContain('data-placement="sidebar"');
  });

  test('preserves unknown section text and applies every schema-backed style and feature flag', () => {
    const styledManifest: TemplateManifestV1 = {
      ...manifest,
      sectionStyles: (['heading', 'body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr'] as const).map((element) => ({
        sectionType: 'summary', element, variant: element === 'divider' ? 'bordered' : element === 'body' ? 'accent' : 'compact',
      })),
      features: { ...manifest.features, showQrCodes: false, showPageNumbers: true },
    };
    const source = {
      ...resume(),
      sections: [
        ...resume().sections,
        {
          type: 'future_section', title: 'Future section', sortOrder: 4, visible: true,
          content: { publicNote: 'Keep future content', avatar: 'Keep unknown avatar field', nested: [{ label: 'Nested fallback' }], userId: 'do-not-leak', _private: 'hidden' },
        },
        {
          type: 'qr_codes', title: 'QR', sortOrder: 5, visible: true,
          content: { items: [{ label: 'Portfolio QR', url: 'https://example.com/qr' }] },
        },
      ],
    };
    const document = buildTemplateDocument(normalizeResumeForTemplate(source), styledManifest);
    const html = serializeTemplateDocumentHtml(document);
    const reactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />);

    expect(collectTemplateDocumentText(document)).toEqual(expect.arrayContaining(['Future section', 'Keep future content', 'Keep unknown avatar field', 'Nested fallback']));
    expect(JSON.stringify(document)).not.toMatch(/do-not-leak|hidden/);
    expect(document.sections.some((section) => section.type === 'qr_codes')).toBe(false);
    for (const output of [html, reactHtml]) {
      expect(output).toContain('data-style-body="accent"');
      expect(output).toContain('data-style-date="compact"');
      expect(output).toContain('data-style-divider="bordered"');
      expect(output).toContain('data-style-bullet="compact"');
      expect(output).toContain('data-style-avatar="compact"');
      expect(output).toContain('data-style-contact="compact"');
      expect(output).toContain('data-style-qr="compact"');
      expect(output).toContain('data-page-numbers="true"');
      expect(output).toContain('data-max-pages="4"');
      expect(output).toContain('data-page-number="1"');
      expect(output).not.toContain('Portfolio QR');
    }
    expect(reactHtml).toContain('<span data-tone="default" style="color:#0f766e">Builds reliable systems');
  });

  test('creates real list and QR blocks with export-safe QR images', () => {
    const source = {
      ...resume(),
      sections: [
        ...resume().sections,
        {
          type: 'work_experience', title: 'Work', sortOrder: 4, visible: true,
          content: { items: [{ company: 'Jade', highlights: ['Built one', 'Built two'] }] },
        },
        {
          type: 'qr_codes', title: 'QR', sortOrder: 5, visible: true,
          content: { items: [{ label: 'Portfolio QR', url: 'https://example.com/qr' }] },
        },
      ],
    };
    const styledManifest: TemplateManifestV1 = {
      ...manifest,
      sectionStyles: [
        { sectionType: 'work_experience', element: 'bullet', variant: 'accent' },
        { sectionType: 'work_experience', element: 'date', variant: 'bordered' },
        { sectionType: 'qr_codes', element: 'qr', variant: 'bordered' },
      ],
      features: { ...manifest.features, showQrCodes: true },
    };
    const qrImage = 'data:image/svg+xml;base64,PHN2Zy8+';
    const document = buildTemplateDocument(normalizeResumeForTemplate(source), styledManifest, {
      qrImagesByUrl: { 'https://example.com/qr': qrImage },
    });
    const work = document.sections.find((section) => section.type === 'work_experience');
    const qr = document.sections.find((section) => section.type === 'qr_codes');
    expect(work?.blocks.some((block) => block.kind === 'list')).toBe(true);
    expect(qr?.blocks).toEqual([expect.objectContaining({
      kind: 'qr',
      images: [expect.objectContaining({ role: 'qr', src: qrImage })],
    })]);
    for (const output of [serializeTemplateDocumentHtml(document), renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />)]) {
      expect(output).toContain('data-block="list"');
      expect(output).toContain('data-block="qr"');
      expect(output).toContain('data-image-role="qr"');
      expect(output).toContain('data-style-bullet="accent"');
      expect(output).toContain('data-style-date="bordered"');
      expect(output).toContain('data-style-qr="bordered"');
    }
  });
});
