import { TEMPLATES } from '@/lib/constants';

interface BeautifyResumeContext {
  template: string;
  templateSource: string;
  templateVersionId?: string | null;
  themeConfig: unknown;
}

const TEMPLATE_SOURCES = ['legacy', 'public', 'local-snapshot'] as const;
const THEME_FIELDS = {
  primaryColor: (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value),
  accentColor: (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value),
  fontFamily: (value: unknown) => value === 'Noto Sans SC',
  fontSize: (value: unknown) => ['small', 'medium', 'large'].includes(value as string),
  lineSpacing: (value: unknown) => typeof value === 'number' && value >= 1 && value <= 2.5,
  sectionSpacing: (value: unknown) => Number.isInteger(value) && (value as number) >= 4 && (value as number) <= 32,
  avatarStyle: (value: unknown) => ['circle', 'oneInch'].includes(value as string),
} as const;

function sanitizeThemeConfig(themeConfig: unknown) {
  if (!themeConfig || typeof themeConfig !== 'object' || Array.isArray(themeConfig)) return {};
  const source = themeConfig as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [field, validate] of Object.entries(THEME_FIELDS)) {
    if (validate(source[field])) sanitized[field] = source[field];
  }
  if (source.margin && typeof source.margin === 'object' && !Array.isArray(source.margin)) {
    const margin = Object.fromEntries(
      ['top', 'right', 'bottom', 'left']
        .filter((side) => {
          const value = (source.margin as Record<string, unknown>)[side];
          return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 60;
        })
        .map((side) => [side, (source.margin as Record<string, unknown>)[side]]),
    );
    if (Object.keys(margin).length > 0) sanitized.margin = margin;
  }
  return sanitized;
}

export function parseBeautifyFlag(body: Record<string, unknown>): boolean {
  if (body.beautify === undefined) return false;
  if (typeof body.beautify !== 'boolean') throw new Error('invalid_beautify_flag');
  return body.beautify;
}

export function shouldRegisterBeautifyTools(beautify: boolean): boolean {
  return beautify === true;
}

export function buildBeautifyContext(resume: BeautifyResumeContext, beautify: boolean): string {
  if (beautify !== true) return '';
  return `## Current Resume Style\n${JSON.stringify({
    ...((TEMPLATES as readonly string[]).includes(resume.template) ? { template: resume.template } : {}),
    ...(TEMPLATE_SOURCES.includes(resume.templateSource as typeof TEMPLATE_SOURCES[number])
      ? { templateSource: resume.templateSource }
      : {}),
    themeConfig: sanitizeThemeConfig(resume.themeConfig),
  })}\n\nThis is read-only context. Only use registered style tools to change the resume.`;
}
