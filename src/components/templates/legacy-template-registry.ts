import type { ComponentType } from 'react';

import type { Resume } from '@/types/resume';

export type LegacyTemplateAdapter = ComponentType<{ resume: Resume }>;

const legacyTemplateLoaders: Record<string, () => Promise<LegacyTemplateAdapter>> = {
  classic: async () => (await import('../preview/templates/classic')).ClassicTemplate,
  modern: async () => (await import('../preview/templates/modern')).ModernTemplate,
  minimal: async () => (await import('../preview/templates/minimal')).MinimalTemplate,
  professional: async () => (await import('../preview/templates/professional')).ProfessionalTemplate,
  'two-column': async () => (await import('../preview/templates/two-column')).TwoColumnTemplate,
  creative: async () => (await import('../preview/templates/creative')).CreativeTemplate,
  ats: async () => (await import('../preview/templates/ats')).AtsTemplate,
  academic: async () => (await import('../preview/templates/academic')).AcademicTemplate,
  elegant: async () => (await import('../preview/templates/elegant')).ElegantTemplate,
  executive: async () => (await import('../preview/templates/executive')).ExecutiveTemplate,
  developer: async () => (await import('../preview/templates/developer')).DeveloperTemplate,
  designer: async () => (await import('../preview/templates/designer')).DesignerTemplate,
  startup: async () => (await import('../preview/templates/startup')).StartupTemplate,
  formal: async () => (await import('../preview/templates/formal')).FormalTemplate,
  infographic: async () => (await import('../preview/templates/infographic')).InfographicTemplate,
  compact: async () => (await import('../preview/templates/compact')).CompactTemplate,
  euro: async () => (await import('../preview/templates/euro')).EuroTemplate,
  clean: async () => (await import('../preview/templates/clean')).CleanTemplate,
  bold: async () => (await import('../preview/templates/bold')).BoldTemplate,
  timeline: async () => (await import('../preview/templates/timeline')).TimelineTemplate,
  nordic: async () => (await import('../preview/templates/nordic')).NordicTemplate,
  corporate: async () => (await import('../preview/templates/corporate')).CorporateTemplate,
  consultant: async () => (await import('../preview/templates/consultant')).ConsultantTemplate,
  finance: async () => (await import('../preview/templates/finance')).FinanceTemplate,
  medical: async () => (await import('../preview/templates/medical')).MedicalTemplate,
  gradient: async () => (await import('../preview/templates/gradient')).GradientTemplate,
  metro: async () => (await import('../preview/templates/metro')).MetroTemplate,
  material: async () => (await import('../preview/templates/material')).MaterialTemplate,
  coder: async () => (await import('../preview/templates/coder')).CoderTemplate,
  blocks: async () => (await import('../preview/templates/blocks')).BlocksTemplate,
  magazine: async () => (await import('../preview/templates/magazine')).MagazineTemplate,
  artistic: async () => (await import('../preview/templates/artistic')).ArtisticTemplate,
  retro: async () => (await import('../preview/templates/retro')).RetroTemplate,
  neon: async () => (await import('../preview/templates/neon')).NeonTemplate,
  watercolor: async () => (await import('../preview/templates/watercolor')).WatercolorTemplate,
  swiss: async () => (await import('../preview/templates/swiss')).SwissTemplate,
  japanese: async () => (await import('../preview/templates/japanese')).JapaneseTemplate,
  berlin: async () => (await import('../preview/templates/berlin')).BerlinTemplate,
  luxe: async () => (await import('../preview/templates/luxe')).LuxeTemplate,
  rose: async () => (await import('../preview/templates/rose')).RoseTemplate,
  architect: async () => (await import('../preview/templates/architect')).ArchitectTemplate,
  legal: async () => (await import('../preview/templates/legal')).LegalTemplate,
  teacher: async () => (await import('../preview/templates/teacher')).TeacherTemplate,
  scientist: async () => (await import('../preview/templates/scientist')).ScientistTemplate,
  engineer: async () => (await import('../preview/templates/engineer')).EngineerTemplate,
  sidebar: async () => (await import('../preview/templates/sidebar')).SidebarTemplate,
  card: async () => (await import('../preview/templates/card')).CardTemplate,
  zigzag: async () => (await import('../preview/templates/zigzag')).ZigzagTemplate,
  ribbon: async () => (await import('../preview/templates/ribbon')).RibbonTemplate,
  mosaic: async () => (await import('../preview/templates/mosaic')).MosaicTemplate,
};

export async function loadLegacyTemplateAdapter(slug: string): Promise<LegacyTemplateAdapter> {
  const load = legacyTemplateLoaders[slug];
  if (!load) throw new Error('unknown_legacy_template');
  return load();
}

export function isKnownLegacyTemplate(slug: string): boolean {
  return Object.hasOwn(legacyTemplateLoaders, slug);
}
