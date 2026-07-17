import { z } from 'zod/v4';

import { SECTION_TYPES, TEMPLATES } from '@/lib/constants';

import {
  MAX_JSON_ARRAY_LENGTH,
  MAX_JSON_DEPTH,
  MAX_JSON_NODES,
  MAX_JSON_STRING_BYTES,
  MAX_MANIFEST_BYTES,
  VersionedStaticAssetPathSchema,
  canonicalizeJson,
  validateJsonStructure,
} from './security';

export {
  MAX_JSON_ARRAY_LENGTH,
  MAX_JSON_DEPTH,
  MAX_JSON_NODES,
  MAX_JSON_STRING_BYTES,
  MAX_MANIFEST_BYTES,
};

export const MAX_SECTION_SLOTS = 32;
export const MAX_STYLE_RULES = 256;
export const LOCAL_TEMPLATE_MAX_THUMBNAIL_BYTES = 256 * 1024;
export const LOCAL_TEMPLATE_MAX_RECORDS = 100;
export const LOCAL_TEMPLATE_MAX_ESTIMATED_BYTES = 10 * 1024 * 1024;

export const MIN_SIDEBAR_WIDTH_PERCENT = 10;
export const MAX_SIDEBAR_WIDTH_PERCENT = 60;
export const MAX_COLUMN_GAP_MM = 24;
export const MIN_FONT_SIZE_PT = 8;
export const MAX_FONT_SIZE_PT = 18;
export const MIN_LINE_HEIGHT = 1;
export const MAX_LINE_HEIGHT = 2;
export const MIN_PAGE_MARGIN_MM = 5;
export const MAX_PAGE_MARGIN_MM = 30;
export const MAX_SECTION_GAP_MM = 20;
export const MAX_DOCUMENT_PAGES = 20;

const SlugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const IdSchema = z.string().min(1).max(128);
const NameSchema = z.string().trim().min(1).max(120);
const SemverSchema = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const ManifestHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((color) => color.toLowerCase());

export const TEMPLATE_FONT_FAMILIES = ['noto-sans-sc'] as const;

export const TemplateCategorySchema = z.strictObject({
  id: IdSchema,
  slug: SlugSchema,
  nameZh: NameSchema,
  nameEn: NameSchema,
  sortOrder: z.number().int().min(0).max(10_000),
});

export const TemplateTagSchema = z.strictObject({
  id: IdSchema,
  slug: SlugSchema,
  dimension: z.enum(['layout', 'style', 'scenario', 'capability', 'paper', 'source', 'export']),
  nameZh: NameSchema,
  nameEn: NameSchema,
});

export const TemplateCapabilitySchema = z.strictObject({
  supportedSections: z.array(z.enum(SECTION_TYPES)).max(SECTION_TYPES.length),
  paperSizes: z.array(z.enum(['a4', 'letter'])).min(1).max(2),
  supportsAvatar: z.boolean(),
  atsCompatible: z.boolean(),
  supportsZh: z.boolean(),
  supportsEn: z.boolean(),
  supportsHtml: z.boolean(),
  supportsPdf: z.boolean(),
  docxFidelity: z.enum(['unsupported', 'generic', 'high-fidelity']),
});

const TemplateCatalogItemShape = {
  slug: SlugSchema,
  stableVersion: SemverSchema,
  nameZh: NameSchema,
  nameEn: NameSchema,
  category: TemplateCategorySchema,
  tags: z.array(TemplateTagSchema).max(32),
  thumbnailPath: VersionedStaticAssetPathSchema,
  fullPreviewPath: VersionedStaticAssetPathSchema,
  capabilities: TemplateCapabilitySchema,
  favorite: z.boolean(),
};

type CatalogAssetOwner = {
  slug: string;
  stableVersion: string;
  thumbnailPath: string;
  fullPreviewPath: string;
};

function validateCatalogAssetOwnership(
  item: CatalogAssetOwner,
  assetVersion: string,
  context: z.RefinementCtx,
): void {
  const expectedPrefix = `templates/${item.slug}/v${assetVersion}/`;
  for (const field of ['thumbnailPath', 'fullPreviewPath'] as const) {
    if (!item[field].startsWith(expectedPrefix)) {
      context.addIssue({ code: 'custom', path: [field], message: 'asset_path_owner_mismatch' });
    }
  }
}

export const TemplateCatalogItemSchema = z
  .strictObject(TemplateCatalogItemShape)
  .superRefine((item, context) => validateCatalogAssetOwnership(item, item.stableVersion, context));

const TemplateLayoutSchema = z.strictObject({
  type: z.enum(['single-column', 'two-column', 'sidebar']),
  sidebarPosition: z.enum(['left', 'right']).default('left'),
  sidebarWidthPercent: z.number().min(MIN_SIDEBAR_WIDTH_PERCENT).max(MAX_SIDEBAR_WIDTH_PERCENT).default(32),
  columnGapMm: z.number().min(0).max(MAX_COLUMN_GAP_MM).default(8),
});

const TemplateTypographySchema = z.strictObject({
  fontFamily: z.enum(TEMPLATE_FONT_FAMILIES),
  baseFontSizePt: z.number().min(MIN_FONT_SIZE_PT).max(MAX_FONT_SIZE_PT).default(10.5),
  lineHeight: z.number().min(MIN_LINE_HEIGHT).max(MAX_LINE_HEIGHT).default(1.5),
  headingScale: z.number().min(1).max(2).default(1.25),
});

