export const APP_NAME = '小逆offer';

export const SECTION_TYPES = [
  'personal_info',
  'summary',
  'work_experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'github',
  'qr_codes',
  'custom',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const DEFAULT_SECTIONS: { type: SectionType; titleZh: string; titleEn: string }[] = [
  { type: 'personal_info', titleZh: '个人信息', titleEn: 'Personal Info' },
  { type: 'summary', titleZh: '个人简介', titleEn: 'Summary' },
  { type: 'work_experience', titleZh: '工作经历', titleEn: 'Work Experience' },
  { type: 'education', titleZh: '教育背景', titleEn: 'Education' },
  { type: 'skills', titleZh: '技能特长', titleEn: 'Skills' },
  { type: 'qr_codes', titleZh: '二维码', titleEn: 'QR Codes' },
];

export const TEMPLATES = [
  'classic', 'modern', 'minimal', 'professional', 'two-column', 'creative', 'ats', 'academic', 'elegant', 'executive',
  'developer', 'designer', 'startup', 'formal', 'infographic', 'compact', 'euro', 'clean', 'bold', 'timeline',
  // Batch 1: Industry/Professional
  'nordic', 'corporate', 'consultant', 'finance', 'medical',
  // Batch 2: Modern/Tech
  'gradient', 'metro', 'material', 'coder', 'blocks',
  // Batch 3: Creative/Artistic
  'magazine', 'artistic', 'retro', 'neon', 'watercolor',
  // Batch 4: Style/Culture
  'swiss', 'japanese', 'berlin', 'luxe', 'rose',
  // Batch 5: Specialized
  'architect', 'legal', 'teacher', 'scientist', 'engineer',
  // Batch 6: Layout Variants
  'sidebar', 'card', 'zigzag', 'ribbon', 'mosaic',
] as const;
export type Template = (typeof TEMPLATES)[number];

/** Templates with full-bleed background headers — no outer padding needed */
export const BACKGROUND_TEMPLATES: ReadonlySet<string> = new Set([
  'modern', 'creative', 'two-column', 'executive', 'developer',
  'designer', 'startup', 'infographic', 'compact', 'bold',
  'corporate', 'finance', 'gradient', 'material', 'coder',
  'artistic', 'neon', 'berlin', 'engineer', 'sidebar', 'ribbon',
]);

/** Two-column templates with dark sidebar — sidebar bg + width for QR bar continuity */
export const TWO_COLUMN_TEMPLATES: Record<string, { bg: string; width: string }> = {
  'two-column': { bg: '#16213e', width: '35%' },
  sidebar:      { bg: '#1e40af', width: '35%' },
  coder:        { bg: '#0d1117', width: '32%' },
};

export const AUTOSAVE_DELAY = 500;
export const MAX_UNDO_STACK = 50;
