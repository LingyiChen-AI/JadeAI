import type { TemplateManifestV1 } from '@/types/template';

import { TemplateManifestV1Schema } from './schema';

export type LocalTemplatePresetId = 'ats-clean' | 'modern-two-column' | 'compact-professional';

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type LocalTemplatePreset = DeepReadonly<{
  id: LocalTemplatePresetId;
  labelKey: string;
  descriptionKey: string;
}>;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function createSectionSlots(): TemplateManifestV1['sectionSlots'] {
  return [
    { sectionType: 'personal_info', placement: 'header', order: 0 },
    { sectionType: 'summary', placement: 'main', order: 1 },
    { sectionType: 'work_experience', placement: 'main', order: 2 },
    { sectionType: 'education', placement: 'main', order: 3 },
    { sectionType: 'skills', placement: 'sidebar', order: 4 },
    { sectionType: 'projects', placement: 'main', order: 5 },
    { sectionType: 'qr_codes', placement: 'footer', order: 6 },
  ];
}

const shared = (manifest: Omit<TemplateManifestV1, 'sectionSlots'>): TemplateManifestV1 => ({
  ...manifest,
  sectionSlots: createSectionSlots(),
});

const PRESET_MANIFESTS = deepFreeze<Record<LocalTemplatePresetId, TemplateManifestV1>>({
  'ats-clean': shared({
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
      typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
      colors: { text: '#18181b', muted: '#71717a', accent: '#2563eb', background: '#ffffff' },
      spacing: { pageMarginMm: 12, sectionGapMm: 6 },
      sectionStyles: [{ sectionType: 'summary', element: 'heading', variant: 'accent' }],
      features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  }),
  'modern-two-column': shared({
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'two-column', sidebarPosition: 'left', sidebarWidthPercent: 35, columnGapMm: 12 },
      typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.45, headingScale: 1.35 },
      colors: { text: '#172033', muted: '#64748b', accent: '#0f766e', background: '#f8fafc' },
      spacing: { pageMarginMm: 10, sectionGapMm: 8 },
      sectionStyles: [{ sectionType: 'work_experience', element: 'heading', variant: 'bordered' }],
      features: { showAvatar: true, showQrCodes: true, showPageNumbers: true, maxPages: 4 },
  }),
  'compact-professional': shared({
      schemaVersion: 1,
      rendererKind: 'declarative-v1',
      layout: { type: 'single-column', sidebarPosition: 'right', sidebarWidthPercent: 28, columnGapMm: 6 },
      typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 9, lineHeight: 1.2, headingScale: 1.15 },
      colors: { text: '#111827', muted: '#6b7280', accent: '#b45309', background: '#fffdf7' },
      spacing: { pageMarginMm: 8, sectionGapMm: 3 },
      sectionStyles: [{ sectionType: 'summary', element: 'heading', variant: 'compact' }],
      features: { showAvatar: false, showQrCodes: false, showPageNumbers: true, maxPages: 2 },
  }),
});

export const LOCAL_TEMPLATE_PRESETS: readonly LocalTemplatePreset[] = deepFreeze([
  { id: 'ats-clean', labelKey: 'presets.atsClean', descriptionKey: 'presets.atsCleanDescription' },
  { id: 'modern-two-column', labelKey: 'presets.modernTwoColumn', descriptionKey: 'presets.modernTwoColumnDescription' },
  {
    id: 'compact-professional',
    labelKey: 'presets.compactProfessional',
    descriptionKey: 'presets.compactProfessionalDescription',
  },
]);

export function createLocalTemplatePreset(id: LocalTemplatePresetId): TemplateManifestV1 {
  return TemplateManifestV1Schema.parse(structuredClone(PRESET_MANIFESTS[id]));
}
