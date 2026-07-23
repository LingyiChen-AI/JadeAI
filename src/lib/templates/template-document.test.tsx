import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { DeclarativeTemplateDocument } from '@/components/preview/declarative-template-document';
import { ResumePreview } from '@/components/preview/resume-preview';
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
  test('preserves safe inline rich text in React and serialized HTML output', () => {
    const source = resume();
    source.sections.find((section) => section.type === 'summary')!.content = {
      text: '**Led** platform delivery with <unsafe> input',
    };
    const projects = source.sections.find((section) => section.type === 'projects')!;
    const projectContent = projects.content as unknown as { items: Array<Record<string, unknown>> };
    projects.content = {
      ...projectContent,
      items: [{
        ...projectContent.items[0],
        technologies: ['**TypeScript**'],
      }],
    } as Resume['sections'][number]['content'];
    const document = buildTemplateDocument(normalizeResumeForTemplate(source), manifest);

    for (const output of [
      serializeTemplateDocumentHtml(document),
      renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />),
    ]) {
      expect(output).toContain('<strong>Led</strong> platform delivery with &lt;unsafe&gt; input');
      expect(output).toContain('<li data-tone="default"><strong>TypeScript</strong></li>');
      expect(output).not.toContain('**Led**');
      expect(output).not.toContain('**TypeScript**');
    }
  });

  test('marks only editor fixture text and links from stable section paths', () => {
    const source = resume();
    source.sections.find((section) => section.type === 'personal_info')!.content = {
      fullName: 'JADEAI_EDITOR_SAMPLE_ONLY',
      website: 'https://sample.example.com',
    } as Resume['sections'][number]['content'];
    source.sections.find((section) => section.type === 'summary')!.content = {
      text: 'Sample summary',
    };
    const document = buildTemplateDocument(normalizeResumeForTemplate(source), manifest, {
      placeholderPaths: new Set(['personal_info.fullName', 'personal_info.website', 'summary.text', 'projects.items']),
    });
    const runs = document.sections.flatMap((section) => section.blocks.flatMap((block) => block.textRuns));
    const links = document.sections.flatMap((section) => section.blocks.flatMap((block) => block.links));

    expect(runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'JADEAI_EDITOR_SAMPLE_ONLY', placeholder: true }),
      expect.objectContaining({ text: 'Sample summary', placeholder: true }),
      expect.objectContaining({ text: 'Jade', placeholder: true }),
    ]));
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'https://sample.example.com', placeholder: true }),
      expect.objectContaining({ label: 'https://example.com/work?q=1&x=2', placeholder: true }),
    ]));

    const html = serializeTemplateDocumentHtml(document);
    const reactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />);
    const placeholderListItems = document.sections.flatMap((section) => section.blocks)
      .filter((block) => block.kind === 'list')
      .flatMap((block) => block.textRuns)
      .filter((textRun) => textRun.placeholder);
    expect(placeholderListItems.map((item) => item.text)).toEqual(['TypeScript']);
    for (const output of [html, reactHtml]) {
      expect(output).toContain('data-placeholder="true"');
      expect(output).toContain('opacity:0.58');
      expect(output).not.toContain('data-placeholder="false"');
      expect(output.match(/<li[^>]*data-placeholder="true"[^>]*opacity:0\.58[^>]*>/g)).toHaveLength(placeholderListItems.length);
      expect(output).toContain('<li data-tone="default" data-placeholder="true" style="opacity:0.58">TypeScript</li>');
    }
    const baseline = serializeTemplateDocumentHtml(buildTemplateDocument(normalizeResumeForTemplate(source), manifest));
    expect(baseline).not.toContain('data-placeholder');
    expect(baseline).not.toContain('opacity:0.58');
  });

  test('carries effective theme style without changing V2 structure or section order', () => {
    const view = normalizeResumeForTemplate(resume());
    const baseline = buildTemplateDocument(view, v2Manifest);
    const document = buildTemplateDocument(view, v2Manifest, {
      themeConfig: {
        primaryColor: '#ABCDEF', accentColor: '#FEDCBA', fontFamily: 'Georgia', fontSize: 'small',
        lineSpacing: 1.8, sectionSpacing: 12, margin: { top: 8, right: 16, bottom: 24, left: 32 }, avatarStyle: 'circle',
      },
    });

    expect(document.sections).toEqual(baseline.sections);
    expect(document.layout).toEqual(baseline.layout);
    expect(collectTemplateDocumentText(document)).toEqual(collectTemplateDocumentText(baseline));
    expect(collectTemplateDocumentLinks(document)).toEqual(collectTemplateDocumentLinks(baseline));
    expect(document.headingColor).toBe('#ABCDEF');
    expect(document.fontFamily).toBe('noto-sans-sc');
    expect(document.avatarStyle).toBe('circle');
    expect(document.colors).toEqual({ ...v2Manifest.colors, accent: '#FEDCBA' });
    expect(document.typography).toEqual({ ...v2Manifest.typography, baseFontSizePt: 9.9, lineHeight: 1.8 });
    expect(document.spacing).toEqual({ ...v2Manifest.spacing, sectionGapMm: 3.175 });
    expect(document.page.marginMm).toEqual({ top: 2.117, right: 4.233, bottom: 6.35, left: 8.467 });
    expect(document.presentation).toEqual({
      header: v2Manifest.header, entry: v2Manifest.entry, section: v2Manifest.section, skills: v2Manifest.skills,
      decoration: v2Manifest.decoration, density: v2Manifest.density, palette: v2Manifest.palette, border: v2Manifest.border,
    });
  });

  test('renders effective style consistently without changing heading variants or layout', () => {
    const document = buildTemplateDocument(normalizeResumeForTemplate(resume()), manifest, {
      themeConfig: {
        primaryColor: '#ABCDEF', accentColor: '#FEDCBA', fontSize: 'small', lineSpacing: 1.8,
        sectionSpacing: 12, margin: { top: 8, right: 16, bottom: 24, left: 32 }, avatarStyle: 'circle',
      },
    });
    const html = serializeTemplateDocumentHtml(document);
    const reactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />);

    for (const output of [html, reactHtml]) {
      expect(output).toContain('--template-heading:#ABCDEF');
      expect(output).toContain('--template-accent:#FEDCBA');
      expect(output).toContain('--template-font-size:9.9pt');
      expect(output).toContain('--template-line-height:1.8');
      expect(output).toContain('--template-section-gap:3.175mm');
      expect(output).toContain('--template-page-margin-top:2.117mm');
      expect(output).toContain('--template-page-margin-right:4.233mm');
      expect(output).toContain('--template-page-margin-bottom:6.35mm');
      expect(output).toContain('--template-page-margin-left:8.467mm');
      expect(output).toContain('data-avatar-style="circle"');
      expect(output).toContain('data-layout="two-column"');
      expect(output).not.toContain('[object Object]mm');
    }
    expect(reactHtml).toContain('padding:2.117mm 4.233mm 6.35mm 8.467mm');
    expect(reactHtml).toContain('font-family:&quot;Noto Sans SC&quot;, sans-serif');
    expect(reactHtml).toMatch(/data-heading-variant="accent"[^>]*><h2 style="[^"]*color:#FEDCBA/);
    expect(reactHtml).toMatch(/data-heading-variant="bordered"[^>]*><h2 style="[^"]*color:#ABCDEF/);
    expect(reactHtml).toMatch(/data-image-role="avatar" style="[^"]*border-radius:9999px/);
    expect(html).toContain('data-heading-variant="accent"');
    expect(html).toContain('data-heading-variant="bordered"');

    const baseline = buildTemplateDocument(normalizeResumeForTemplate(resume()), manifest);
    for (const output of [serializeTemplateDocumentHtml(baseline), renderToStaticMarkup(<DeclarativeTemplateDocument document={baseline} />)]) {
      expect(output).toContain('--template-heading:#111111');
      expect(output).toContain('--template-page-margin-top:14mm');
      expect(output).toContain('--template-page-margin-right:14mm');
      expect(output).toContain('--template-page-margin-bottom:14mm');
      expect(output).toContain('--template-page-margin-left:14mm');
      expect(output).toContain('data-avatar-style="oneInch"');
      expect(output).not.toContain('[object Object]mm');
    }
  });

  test('passes only persisted declarative theme values through ResumePreview', () => {
    const source = {
      ...resume(),
      themeConfig: { accentColor: '#ABCDEF' } as Resume['themeConfig'],
      resolvedTemplate: {
        kind: 'declarative-v1', source: 'public', slug: 'test', version: '1.0.0', manifest, degraded: false,
        capabilities: {
          supportedSections: [], paperSizes: ['a4'], supportsAvatar: true, atsCompatible: true,
          supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'generic',
        },
      } as NonNullable<Resume['resolvedTemplate']>,
    };

    const output = renderToStaticMarkup(<ResumePreview resume={source} />);

    expect(output).toContain('--template-accent:#ABCDEF');
    expect(output).toContain('--template-heading:#111111');
    expect(output).toContain('--template-page-margin-top:14mm');
    expect(output).toContain('--template-page-margin-right:14mm');
    expect(output).toContain('--template-page-margin-bottom:14mm');
    expect(output).toContain('--template-page-margin-left:14mm');
    expect(output).not.toContain('[object Object]mm');
  });

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

  test('keeps a V2 band header title readable after effective heading overrides', () => {
    const bandManifest: TemplateManifestV2 = {
      ...v2Manifest,
      sectionSlots: [
        { sectionType: 'personal_info', placement: 'header', order: 0 },
        ...v2Manifest.sectionSlots,
      ],
      sectionStyles: [
        ...v2Manifest.sectionStyles,
        { sectionType: 'personal_info', element: 'heading', variant: 'accent' },
      ],
    };
    const document = buildTemplateDocument(normalizeResumeForTemplate(resume()), bandManifest, {
      themeConfig: { primaryColor: '#ABCDEF' },
    });
    const html = serializeTemplateDocumentHtml(document);
    const reactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />);

    for (const output of [html, reactHtml]) {
      expect(output).toContain('data-header-variant="band"');
      expect(output).toContain('data-placement="header"');
      expect(output).toContain('data-heading-variant="accent"');
      expect(output).toContain('--template-heading:#ABCDEF');
      expect(output).toContain('--template-background:#ffffff');
    }
    expect(html).toMatch(/data-placement="header"[^>]*><h2>Profile<\/h2>/);
    expect(reactHtml).toMatch(/data-placement="header"[^>]*><h2 style="[^"]*color:#ffffff[^"]*">Profile<\/h2>/);
    expect(reactHtml).not.toMatch(/data-placement="header"[^>]*><h2 style="[^"]*color:(?:#ABCDEF|#0f766e)/);
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

  test('preserves placeholder QR link provenance in React and serialized HTML without changing normal QR fallback', () => {
    const source = {
      ...resume(),
      sections: [{
        type: 'qr_codes', title: 'QR', sortOrder: 0, visible: true,
        content: { items: [{ label: 'Sample portfolio', url: 'https://example.com/sample' }] },
      }],
    };
    const qrManifest: TemplateManifestV1 = {
      ...manifest,
      sectionSlots: [{ sectionType: 'qr_codes', placement: 'main', order: 0 }],
      features: { ...manifest.features, showQrCodes: true },
    };
    const view = normalizeResumeForTemplate(source);
    const document = buildTemplateDocument(view, qrManifest, {
      placeholderPaths: new Set(['qr_codes.items']),
    });
    const link = document.sections[0].blocks[0].links[0];
    expect(link).toMatchObject({
      label: 'Sample portfolio',
      href: 'https://example.com/sample',
      placeholder: true,
    });

    for (const output of [serializeTemplateDocumentHtml(document), renderToStaticMarkup(<DeclarativeTemplateDocument document={document} />)]) {
      expect(output).toContain('data-block="qr"');
      expect(output).toContain('href="https://example.com/sample"');
      expect(output).toContain('data-placeholder="true"');
      expect(output).toContain('style="opacity:0.58"');
      expect(output).toContain('>Sample portfolio</a>');
    }

    const labelOnlyDocument = buildTemplateDocument(view, qrManifest, {
      placeholderPaths: new Set(['qr_codes.items.0.label']),
    });
    const labelOnlyBlock = labelOnlyDocument.sections[0].blocks[0];
    expect(labelOnlyBlock.textRuns[0]).toMatchObject({ text: 'Sample portfolio', placeholder: true });
    expect(labelOnlyBlock.links[0].placeholder).toBeUndefined();
    const labelOnlyReactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={labelOnlyDocument} />);
    expect(labelOnlyReactHtml).toContain('href="https://example.com/sample"');
    expect(labelOnlyReactHtml).toContain('data-placeholder="true"');
    expect(labelOnlyReactHtml).toContain('style="opacity:0.58"');
    expect(labelOnlyReactHtml).toContain('>Sample portfolio</a>');

    const hrefOnlyDocument = buildTemplateDocument(view, qrManifest, {
      placeholderPaths: new Set(['qr_codes.items.0.url']),
    });
    const hrefOnlyBlock = hrefOnlyDocument.sections[0].blocks[0];
    expect(hrefOnlyBlock.textRuns[0].placeholder).toBeUndefined();
    expect(hrefOnlyBlock.links[0]).toMatchObject({ href: 'https://example.com/sample', placeholder: true });
    const hrefOnlyReactHtml = renderToStaticMarkup(<DeclarativeTemplateDocument document={hrefOnlyDocument} />);
    expect(hrefOnlyReactHtml).toContain('href="https://example.com/sample"');
    expect(hrefOnlyReactHtml).toContain('data-placeholder="true"');
    expect(hrefOnlyReactHtml).toContain('style="opacity:0.58"');

    const normalReactHtml = renderToStaticMarkup(
      <DeclarativeTemplateDocument document={buildTemplateDocument(view, qrManifest)} />,
    );
    expect(normalReactHtml).toContain('data-block="qr"');
    expect(normalReactHtml).not.toContain('href="https://example.com/sample"');
    expect(normalReactHtml).not.toContain('data-placeholder');
  });

  test('retains stable field sources for direct editing without serializing ids', () => {
    const document = buildTemplateDocument(normalizeResumeForTemplate(resume()), manifest);
    const summary = document.sections.find((section) => section.type === 'summary')!;
    const project = document.sections.find((section) => section.type === 'projects')!;

    expect(summary.titleSource).toEqual({
      sectionId: 'summary-id', fieldPath: ['title'], kind: 'text', label: 'Summary title',
    });
    expect(summary.blocks[0].textRuns[0].source).toEqual({
      sectionId: 'summary-id', fieldPath: ['text'], kind: 'rich-text', label: 'text',
    });
    expect(project.blocks.flatMap((block) => block.textRuns).map((value) => value.source))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sectionId: 'project-id', itemId: 'p1', fieldPath: ['name'] }),
        expect.objectContaining({ sectionId: 'project-id', itemId: 'p1', fieldPath: ['description'] }),
        expect.objectContaining({ sectionId: 'project-id', itemId: 'p1', fieldPath: ['technologies', 0] }),
      ]));

    const html = serializeTemplateDocumentHtml(document);
    expect(html).not.toMatch(/summary-id|project-id|p1|data-editable-source/);
  });

  test('adds link sources and empty insertion metadata only when editing is requested', () => {
    const source = resume();
    source.sections.find((section) => section.type === 'personal_info')!.content = {
      fullName: 'Alex Chen', website: 'https://example.com', jobTitle: '', avatar: '',
    } as Resume['sections'][number]['content'];
    const view = normalizeResumeForTemplate(source);
    const ordinary = buildTemplateDocument(view, manifest);
    const editable = buildTemplateDocument(view, manifest, { includeEmptyEditableFields: true });
    const personalOrdinary = ordinary.sections.find((section) => section.type === 'personal_info')!;
    const personalEditable = editable.sections.find((section) => section.type === 'personal_info')!;

    expect(personalOrdinary.blocks.flatMap((block) => block.textRuns).some((run) => run.text === '')).toBe(false);
    expect(personalEditable.blocks.flatMap((block) => block.textRuns)).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '', source: expect.objectContaining({ fieldPath: ['jobTitle'] }) }),
    ]));
    expect(personalEditable.blocks.flatMap((block) => block.links)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        href: 'https://example.com/',
        source: expect.objectContaining({ fieldPath: ['website'], kind: 'url' }),
      }),
    ]));
    expect(serializeTemplateDocumentHtml(editable)).not.toMatch(/data-editable-source|Add field/);
  });
});
