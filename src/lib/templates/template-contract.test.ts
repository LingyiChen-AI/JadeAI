import { describe, expect, it } from 'vitest';

import {
  LOCAL_TEMPLATE_MAX_ESTIMATED_BYTES,
  LOCAL_TEMPLATE_MAX_RECORDS,
  LOCAL_TEMPLATE_MAX_THUMBNAIL_BYTES,
  MAX_JSON_ARRAY_LENGTH,
  MAX_JSON_DEPTH,
  MAX_JSON_NODES,
  MAX_JSON_STRING_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_SECTION_SLOTS,
  MAX_STYLE_RULES,
  LocalTemplateRecordSchema,
  TemplateBindingSchema,
  TemplateCapabilitySchema,
  TemplateCatalogItemSchema,
  TemplateCategorySchema,
  TemplateManifestV1Schema,
  TemplateSnapshotSchema,
  TemplateTagSchema,
  TemplateVersionDetailSchema,
  parseTemplateManifest,
} from './schema';
import {
  LocalTemplateExportSchema,
  canonicalizeManifest,
  hashManifest,
  normalizeManifest,
} from './normalize-manifest';
import { assertCanonicalManifestSize, validateJsonStructure } from './security';

const HASH = 'a'.repeat(64);

function validManifest() {
  return {
    schemaVersion: 1 as const,
    rendererKind: 'declarative-v1' as const,
    layout: {
      type: 'two-column' as const,
      sidebarPosition: 'left' as const,
      sidebarWidthPercent: 32,
      columnGapMm: 8,
    },
    typography: {
      fontFamily: 'noto-sans-sc' as const,
      baseFontSizePt: 10.5,
      lineHeight: 1.5,
      headingScale: 1.25,
    },
    colors: {
      text: '#111111',
      muted: '#666666',
      accent: '#2563eb',
      background: '#ffffff',
    },
    spacing: {
      pageMarginMm: 12,
      sectionGapMm: 6,
    },
    sectionSlots: [
      { sectionType: 'personal_info' as const, placement: 'sidebar' as const, order: 0 },
      { sectionType: 'work_experience' as const, placement: 'main' as const, order: 1 },
    ],
    sectionStyles: [
      { sectionType: 'work_experience' as const, element: 'heading' as const, variant: 'accent' as const },
    ],
    features: {
      showAvatar: true,
      showQrCodes: true,
      showPageNumbers: false,
      maxPages: 4,
    },
  };
}

function validCapabilities() {
  return {
    supportedSections: ['personal_info', 'work_experience'] as const,
    paperSizes: ['a4', 'letter'] as const,
    supportsAvatar: true,
    atsCompatible: true,
    supportsZh: true,
    supportsEn: true,
    supportsHtml: true,
    supportsPdf: true,
    docxFidelity: 'generic' as const,
  };
}

function validCatalogItem() {
  return {
    slug: 'clean-blue',
    stableVersion: '1.2.0',
    nameZh: '清爽蓝',
    nameEn: 'Clean Blue',
    category: { id: 'cat-1', slug: 'professional', nameZh: '专业', nameEn: 'Professional', sortOrder: 1 },
    tags: [
      { id: 'tag-1', slug: 'two-column', dimension: 'layout', nameZh: '双栏', nameEn: 'Two column' },
    ],
    thumbnailPath: 'templates/clean-blue/v1.2.0/thumbnail.webp',
    fullPreviewPath: 'templates/clean-blue/v1.2.0/preview.webp',
    capabilities: validCapabilities(),
    favorite: false,
  };
}

