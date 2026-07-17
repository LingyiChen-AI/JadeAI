import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { BACKGROUND_TEMPLATES } from '@/lib/constants';
import type {
  PersonalInfoContent,
  SkillsContent,
  SummaryContent,
} from '@/types/resume';
import { renderRichTextHostHtml } from '@/lib/resume/rich-text';
import { resolveExportFont } from '@/lib/export/font-registry';

export type ResumeWithSections = NonNullable<Awaited<ReturnType<typeof resumeRepository.findById>>>;
export type Section = ResumeWithSections['sections'][number];

// ─── Helpers ──────────────────────────────────────────────────

export function esc(text: unknown): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safe(val: unknown): string {
  return val != null ? String(val) : '';
}

/** Join degree and field with separator */
export function degreeField(degree: string, field: string | undefined): string {
  if (!field) return degree;
  return `${degree} - ${field}`;
}

/** Safe shared rich-text renderer for resume summaries, descriptions, and highlights. */
export function md(text: unknown): string {
  return renderRichTextHostHtml(text);
}

// ─── Section empty check ──────────────────────────────────────

export function isSectionEmpty(section: Section): boolean {
  const content = section.content as any;
  if (section.type === 'summary') return !(content as SummaryContent).text;
  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories;
    return !categories?.length || categories.every((cat: any) => !cat.skills?.length);
  }
  if ('items' in content) return !content.items?.length;
  return false;
}

// ─── HTML helpers ─────────────────────────────────────────────

export function visibleSections(resume: ResumeWithSections): Section[] {
  return resume.sections.filter((s: Section) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s));
}

export function getPersonalInfo(resume: ResumeWithSections): PersonalInfoContent {
  const sec = resume.sections.find((s: Section) => s.type === 'personal_info');
  return (sec?.content || {}) as PersonalInfoContent;
}

export function buildHighlights(highlights: string[] | undefined, liClass: string, bulletStyle?: string): string {
  if (!highlights?.length) return '';
  if (bulletStyle === 'custom-dot') {
    return highlights.map(h =>
      `<li class="flex items-start gap-2 text-sm text-zinc-600"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style="background:linear-gradient(135deg,#7c3aed,#f97316)"></span>${md(h)}</li>`
    ).join('');
  }
  return highlights.filter(Boolean).map(h => `<li class="${liClass}">${md(h)}</li>`).join('');
}

// ─── QR codes inline HTML (SVGs pre-generated in builders.ts) ─

export function buildQrCodesHtml(section: Section): string {
  const c = section.content as any;
  const svgs = (c._qrSvgs || {}) as Record<string, string>;
  const items = (c.items || []).filter((q: any) => q.url?.trim() && svgs[q.id]);
  if (items.length === 0) return '';
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px 24px;padding-top:4px">${items.map((qr: any) =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:96px">${svgs[qr.id]}<span style="font-size:10px;color:#6b7280;line-height:1.2;text-align:center;word-break:break-all;max-width:96px">${esc(qr.label)}</span></div>`
  ).join('')}</div>`;
}

// ─── Theme CSS for HTML export ────────────────────────────────

const FONT_SIZE_SCALE: Record<string, { body: string; h1: string; h2: string; h3: string }> = {
  small:  { body: '12px', h1: '22px', h2: '15px', h3: '13px' },
  medium: { body: '14px', h1: '26px', h2: '17px', h3: '15px' },
  large:  { body: '16px', h1: '30px', h2: '19px', h3: '17px' },
};

export const DEFAULT_THEME = {
  primaryColor: '#1a1a1a',
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontSize: 'medium',
  lineSpacing: 1.5,
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  sectionSpacing: 16,
  avatarStyle: 'oneInch' as const,
};

function isDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.4;
}

