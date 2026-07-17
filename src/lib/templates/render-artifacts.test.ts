import { mkdir, writeFile } from 'node:fs/promises';

import { beforeAll, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/db/repositories/resume.repository', () => ({
  resumeRepository: { findById: vi.fn() },
}));

import { generateHtml } from '@/app/api/resume/[id]/export/builders';
import { generateDocxBuffer } from '@/app/api/resume/[id]/export/docx';
import { generatePdf } from '@/lib/pdf/generate-pdf';
import type { ResolvedTemplate } from './resolve-template';
import type { TemplateManifestV1 } from '@/types/template';

const outputDirectory = '/tmp/jadeai-phase2-artifacts';

const manifest: TemplateManifestV1 = {
  schemaVersion: 1,
  rendererKind: 'declarative-v1',
  layout: { type: 'two-column', sidebarPosition: 'right', sidebarWidthPercent: 34, columnGapMm: 7 },
  typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.45, headingScale: 1.3 },
  colors: { text: '#18181b', muted: '#71717a', accent: '#0f766e', background: '#ffffff' },
  spacing: { pageMarginMm: 12, sectionGapMm: 5 },
  sectionSlots: [
    { sectionType: 'personal_info', placement: 'header', order: 0 },
    { sectionType: 'summary', placement: 'sidebar', order: 1 },
    { sectionType: 'projects', placement: 'main', order: 2 },
  ],
  sectionStyles: [{ sectionType: 'projects', element: 'heading', variant: 'accent' }],
  features: { showAvatar: false, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
};

const capabilities = {
  supportedSections: ['personal_info', 'summary', 'projects'] as const,
  paperSizes: ['a4'] as const,
  supportsAvatar: false,
  atsCompatible: true,
  supportsZh: true,
  supportsEn: true,
  supportsHtml: true,
  supportsPdf: true,
  docxFidelity: 'generic' as const,
};

function artifactResume(template: string) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'artifact-resume', userId: 'artifact-user', title: 'Phase 2 Artifact', template,
    themeConfig: { primaryColor: '#18181b', accentColor: '#0f766e', fontFamily: 'Inter', fontSize: 'medium', lineSpacing: 1.5, margin: { top: 20, right: 20, bottom: 20, left: 20 }, sectionSpacing: 16, avatarStyle: 'oneInch' },
    isDefault: false, language: 'en', shareToken: null, isPublic: false, sharePassword: null, viewCount: 0,
    revision: 1, templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    createdAt: now, updatedAt: now,
    sections: [
      { id: 'personal', resumeId: 'artifact-resume', type: 'personal_info', title: 'Profile', sortOrder: 0, visible: true, content: { fullName: 'Alex Chen', jobTitle: 'Platform Engineer', email: 'alex@example.com', phone: '+49 123 456', location: 'Berlin' }, createdAt: now, updatedAt: now },
      { id: 'summary', resumeId: 'artifact-resume', type: 'summary', title: 'Summary', sortOrder: 1, visible: true, content: { text: 'Builds reliable systems with deterministic rendering.' }, createdAt: now, updatedAt: now },
      { id: 'projects', resumeId: 'artifact-resume', type: 'projects', title: 'Projects', sortOrder: 2, visible: true, content: { items: [{ id: 'project-1', name: 'JadeAI', url: 'https://example.com/jade', description: 'Unified resume rendering.', technologies: ['TypeScript', 'React'], highlights: ['Shared document tree'] }] }, createdAt: now, updatedAt: now },
    ],
  };
}

const legacyResolution: ResolvedTemplate = {
  kind: 'legacy-react', source: 'legacy', slug: 'modern', degraded: false,
  capabilities: { ...capabilities, supportedSections: [...capabilities.supportedSections], paperSizes: [...capabilities.paperSizes], docxFidelity: 'high-fidelity' },
};
const declarativeResolution: ResolvedTemplate = {
  kind: 'declarative-v1', source: 'local-snapshot', manifest, degraded: false,
  capabilities: { ...capabilities, supportedSections: [...capabilities.supportedSections], paperSizes: [...capabilities.paperSizes] },
};

describe('representative renderer artifacts', () => {
  beforeAll(async () => mkdir(outputDirectory, { recursive: true }));

  test('writes inspectable HTML, PDF and DOCX for legacy-react and declarative-v1', async () => {
    const legacyResume = artifactResume('modern');
    const declarativeResume = artifactResume('classic');
    const legacyHtml = await generateHtml(legacyResume, true, legacyResolution);
    const declarativeHtml = await generateHtml(declarativeResume, true, declarativeResolution);
    const [legacyPdf, declarativePdf, legacyDocx, declarativeDocx] = await Promise.all([
      generatePdf(legacyHtml),
      generatePdf(declarativeHtml),
      generateDocxBuffer(legacyResume),
      generateDocxBuffer({ ...declarativeResume, template: 'classic' }),
    ]);

    const artifacts = [
      ['legacy-react.html', Buffer.from(legacyHtml)],
      ['legacy-react.pdf', legacyPdf],
      ['legacy-react.docx', legacyDocx],
      ['declarative-v1.html', Buffer.from(declarativeHtml)],
      ['declarative-v1.pdf', declarativePdf],
      ['declarative-v1.docx', declarativeDocx],
    ] as const;
    await Promise.all(artifacts.map(([name, bytes]) => writeFile(`${outputDirectory}/${name}`, bytes)));

    expect(legacyHtml).toContain('resume-export');
    expect(legacyHtml).toContain('Alex Chen');
    expect(declarativeHtml).toContain('data-layout="two-column"');
    expect(declarativeHtml).toContain('href="https://example.com/jade"');
    expect(declarativeHtml).toContain('Alex Chen');
    for (const pdf of [legacyPdf, declarativePdf]) {
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.byteLength).toBeGreaterThan(5_000);
    }
    for (const docx of [legacyDocx, declarativeDocx]) {
      expect(docx.subarray(0, 2).toString()).toBe('PK');
      expect(docx.byteLength).toBeGreaterThan(5_000);
    }
  }, 120_000);
});
