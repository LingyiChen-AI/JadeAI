import { z } from 'zod';
import { TEMPLATES } from '@/lib/constants';
import { normalizeSections } from '@/lib/resume/normalize-content';
import { PDF_LAYOUTS } from './layout';

export const MAX_PDF_SNAPSHOT_BYTES = 2 * 1024 * 1024;

// Text may contain code or literal markup. Templates escape it with esc()/md();
// structure, URLs, images and CSS values are validated separately below.
const text = z.string().max(30_000).refine(
  value => !value.includes('\u0000'),
  'Null characters are not supported in PDF snapshots',
);
const shortText = text.pipe(z.string().max(500));
const id = z.string().min(1).max(200);
const optionalText = text.optional();
const list = z.union([z.array(text).max(200), text]).optional();
const link = shortText.refine(value => {
  if (!value || !/^[a-z][a-z\d+.-]*:/i.test(value.trim())) return true;
  return /^(https?:|mailto:|tel:)/i.test(value.trim());
}, 'Unsupported link protocol');
// The editor uploads resized raster data URLs. Do not fetch client-supplied hosts.
const avatar = z.string().max(1_500_000).refine(
  value => value === '' || /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z\d+/]+={0,2}$/i.test(value),
  'Avatar must be an embedded raster image',
);
const itemId = { id: id.optional() };
const items = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item).max(200) });
const contentSchemas = {
  personal_info: z.strictObject({
    fullName: optionalText, jobTitle: optionalText, age: optionalText, gender: optionalText,
    politicalStatus: optionalText, ethnicity: optionalText, hometown: optionalText,
    maritalStatus: optionalText, yearsOfExperience: optionalText, educationLevel: optionalText,
    email: optionalText, phone: optionalText, wechat: optionalText, location: optionalText,
    website: link.optional(), linkedin: link.optional(), github: link.optional(), avatar: avatar.optional(),
    customLinks: z.array(z.strictObject({ label: shortText, url: link })).max(30).optional(),
  }),
  summary: z.strictObject({ text }),
  work_experience: items(z.strictObject({
    ...itemId, company: optionalText, position: optionalText, location: optionalText,
    startDate: optionalText, endDate: text.nullable().optional(), current: z.boolean().optional(),
    description: optionalText, technologies: list, highlights: list,
  })),
  education: items(z.strictObject({
    ...itemId, institution: optionalText, degree: optionalText, field: optionalText,
    location: optionalText, startDate: optionalText, endDate: optionalText, gpa: optionalText, highlights: list,
  })),
  skills: z.strictObject({ categories: z.array(z.strictObject({
    ...itemId, name: optionalText, skills: list,
  })).max(100) }),
  projects: items(z.strictObject({
    ...itemId, name: optionalText, url: link.optional(), startDate: optionalText, endDate: optionalText,
    description: optionalText, technologies: list, highlights: list,
  })),
  certifications: items(z.strictObject({
    ...itemId, name: optionalText, issuer: optionalText, date: optionalText, url: link.optional(),
  })),
  languages: items(z.strictObject({
    ...itemId, language: optionalText, proficiency: optionalText, description: optionalText,
  })),
  github: items(z.strictObject({
    ...itemId, repoUrl: link.optional(), name: optionalText, stars: z.number().int().min(0).max(1e9).optional(),
    language: optionalText, description: optionalText,
  })),
  qr_codes: items(z.strictObject({ ...itemId, label: shortText, url: link })),
  custom: items(z.strictObject({
    ...itemId, title: optionalText, subtitle: optionalText, date: optionalText, description: optionalText,
  })),
};

const sectionBase = { id, title: shortText, sortOrder: z.number().int().min(0).max(1000), visible: z.boolean() };
const section = z.discriminatedUnion('type', [
  z.strictObject({ ...sectionBase, type: z.literal('personal_info'), content: contentSchemas.personal_info }),
  z.strictObject({ ...sectionBase, type: z.literal('summary'), content: contentSchemas.summary }),
  z.strictObject({ ...sectionBase, type: z.literal('work_experience'), content: contentSchemas.work_experience }),
  z.strictObject({ ...sectionBase, type: z.literal('education'), content: contentSchemas.education }),
  z.strictObject({ ...sectionBase, type: z.literal('skills'), content: contentSchemas.skills }),
  z.strictObject({ ...sectionBase, type: z.literal('projects'), content: contentSchemas.projects }),
  z.strictObject({ ...sectionBase, type: z.literal('certifications'), content: contentSchemas.certifications }),
  z.strictObject({ ...sectionBase, type: z.literal('languages'), content: contentSchemas.languages }),
  z.strictObject({ ...sectionBase, type: z.literal('github'), content: contentSchemas.github }),
  z.strictObject({ ...sectionBase, type: z.literal('qr_codes'), content: contentSchemas.qr_codes }),
  z.strictObject({ ...sectionBase, type: z.literal('custom'), content: contentSchemas.custom }),
]);

const color = z.string().regex(/^#[a-f\d]{6}$/i);
const margin = z.number().min(0).max(60);
const theme = z.strictObject({
  primaryColor: color.optional(), accentColor: color.optional(),
  fontFamily: z.enum(['Inter', 'Georgia', 'Helvetica', 'Arial', 'Palatino', 'Verdana',
    'Times New Roman', 'Garamond', 'Courier New']).optional(),
  fontSize: z.enum(['small', 'medium', 'large']).optional(),
  lineSpacing: z.number().min(1).max(2.5).optional(),
  margin: z.strictObject({ top: margin, right: margin, bottom: margin, left: margin }).optional(),
  sectionSpacing: z.number().min(0).max(32).optional(),
  avatarStyle: z.enum(['circle', 'oneInch']).optional(),
});

export const pdfSnapshotRequestSchema = z.strictObject({
  format: z.literal('pdf'), layout: z.enum(PDF_LAYOUTS).default('a4'),
  resume: z.strictObject({
    title: shortText, language: z.enum(['zh', 'en']), template: z.enum(TEMPLATES),
    themeConfig: theme.nullable(),
    sections: z.array(section).max(50).superRefine((sections, ctx) => {
      if (new Set(sections.map(s => s.id)).size !== sections.length) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate section IDs' });
      }
      if (new Set(sections.map(s => s.sortOrder)).size !== sections.length) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate section order' });
      }
    }),
  }),
}).transform(value => ({
  ...value,
  resume: { ...value.resume, sections: normalizeSections([...value.resume.sections].sort((a, b) => a.sortOrder - b.sortOrder)) },
}));