describe('template DTO schemas', () => {
  it('accepts the declarative-v1 manifest contract', () => {
    expect(TemplateManifestV1Schema.parse(validManifest())).toEqual(validManifest());
  });

  it('validates category and tag slug/dimension contracts', () => {
    expect(TemplateCategorySchema.safeParse(validCatalogItem().category).success).toBe(true);
    expect(TemplateCategorySchema.safeParse({ ...validCatalogItem().category, slug: 'Bad_Slug' }).success).toBe(false);
    expect(TemplateTagSchema.safeParse(validCatalogItem().tags[0]).success).toBe(true);
    expect(TemplateTagSchema.safeParse({ ...validCatalogItem().tags[0], dimension: 'mood' }).success).toBe(false);
  });

  it('requires explicit capability fields and section enums', () => {
    expect(TemplateCapabilitySchema.safeParse(validCapabilities()).success).toBe(true);
    const { supportsPdf: _removed, ...missingBoolean } = validCapabilities();
    expect(TemplateCapabilitySchema.safeParse(missingBoolean).success).toBe(false);
    expect(
      TemplateCapabilitySchema.safeParse({ ...validCapabilities(), supportedSections: ['made_up_section'] }).success,
    ).toBe(false);
    expect(TemplateCapabilitySchema.safeParse({ ...validCapabilities(), docxFidelity: 'pixel-perfect' }).success).toBe(false);
  });

  it('keeps public catalog DTOs free of manifests and internal provenance', () => {
    expect(TemplateCatalogItemSchema.parse(validCatalogItem())).toEqual(validCatalogItem());
    for (const forbidden of ['manifest', 'provenance', 'internalLicenseNotes']) {
      expect(TemplateCatalogItemSchema.safeParse({ ...validCatalogItem(), [forbidden]: 'secret' }).success).toBe(false);
    }
  });

  it('discriminates declarative and legacy public version details without internal source data', () => {
    const detail = {
      ...validCatalogItem(),
      version: { id: 'version-1', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z' },
      rendererKind: 'declarative-v1' as const,
      manifest: validManifest(),
      manifestHash: HASH,
      source: { kind: 'official', license: 'JadeAI-template-license' },
    };
    expect(TemplateVersionDetailSchema.parse(detail)).toEqual(detail);

    const legacyDetail = {
      ...detail,
      rendererKind: 'legacy-react' as const,
      manifest: null,
    };
    expect(TemplateVersionDetailSchema.parse(legacyDetail)).toEqual(legacyDetail);
    expect(TemplateVersionDetailSchema.safeParse({ ...legacyDetail, manifest: { rendererKind: 'legacy-react' } }).success)
      .toBe(false);
    expect(TemplateVersionDetailSchema.safeParse({ ...detail, rendererKind: 'legacy-react', manifest: validManifest() }).success)
      .toBe(false);
    expect(TemplateVersionDetailSchema.safeParse({ ...detail, rendererKind: 'declarative-v1', manifest: null }).success)
      .toBe(false);

    for (const forbidden of [
      'internalReviewNotes',
      'provenance',
      'sourceUrl',
      'sourceRevision',
      'previewSourcePath',
      'exportSourcePath',
      'sourceHash',
      'assetInventory',
      'unknownField',
    ]) {
      expect(TemplateVersionDetailSchema.safeParse({ ...detail, [forbidden]: 'hidden' }).success).toBe(false);
      expect(TemplateVersionDetailSchema.safeParse({
        ...legacyDetail,
        source: { ...legacyDetail.source, [forbidden]: 'hidden' },
      }).success).toBe(false);
    }

    const historicalVersion = {
      ...detail,
      version: { ...detail.version, version: '9.9.9' },
      thumbnailPath: 'templates/clean-blue/v9.9.9/thumbnail.webp',
      fullPreviewPath: 'templates/clean-blue/v9.9.9/preview.webp',
    };
    expect(TemplateVersionDetailSchema.safeParse(historicalVersion).success).toBe(true);
    expect(
      TemplateVersionDetailSchema.safeParse({
        ...historicalVersion,
        thumbnailPath: 'templates/clean-blue/v1.2.0/thumbnail.webp',
      }).success,
    ).toBe(false);
    expect(
      TemplateVersionDetailSchema.safeParse({
        ...historicalVersion,
        fullPreviewPath: 'templates/clean-blue/v1.2.0/preview.webp',
      }).success,
    ).toBe(false);
  });

  it('discriminates public, local snapshot, and legacy bindings strictly', () => {
    expect(
      TemplateBindingSchema.parse({ kind: 'public', templateSlug: 'clean-blue', versionId: 'version-1', manifestHash: HASH }),
    ).toEqual({ kind: 'public', templateSlug: 'clean-blue', versionId: 'version-1', manifestHash: HASH });
    expect(TemplateBindingSchema.safeParse({ kind: 'local-snapshot', manifestHash: HASH }).success).toBe(true);
    expect(TemplateBindingSchema.safeParse({ kind: 'legacy', templateSlug: 'classic' }).success).toBe(true);
    expect(
      TemplateBindingSchema.safeParse({ kind: 'local-snapshot', localId: 'local-1', manifestHash: HASH }).success,
    ).toBe(false);
    expect(
      TemplateBindingSchema.safeParse({ kind: 'legacy', templateSlug: 'classic', versionId: 'version-1' }).success,
    ).toBe(false);
    expect(TemplateBindingSchema.safeParse({ kind: 'public', templateSlug: 'clean-blue', manifestHash: HASH }).success).toBe(false);
  });

  it('validates snapshots without local identity or source paths', () => {
    const snapshot = {
      rendererKind: 'declarative-v1',
      schemaVersion: 1,
      manifest: validManifest(),
      manifestHash: HASH,
      capabilities: validCapabilities(),
    };
    expect(TemplateSnapshotSchema.safeParse(snapshot).success).toBe(true);
    for (const forbidden of ['localId', 'userId', 'sourceProjectPath']) {
      expect(TemplateSnapshotSchema.safeParse({ ...snapshot, [forbidden]: 'private' }).success).toBe(false);
    }
  });

  it('validates IndexedDB-only local records and import packages', () => {
    const record = {
      userId: 'user-1',
      localId: 'local-1',
      name: 'My template',
      category: 'professional',
      localTags: ['favorite'],
      manifest: validManifest(),
      thumbnail: new Blob([new Uint8Array(1024)], { type: 'image/webp' }),
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    };
    expect(LocalTemplateRecordSchema.safeParse(record).success).toBe(true);

    const exported = {
      formatVersion: 1,
      metadata: {
        name: record.name,
        category: record.category,
        localTags: record.localTags,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      manifest: record.manifest,
      checksum: hashManifest(record.manifest),
    };
    expect(LocalTemplateExportSchema.safeParse(exported).success).toBe(true);
    const checksumMismatch = LocalTemplateExportSchema.safeParse({ ...exported, checksum: HASH });
    expect(checksumMismatch.success).toBe(false);
    if (!checksumMismatch.success) {
      expect(checksumMismatch.error.issues[0]?.path).toEqual(['checksum']);
      expect(checksumMismatch.error.issues[0]?.message).toBe('checksum_mismatch');
      expect(JSON.stringify(checksumMismatch.error.issues)).not.toContain('rendererKind');
    }
    const equivalentManifest = {
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'two-column' },
      typography: { fontFamily: 'noto-sans-sc' },
      colors: { background: '#FFFFFF', accent: '#2563EB', muted: '#666666', text: '#111111' },
      spacing: {},
      sectionSlots: record.manifest.sectionSlots.map(({ sectionType, placement, order }) => ({ order, placement, sectionType })),
      sectionStyles: record.manifest.sectionStyles.map(({ sectionType, element, variant }) => ({ variant, element, sectionType })),
      features: { showAvatar: true, showQrCodes: true },
    };
    expect(
      LocalTemplateExportSchema.safeParse({
        ...exported,
        manifest: equivalentManifest,
        checksum: hashManifest(record.manifest),
      }).success,
    ).toBe(true);
    for (const forbidden of ['userId', 'sections', 'thumbnail']) {
      expect(LocalTemplateExportSchema.safeParse({ ...exported, [forbidden]: 'private' }).success).toBe(false);
    }
    expect(LocalTemplateExportSchema.safeParse({ ...exported, extra: true }).success).toBe(false);
  });

  it('rejects unknown fields recursively', () => {
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), surprise: true }).success).toBe(false);
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        layout: { ...validManifest().layout, surprise: true },
      }).success,
    ).toBe(false);
  });
});