const TemplateColorsSchema = z.strictObject({
  text: ColorSchema,
  muted: ColorSchema,
  accent: ColorSchema,
  background: ColorSchema,
});

const TemplateSpacingSchema = z.strictObject({
  pageMarginMm: z.number().min(MIN_PAGE_MARGIN_MM).max(MAX_PAGE_MARGIN_MM).default(12),
  sectionGapMm: z.number().min(0).max(MAX_SECTION_GAP_MM).default(6),
});

const SectionSlotSchema = z.strictObject({
  sectionType: z.enum(SECTION_TYPES),
  placement: z.enum(['header', 'main', 'sidebar', 'footer']),
  order: z.number().int().min(0).max(MAX_SECTION_SLOTS - 1),
});

const SectionStyleSchema = z.strictObject({
  sectionType: z.enum(SECTION_TYPES),
  element: z.enum(['heading', 'body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr']),
  variant: z.enum(['default', 'compact', 'accent', 'muted', 'bordered']),
});

const TemplateFeaturesSchema = z.strictObject({
  showAvatar: z.boolean().default(true),
  showQrCodes: z.boolean().default(true),
  showPageNumbers: z.boolean().default(false),
  maxPages: z.number().int().min(1).max(MAX_DOCUMENT_PAGES).default(4),
});

const TemplateManifestV1BaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rendererKind: z.literal('declarative-v1'),
  layout: TemplateLayoutSchema,
  typography: TemplateTypographySchema,
  colors: TemplateColorsSchema,
  spacing: TemplateSpacingSchema,
  sectionSlots: z.array(SectionSlotSchema).max(MAX_SECTION_SLOTS),
  sectionStyles: z.array(SectionStyleSchema).max(MAX_STYLE_RULES),
  features: TemplateFeaturesSchema,
});

export const TemplateManifestV1Schema = z
  .preprocess((input, context) => {
    const structure = validateJsonStructure(input);
    if (structure.success) return input;
    for (const issue of structure.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
    return z.NEVER;
  }, TemplateManifestV1BaseSchema)
  .superRefine((manifest, context) => {
    const canonicalJson = canonicalizeJson(manifest);
    if (new TextEncoder().encode(canonicalJson).byteLength > MAX_MANIFEST_BYTES) {
      context.addIssue({ code: 'custom', message: 'manifest_too_large' });
    }
  });

const TemplateVersionSchema = z.strictObject({
  id: IdSchema,
  version: SemverSchema,
  publishedAt: IsoDateTimeSchema,
});

const PublicTemplateSourceSchema = z.strictObject({
  kind: z.enum(['official', 'community']),
  license: z.string().trim().min(1).max(120),
});

const TemplateVersionDetailSharedShape = {
  ...TemplateCatalogItemShape,
  version: TemplateVersionSchema,
  manifestHash: ManifestHashSchema,
  source: PublicTemplateSourceSchema,
};

export const TemplateVersionDetailSchema = z.discriminatedUnion('rendererKind', [
  z.strictObject({
    ...TemplateVersionDetailSharedShape,
    rendererKind: z.literal('declarative-v1'),
    manifest: TemplateManifestV1Schema,
  }),
  z.strictObject({
    ...TemplateVersionDetailSharedShape,
    rendererKind: z.literal('legacy-react'),
    manifest: z.null(),
  }),
]).superRefine((item, context) => validateCatalogAssetOwnership(item, item.version.version, context));

export const TemplateBindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('public'),
    templateSlug: SlugSchema,
    versionId: IdSchema,
    manifestHash: ManifestHashSchema,
  }),
  z.strictObject({
    kind: z.literal('local-snapshot'),
    manifestHash: ManifestHashSchema,
  }),
  z.strictObject({
    kind: z.literal('legacy'),
    templateSlug: z.enum(TEMPLATES),
  }),
]);

export const TemplateSnapshotSchema = z.strictObject({
  rendererKind: z.literal('declarative-v1'),
  schemaVersion: z.literal(1),
  manifest: TemplateManifestV1Schema,
  manifestHash: ManifestHashSchema,
  capabilities: TemplateCapabilitySchema,
});

const ThumbnailBlobSchema = z
  .instanceof(Blob)
  .refine((blob) => ['image/png', 'image/jpeg', 'image/webp'].includes(blob.type), { error: 'unsupported_thumbnail_type' })
  .refine((blob) => blob.size <= LOCAL_TEMPLATE_MAX_THUMBNAIL_BYTES, { error: 'thumbnail_too_large' });

const LocalTemplateMetadataSchema = z.strictObject({
  name: NameSchema,
  category: SlugSchema,
  localTags: z.array(z.string().trim().min(1).max(40)).max(32),
  sourceDescription: z.string().trim().max(500).default(''),
  templateVersion: SemverSchema.default('1.0.0'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const LocalTemplateRecordSchema = LocalTemplateMetadataSchema.extend({
  userId: IdSchema,
  localId: IdSchema,
  manifest: TemplateManifestV1Schema,
  thumbnail: ThumbnailBlobSchema,
});

export const LocalTemplateExportRawSchema = z.strictObject({
  formatVersion: z.literal(1),
  metadata: LocalTemplateMetadataSchema,
  manifest: TemplateManifestV1Schema,
  checksum: ManifestHashSchema,
});

export function parseTemplateManifest(input: unknown): z.output<typeof TemplateManifestV1Schema> {
  return TemplateManifestV1Schema.parse(input);
}
