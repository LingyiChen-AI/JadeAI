import type { z } from 'zod/v4';

import type {
  LocalTemplateExportRawSchema,
  LocalTemplateRecordSchema,
  TemplateBindingSchema,
  TemplateCapabilitySchema,
  TemplateCatalogItemSchema,
  TemplateCategorySchema,
  TemplateManifestV1Schema,
  TemplateSnapshotSchema,
  TemplateTagSchema,
  TemplateVersionDetailSchema,
} from '@/lib/templates/schema';

export type TemplateCategory = z.output<typeof TemplateCategorySchema>;
export type TemplateTag = z.output<typeof TemplateTagSchema>;
export type TemplateTagDimension = TemplateTag['dimension'];
export type TemplateCapability = z.output<typeof TemplateCapabilitySchema>;
export type TemplateCatalogItem = z.output<typeof TemplateCatalogItemSchema>;
export type TemplateManifestV1 = z.output<typeof TemplateManifestV1Schema>;
export type TemplateVersionDetail = z.output<typeof TemplateVersionDetailSchema>;
export type DeclarativeTemplateVersionDetail = Extract<TemplateVersionDetail, { rendererKind: 'declarative-v1' }>;
export type LegacyTemplateVersionDetail = Extract<TemplateVersionDetail, { rendererKind: 'legacy-react' }>;
export type TemplateBinding = z.output<typeof TemplateBindingSchema>;
export type TemplateSnapshot = z.output<typeof TemplateSnapshotSchema>;
export type LocalTemplateRecord = z.output<typeof LocalTemplateRecordSchema>;
export type LocalTemplateExport = z.output<typeof LocalTemplateExportRawSchema>;

export type TemplateLayoutType = TemplateManifestV1['layout']['type'];
export type TemplateSidebarPosition = TemplateManifestV1['layout']['sidebarPosition'];
export type TemplateSlotPlacement = TemplateManifestV1['sectionSlots'][number]['placement'];
export type TemplateStyleElement = TemplateManifestV1['sectionStyles'][number]['element'];
export type TemplateStyleVariant = TemplateManifestV1['sectionStyles'][number]['variant'];
export type TemplateFontFamily = TemplateManifestV1['typography']['fontFamily'];