describe('manifest allowlists and quotas', () => {
  it.each(['single-column', 'two-column', 'sidebar'])('accepts the %s layout', (type) => {
    expect(parseTemplateManifest({ ...validManifest(), layout: { ...validManifest().layout, type } }).layout.type).toBe(type);
  });

  it('rejects unsupported layout and style enums', () => {
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), layout: { ...validManifest().layout, type: 'grid' } }).success).toBe(false);
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        sectionStyles: [{ sectionType: 'summary', element: 'heading', variant: 'rainbow' }],
      }).success,
    ).toBe(false);
  });

  it('allows only system style elements, sidebar positions, and slot placements', () => {
    for (const element of ['heading', 'body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr']) {
      expect(
        TemplateManifestV1Schema.safeParse({
          ...validManifest(),
          sectionStyles: [{ sectionType: 'summary', element, variant: 'default' }],
        }).success,
      ).toBe(true);
    }
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        sectionStyles: [{ sectionType: 'summary', element: 'script', variant: 'default' }],
      }).success,
    ).toBe(false);
    for (const sidebarPosition of ['left', 'right']) {
      expect(
        TemplateManifestV1Schema.safeParse({
          ...validManifest(),
          layout: { ...validManifest().layout, sidebarPosition },
        }).success,
      ).toBe(true);
    }
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        layout: { ...validManifest().layout, sidebarPosition: 'top' },
      }).success,
    ).toBe(false);
    for (const placement of ['header', 'main', 'sidebar', 'footer']) {
      expect(
        TemplateManifestV1Schema.safeParse({
          ...validManifest(),
          sectionSlots: [{ sectionType: 'summary', placement, order: 0 }],
        }).success,
      ).toBe(true);
    }
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        sectionSlots: [{ sectionType: 'summary', placement: 'overlay', order: 0 }],
      }).success,
    ).toBe(false);
  });

  it('accepts SECTION_TYPES and rejects unknown section slots', () => {
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        sectionSlots: [{ sectionType: 'custom', placement: 'main', order: 0 }],
      }).success,
    ).toBe(true);
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(),
        sectionSlots: [{ sectionType: 'future_section', placement: 'main', order: 0 }],
      }).success,
    ).toBe(false);
  });

  it('exports immutable, exact manifest and local repository limits', () => {
    expect(MAX_MANIFEST_BYTES).toBe(128 * 1024);
    expect(MAX_SECTION_SLOTS).toBe(32);
    expect(MAX_STYLE_RULES).toBe(256);
    expect(LOCAL_TEMPLATE_MAX_THUMBNAIL_BYTES).toBe(256 * 1024);
    expect(LOCAL_TEMPLATE_MAX_RECORDS).toBe(100);
    expect(LOCAL_TEMPLATE_MAX_ESTIMATED_BYTES).toBe(10 * 1024 * 1024);
  });

  it('accepts collection limits at the boundary and rejects one over', () => {
    const slot = { sectionType: 'summary', placement: 'main', order: 0 } as const;
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), sectionSlots: Array(MAX_SECTION_SLOTS).fill(slot) }).success).toBe(true);
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), sectionSlots: Array(MAX_SECTION_SLOTS + 1).fill(slot) }).success).toBe(false);

    const style = { sectionType: 'summary', element: 'body', variant: 'default' } as const;
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), sectionStyles: Array(MAX_STYLE_RULES).fill(style) }).success).toBe(true);
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), sectionStyles: Array(MAX_STYLE_RULES + 1).fill(style) }).success).toBe(false);
  });

  it('enforces thumbnail bytes at the exact boundary', () => {
    const base = {
      userId: 'user-1', localId: 'local-1', name: 'Local', category: 'clean', localTags: [],
      manifest: validManifest(), createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
    };
    expect(LocalTemplateRecordSchema.safeParse({ ...base, thumbnail: new Blob([new Uint8Array(LOCAL_TEMPLATE_MAX_THUMBNAIL_BYTES)], { type: 'image/png' }) }).success).toBe(true);
    expect(LocalTemplateRecordSchema.safeParse({ ...base, thumbnail: new Blob([new Uint8Array(LOCAL_TEMPLATE_MAX_THUMBNAIL_BYTES + 1)], { type: 'image/png' }) }).success).toBe(false);
  });
});

