import { describe, expect, test, vi } from 'vitest';

import { hashManifest } from './normalize-manifest';
import { resolvePublicTemplateDetail, resolveTemplate } from './resolve-template';
import type { Resume } from '@/types/resume';
import type { TemplateCapability, TemplateManifestV1 } from '@/types/template';

function manifest(accent = '#2563eb'): TemplateManifestV1 {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent, background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'summary', placement: 'main', order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function capabilities(): TemplateCapability {
  return {
    supportedSections: ['summary'],
    paperSizes: ['a4'],
    supportsAvatar: true,
    atsCompatible: true,
    supportsZh: true,
    supportsEn: true,
    supportsHtml: true,
    supportsPdf: true,
    docxFidelity: 'generic',
  };
}

function resume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'resume-1',
    userId: 'user-1',
    title: 'Resume',
    template: 'modern',
    themeConfig: {
      primaryColor: '#111111', accentColor: '#2563eb', fontFamily: 'Inter', fontSize: 'medium',
      lineSpacing: 1.5, margin: { top: 20, right: 20, bottom: 20, left: 20 }, sectionSpacing: 16,
    },
    isDefault: false,
    language: 'en',
    revision: 1,
    templateVersionId: 'public-version-1',
    templateSource: 'local-snapshot',
    templateSnapshot: null,
    sections: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('resolveTemplate', () => {
  test('converts a strictly parsed public version detail into the exact preview resolution', () => {
    const publicManifest = manifest('#0891b2');
    const resolved = resolvePublicTemplateDetail({
      slug: 'modern',
      nameZh: '现代',
      nameEn: 'Modern',
      stableVersion: '1.2.3',
      category: { id: 'category-1', slug: 'professional', nameZh: '专业', nameEn: 'Professional', sortOrder: 1 },
      tags: [],
      thumbnailPath: 'templates/modern/v1.2.3/thumbnail.png',
      fullPreviewPath: 'templates/modern/v1.2.3/preview.png',
      favorite: false,
      rendererKind: 'declarative-v1',
      capabilities: capabilities(),
      version: { id: 'version-1', version: '1.2.3', publishedAt: new Date(0).toISOString() },
      manifest: publicManifest,
      manifestHash: hashManifest(publicManifest),
      source: { kind: 'official', license: 'JadeAI-template-license' },
    });

    expect(resolved).toMatchObject({
      kind: 'declarative-v1', source: 'public', slug: 'modern', version: '1.2.3',
      manifest: { colors: { accent: '#0891b2' } }, degraded: false,
    });
  });

  test('uses a valid saved local snapshot before public and legacy sources', async () => {
    const savedManifest = manifest('#0f766e');
    const loadPublicVersion = vi.fn();

    const resolved = await resolveTemplate(
      resume({
        templateSnapshot: {
          rendererKind: 'declarative-v1',
          schemaVersion: 1,
          manifest: savedManifest,
          manifestHash: hashManifest(savedManifest),
          capabilities: capabilities(),
        },
      }),
      { loadPublicVersion },
    );

    expect(resolved).toMatchObject({
      kind: 'declarative-v1',
      source: 'local-snapshot',
      manifest: { colors: { accent: '#0f766e' } },
      degraded: false,
    });
    expect(loadPublicVersion).not.toHaveBeenCalled();
  });

  test('loads the exact saved public version id and validates its immutable manifest hash', async () => {
    const publicManifest = manifest('#7c3aed');
    const loadPublicVersion = vi.fn(async () => ({
      slug: 'modern', version: '2.3.4', rendererKind: 'declarative-v1' as const,
      status: 'published' as const, manifest: publicManifest, manifestHash: hashManifest(publicManifest),
      capabilities: capabilities(),
    }));

    const resolved = await resolveTemplate(
      resume({ templateSource: 'public', templateSnapshot: null, templateVersionId: 'immutable-version-id' }),
      { loadPublicVersion },
    );

    expect(loadPublicVersion).toHaveBeenCalledWith('immutable-version-id');
    expect(resolved).toMatchObject({
      kind: 'declarative-v1', source: 'public', slug: 'modern', version: '2.3.4',
      manifest: { colors: { accent: '#7c3aed' } }, degraded: false,
    });
  });

  test('fails a blocked public version closed to its recorded validated fallback', async () => {
    const fallbackManifest = manifest('#b91c1c');
    const resolved = await resolveTemplate(resume({ templateSnapshot: null }), {
      loadPublicVersion: async () => ({
        slug: 'modern', version: '2.0.0', rendererKind: 'declarative-v1', status: 'blocked',
        manifest: manifest(), manifestHash: hashManifest(manifest()), capabilities: capabilities(),
        fallback: {
          slug: 'modern', version: '1.5.0', rendererKind: 'declarative-v1', status: 'published',
          manifest: fallbackManifest, manifestHash: hashManifest(fallbackManifest), capabilities: capabilities(),
        },
      }),
    });

    expect(resolved).toMatchObject({
      kind: 'declarative-v1', source: 'fallback', version: '1.5.0',
      degraded: true, reason: 'public_version_blocked',
    });
  });

  test('never executes an invalid public manifest and fails closed to classic without a recorded fallback', async () => {
    const invalidPublic = {
      slug: 'modern', version: '1.0.0', rendererKind: 'declarative-v1' as const, status: 'published' as const,
      manifest: manifest(), manifestHash: '0'.repeat(64), capabilities: capabilities(),
    };
    const registeredSlug = await resolveTemplate(resume({ templateSnapshot: null, template: 'modern' }), {
      loadPublicVersion: async () => invalidPublic,
    });
    const classic = await resolveTemplate(resume({ templateSnapshot: null, template: 'not-registered' }), {
      loadPublicVersion: async () => invalidPublic,
    });

    expect(registeredSlug).toMatchObject({ kind: 'legacy-react', source: 'classic', slug: 'classic', degraded: true, reason: 'public_version_invalid' });
    expect(classic).toMatchObject({ kind: 'legacy-react', source: 'classic', slug: 'classic', degraded: true, reason: 'public_version_invalid' });
  });

  test('uses registered legacy when the saved public version is missing rather than invalid', async () => {
    const resolved = await resolveTemplate(resume({ templateSnapshot: null, template: 'modern' }), {
      loadPublicVersion: async () => null,
    });

    expect(resolved).toMatchObject({
      kind: 'legacy-react', source: 'legacy', slug: 'modern', degraded: true, reason: 'public_version_missing',
      capabilities: { docxFidelity: 'high-fidelity' },
    });
  });
});