export function buildExportThemeCSS(theme: typeof DEFAULT_THEME, template: string): string {
  const fs = FONT_SIZE_SCALE[theme.fontSize] || FONT_SIZE_SCALE.medium;
  const font = resolveExportFont(theme.fontFamily);
  const m = theme.margin;
  const sel = '.resume-export';
  const needsPadding = !BACKGROUND_TEMPLATES.has(template);
  const primaryIsDark = isDark(theme.primaryColor);
  return `
    ${sel}, ${sel} * {
      font-family: "${font.family}", sans-serif !important;
    }
    ${sel} *::before, ${sel} *::after {
      font-family: "${font.family}", sans-serif !important;
    }
    ${sel} > div {
      line-height: ${theme.lineSpacing} !important;
      ${needsPadding ? `padding-top: ${m.top}px !important; padding-right: ${m.right}px !important; padding-bottom: ${m.bottom}px !important; padding-left: ${m.left}px !important;` : ''}
      --base-body-size: ${fs.body};
      --base-h1-size: ${fs.h1};
      --base-h2-size: ${fs.h2};
      --base-h3-size: ${fs.h3};
      --base-line-spacing: ${theme.lineSpacing};
      --base-section-spacing: ${theme.sectionSpacing}px;
      --base-margin-top: ${m.top}px;
      --base-margin-right: ${m.right}px;
      --base-margin-bottom: ${m.bottom}px;
      --base-margin-left: ${m.left}px;
      --needs-padding: ${needsPadding ? '1' : '0'};
    }
    ${sel} p, ${sel} li, ${sel} span, ${sel} td, ${sel} a, ${sel} div {
      font-size: ${fs.body} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${sel} h1:not([style*="color"]) { color: ${theme.primaryColor} !important; font-size: ${fs.h1} !important; line-height: ${theme.lineSpacing} !important; }
    ${sel} h1[style*="color"] { font-size: ${fs.h1} !important; line-height: ${theme.lineSpacing} !important; }
    ${sel} h2:not([style*="color"]) { color: ${theme.primaryColor} !important; font-size: ${fs.h2} !important; line-height: ${theme.lineSpacing} !important; border-color: ${theme.accentColor} !important; }
    ${sel} h2[style*="color"] { font-size: ${fs.h2} !important; line-height: ${theme.lineSpacing} !important; border-color: ${theme.accentColor} !important; }
    ${sel} h3:not([style*="color"]) { color: ${theme.primaryColor} !important; font-size: ${fs.h3} !important; line-height: ${theme.lineSpacing} !important; }
    ${sel} h3[style*="color"] { font-size: ${fs.h3} !important; line-height: ${theme.lineSpacing} !important; }
    ${sel} [class*="border-b-2"], ${sel} [class*="border-b-"] { border-color: ${theme.accentColor} !important; }
    ${sel} [class*="bg-blue-"], ${sel} [class*="bg-indigo-"],
    ${sel} [class*="bg-slate-800"], ${sel} [class*="bg-zinc-800"],
    ${sel} [class*="bg-teal-"], ${sel} [class*="bg-emerald-"] {
      background-color: ${theme.accentColor} !important;
    }
    ${sel} [data-section] { ${needsPadding ? `margin-bottom: ${theme.sectionSpacing}px` : `padding-bottom: ${theme.sectionSpacing}px`} !important; }
    ${primaryIsDark ? `
    ${sel} [style*="background"][style*="#"] h1:not([style*="color"]),
    ${sel} [style*="background"][style*="#"] h2:not([style*="color"]),
    ${sel} [style*="background"][style*="#"] h3:not([style*="color"]),
    ${sel} [style*="background"][style*="rgb"] h1:not([style*="color"]),
    ${sel} [style*="background"][style*="rgb"] h2:not([style*="color"]),
    ${sel} [style*="background"][style*="rgb"] h3:not([style*="color"]),
    ${sel} [style*="background"][style*="linear-gradient"] h1:not([style*="color"]),
    ${sel} [style*="background"][style*="linear-gradient"] h2:not([style*="color"]),
    ${sel} [style*="background"][style*="linear-gradient"] h3:not([style*="color"]),
    ${sel} .bg-black h1:not([style*="color"]),
    ${sel} .bg-black h2:not([style*="color"]),
    ${sel} .bg-black h3:not([style*="color"]) {
      color: #ffffff !important;
    }` : ''}
  `;
}