describe('canonical manifest normalization and hashing', () => {
  it('normalizes omitted defaults before recursively sorting object keys', () => {
    const explicit = validManifest();
    const omitted = {
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'two-column' },
      typography: { fontFamily: 'noto-sans-sc' },
      colors: { background: '#ffffff', accent: '#2563EB', muted: '#666666', text: '#111111' },
      spacing: {},
      sectionSlots: explicit.sectionSlots.map(({ sectionType, placement, order }) => ({ order, placement, sectionType })),
      sectionStyles: explicit.sectionStyles.map(({ sectionType, element, variant }) => ({ variant, element, sectionType })),
      features: { showAvatar: true, showQrCodes: true },
    };

    expect(normalizeManifest(omitted)).toEqual(explicit);
    expect(canonicalizeManifest(omitted)).toBe(canonicalizeManifest(explicit));
    expect(hashManifest(omitted)).toBe(hashManifest(explicit));
    expect(hashManifest(explicit)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('preserves array order and changes the hash for every semantic change', () => {
    const original = validManifest();
    const reordered = { ...original, sectionSlots: [...original.sectionSlots].reverse() };
    const recolored = { ...original, colors: { ...original.colors, accent: '#dc2626' } };
    expect(hashManifest(reordered)).not.toBe(hashManifest(original));
    expect(hashManifest(recolored)).not.toBe(hashManifest(original));
  });
});

describe('security validation', () => {
  it('applies structural security through the public manifest schema and every nested contract', () => {
    const nonPlainManifest = Object.assign(Object.create({ inherited: true }), validManifest());
    const direct = TemplateManifestV1Schema.safeParse(nonPlainManifest);
    expect(direct.success).toBe(false);
    if (!direct.success) expect(direct.error.issues[0]?.message).toBe('json_object_not_plain');
    expect(() => TemplateManifestV1Schema.safeParse(nonPlainManifest)).not.toThrow();
    expect(() => parseTemplateManifest(nonPlainManifest)).toThrow(/json_object_not_plain/);

    const nestedInputs = [
      TemplateSnapshotSchema.safeParse({
        rendererKind: 'declarative-v1', schemaVersion: 1, manifest: nonPlainManifest,
        manifestHash: HASH, capabilities: validCapabilities(),
      }),
      LocalTemplateRecordSchema.safeParse({
        userId: 'user-1', localId: 'local-1', name: 'Local', category: 'clean', localTags: [],
        manifest: nonPlainManifest, thumbnail: new Blob([], { type: 'image/png' }),
        createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
      }),
      LocalTemplateExportSchema.safeParse({
        formatVersion: 1,
        metadata: {
          name: 'Local', category: 'clean', localTags: [],
          createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
        },
        manifest: nonPlainManifest,
        checksum: hashManifest(validManifest()),
      }),
      TemplateVersionDetailSchema.safeParse({
        ...validCatalogItem(),
        version: { id: 'version-1', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z' },
        manifest: nonPlainManifest,
        manifestHash: HASH,
        source: { kind: 'official', license: 'JadeAI-template-license' },
      }),
    ];
    for (const result of nestedInputs) expect(result.success).toBe(false);
  });

  it('reports structural depth and string limits before field parsing without throwing', () => {
    let deep: unknown = 'leaf';
    for (let index = 0; index <= MAX_JSON_DEPTH; index += 1) deep = { child: deep };
    const overDepth = TemplateManifestV1Schema.safeParse({ ...validManifest(), deep });
    expect(overDepth.success).toBe(false);
    if (!overDepth.success) expect(overDepth.error.issues[0]?.message).toBe('json_depth_limit_exceeded');
    expect(() => TemplateManifestV1Schema.safeParse({ ...validManifest(), deep })).not.toThrow();
    expect(() => parseTemplateManifest({ ...validManifest(), deep })).toThrow(/json_depth_limit_exceeded/);

    const overlong = TemplateManifestV1Schema.safeParse({
      ...validManifest(),
      typography: { ...validManifest().typography, fontFamily: 'x'.repeat(MAX_JSON_STRING_BYTES + 1) },
    });
    expect(overlong.success).toBe(false);
    if (!overlong.success) expect(overlong.error.issues[0]?.message).toBe('json_string_too_large');
    expect(() => TemplateManifestV1Schema.safeParse({
      ...validManifest(),
      typography: { ...validManifest().typography, fontFamily: 'x'.repeat(MAX_JSON_STRING_BYTES + 1) },
    })).not.toThrow();
    expect(() => parseTemplateManifest({
      ...validManifest(),
      typography: { ...validManifest().typography, fontFamily: 'x'.repeat(MAX_JSON_STRING_BYTES + 1) },
    })).toThrow(/json_string_too_large/);

    const exportMetadata = {
      name: 'Local', category: 'clean', localTags: [],
      createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
    };
    for (const manifest of [
      { ...validManifest(), deep },
      {
        ...validManifest(),
        typography: { ...validManifest().typography, fontFamily: 'x'.repeat(MAX_JSON_STRING_BYTES + 1) },
      },
    ]) {
      expect(
        LocalTemplateExportSchema.safeParse({
          formatVersion: 1,
          metadata: exportMetadata,
          manifest,
          checksum: HASH,
        }).success,
      ).toBe(false);
    }
  });

  it.each([
    'https://cdn.example.com/template.webp',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '//cdn.example.com/template.webp',
    '/templates/clean-blue/v1/preview.webp',
    '../templates/preview.webp',
    'templates/./preview.webp',
    'templates\\preview.webp',
    'templates/preview.webp?raw=1',
    'templates/preview.webp#top',
  ])('rejects unsafe asset path %s', (thumbnailPath) => {
    expect(TemplateCatalogItemSchema.safeParse({ ...validCatalogItem(), thumbnailPath }).success).toBe(false);
  });

  it('requires strict item slugs and matching slug/version asset directories', () => {
    for (const slug of ['---', '-bad-', 'bad--slug']) {
      expect(TemplateCatalogItemSchema.safeParse({ ...validCatalogItem(), slug }).success).toBe(false);
    }
    expect(
      TemplateCatalogItemSchema.safeParse({
        ...validCatalogItem(),
        thumbnailPath: 'templates/other-template/v1.2.0/thumbnail.webp',
      }).success,
    ).toBe(false);
    expect(
      TemplateCatalogItemSchema.safeParse({
        ...validCatalogItem(),
        fullPreviewPath: 'templates/clean-blue/v9.9.9/preview.webp',
      }).success,
    ).toBe(false);
  });

  it('rejects external fonts/scripts and raw HTML/CSS/JS fields', () => {
    expect(
      TemplateManifestV1Schema.safeParse({
        ...validManifest(), typography: { ...validManifest().typography, fontFamily: 'https://fonts.example/font.woff2' },
      }).success,
    ).toBe(false);
    for (const payload of [
      { rawHtml: '<iframe src="https://example.com"></iframe>' },
      { customCss: 'body { background: url(https://example.com/x); }' },
      { script: 'alert(document.cookie)' },
      { onClick: 'runCode()' },
    ]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), features: { ...validManifest().features, ...payload } }).success).toBe(false);
    }
  });

  it('rejects CSS color syntax and out-of-range numbers', () => {
    for (const accent of ['#FFF', 'rgb(0,0,0)', 'var(--accent)', 'url(x)', '#gggggg', '#ffffff;display:none']) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), colors: { ...validManifest().colors, accent } }).success).toBe(false);
    }
    for (const layout of [
      { ...validManifest().layout, sidebarWidthPercent: 9 },
      { ...validManifest().layout, sidebarWidthPercent: 61 },
      { ...validManifest().layout, columnGapMm: 25 },
    ]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), layout }).success).toBe(false);
    }
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), typography: { ...validManifest().typography, baseFontSizePt: 30 } }).success).toBe(false);
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), spacing: { ...validManifest().spacing, pageMarginMm: 50 } }).success).toBe(false);
    expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), features: { ...validManifest().features, maxPages: 21 } }).success).toBe(false);
  });

  it('accepts every chosen numeric bound exactly', () => {
    for (const sidebarWidthPercent of [10, 60]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), layout: { ...validManifest().layout, sidebarWidthPercent } }).success).toBe(true);
    }
    for (const columnGapMm of [0, 24]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), layout: { ...validManifest().layout, columnGapMm } }).success).toBe(true);
    }
    for (const baseFontSizePt of [8, 18]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), typography: { ...validManifest().typography, baseFontSizePt } }).success).toBe(true);
    }
    for (const lineHeight of [1, 2]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), typography: { ...validManifest().typography, lineHeight } }).success).toBe(true);
    }
    for (const headingScale of [1, 2]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), typography: { ...validManifest().typography, headingScale } }).success).toBe(true);
    }
    for (const pageMarginMm of [5, 30]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), spacing: { ...validManifest().spacing, pageMarginMm } }).success).toBe(true);
    }
    for (const sectionGapMm of [0, 20]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), spacing: { ...validManifest().spacing, sectionGapMm } }).success).toBe(true);
    }
    for (const maxPages of [1, 20]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), features: { ...validManifest().features, maxPages } }).success).toBe(true);
    }
    for (const order of [0, MAX_SECTION_SLOTS - 1]) {
      expect(
        TemplateManifestV1Schema.safeParse({
          ...validManifest(),
          sectionSlots: [{ sectionType: 'summary', placement: 'main', order }],
        }).success,
      ).toBe(true);
    }
  });

  it('rejects values immediately outside heading scale and slot order bounds', () => {
    for (const headingScale of [0.99, 2.01]) {
      expect(TemplateManifestV1Schema.safeParse({ ...validManifest(), typography: { ...validManifest().typography, headingScale } }).success).toBe(false);
    }
    for (const order of [-1, MAX_SECTION_SLOTS]) {
      expect(
        TemplateManifestV1Schema.safeParse({
          ...validManifest(),
          sectionSlots: [{ sectionType: 'summary', placement: 'main', order }],
        }).success,
      ).toBe(false);
    }
  });

  it('enforces canonical manifest bytes at and above the boundary', () => {
    expect(() => assertCanonicalManifestSize('x'.repeat(MAX_MANIFEST_BYTES))).not.toThrow();
    expect(() => assertCanonicalManifestSize('x'.repeat(MAX_MANIFEST_BYTES + 1))).toThrow(/manifest_too_large/);
  });

  it('exports and enforces JSON depth, node, string-byte, and array limits', () => {
    expect(MAX_JSON_DEPTH).toBe(12);
    expect(MAX_JSON_NODES).toBe(4096);
    expect(MAX_JSON_STRING_BYTES).toBe(8 * 1024);
    expect(MAX_JSON_ARRAY_LENGTH).toBe(256);

    let atDepth: unknown = 'leaf';
    for (let i = 0; i < MAX_JSON_DEPTH; i += 1) atDepth = { child: atDepth };
    expect(validateJsonStructure(atDepth).success).toBe(true);
    expect(validateJsonStructure({ child: atDepth }).success).toBe(false);
    expect(validateJsonStructure('x'.repeat(MAX_JSON_STRING_BYTES)).success).toBe(true);
    expect(validateJsonStructure('x'.repeat(MAX_JSON_STRING_BYTES + 1)).success).toBe(false);
    expect(validateJsonStructure(Array(MAX_JSON_ARRAY_LENGTH).fill(null)).success).toBe(true);
    expect(validateJsonStructure(Array(MAX_JSON_ARRAY_LENGTH + 1).fill(null)).success).toBe(false);
    expect(validateJsonStructure({ invalidNumber: Number.NaN }).success).toBe(false);
    const atNodeLimit = Object.fromEntries(Array.from({ length: MAX_JSON_NODES - 1 }, (_, index) => [`key${index}`, null]));
    const overNodeLimit = { ...atNodeLimit, overflow: null };
    expect(validateJsonStructure(atNodeLimit).success).toBe(true);
    expect(validateJsonStructure(overNodeLimit).success).toBe(false);
  });

  it('returns stable field-level issues without echoing the manifest', () => {
    const secret = 'DO_NOT_ECHO_THIS_MANIFEST';
    const result = validateJsonStructure({ safe: { deep: secret.repeat(MAX_JSON_STRING_BYTES) } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['safe', 'deep']);
      expect(result.error.issues[0]?.message).toMatch(/string_too_large/);
      expect(JSON.stringify(result.error.issues)).not.toContain(secret);
    }
  });
});
