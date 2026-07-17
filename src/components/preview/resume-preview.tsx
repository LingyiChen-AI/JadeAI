'use client';

import { createElement, lazy, Suspense, useId } from 'react';
import type { Resume, ThemeConfig } from '@/types/resume';
import { BACKGROUND_TEMPLATES, TEMPLATES } from '@/lib/constants';
import { loadLegacyTemplateAdapter } from '@/components/templates/legacy-template-registry';
import { buildTemplateDocument, normalizeResumeForTemplate } from '@/lib/templates/template-document';
import { resolveSavedTemplateSnapshot } from '@/lib/templates/resolve-template';
import { DeclarativeTemplateDocument } from './declarative-template-document';

interface ResumePreviewProps {
  resume: Resume;
}

const lazyLegacyTemplates = new Map<string, React.LazyExoticComponent<React.ComponentType<{ resume: Resume }>>>(
  [...TEMPLATES].map((slug) => [
    slug,
    lazy(async () => {
      try {
        return { default: await loadLegacyTemplateAdapter(slug) };
      } catch {
        return { default: await loadLegacyTemplateAdapter('classic') };
      }
    }),
  ]),
);

function LegacyTemplateRenderer({ slug, resume }: { slug: string; resume: Resume }) {
  const component = lazyLegacyTemplates.get(slug) ?? lazyLegacyTemplates.get('classic')!;
  return createElement(component, { resume });
}

const FONT_SIZE_SCALE: Record<string, { body: string; h1: string; h2: string; h3: string }> = {
  small:  { body: '12px', h1: '22px', h2: '15px', h3: '13px' },
  medium: { body: '14px', h1: '26px', h2: '17px', h3: '15px' },
  large:  { body: '16px', h1: '30px', h2: '19px', h3: '17px' },
};

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#1a1a1a',
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontSize: 'medium',
  lineSpacing: 1.5,
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  sectionSpacing: 16,
  avatarStyle: 'oneInch',
};

/** Returns true if a hex colour is dark (luminance < 0.4) */
function isDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.4;
}

function buildThemeCSS(scopeId: string, theme: ThemeConfig, template: string): string {
  const s = `[data-theme-scope="${scopeId}"]`;
  const fs = FONT_SIZE_SCALE[theme.fontSize] || FONT_SIZE_SCALE.medium;
  const m = theme.margin;
  const needsPadding = !BACKGROUND_TEMPLATES.has(template);
  const primaryIsDark = isDark(theme.primaryColor);

  return `
    ${s} > div {
      font-family: ${theme.fontFamily}, 'Noto Sans SC', sans-serif !important;
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
    }
    ${s} p, ${s} li, ${s} span, ${s} td, ${s} a, ${s} div {
      font-size: ${fs.body} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h1:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h1[style*="color"] {
      font-size: ${fs.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h2:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }
    ${s} h2[style*="color"] {
      font-size: ${fs.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }
    ${s} h3:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h3[style*="color"] {
      font-size: ${fs.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} [class*="border-b-2"],
    ${s} [class*="border-b-"] {
      border-color: ${theme.accentColor} !important;
    }
    ${s} [class*="bg-blue-"], ${s} [class*="bg-indigo-"],
    ${s} [class*="bg-slate-800"], ${s} [class*="bg-zinc-800"],
    ${s} [class*="bg-teal-"], ${s} [class*="bg-emerald-"] {
      background-color: ${theme.accentColor} !important;
    }
    ${s} [data-section] {
      ${needsPadding ? `margin-bottom: ${theme.sectionSpacing}px !important;` : `padding-bottom: ${theme.sectionSpacing}px !important;`}
    }
    ${primaryIsDark ? `
    ${s} [style*="background"][style*="#"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="#"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="#"] h3:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h3:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h3:not([style*="color"]),
    ${s} .bg-black h1:not([style*="color"]),
    ${s} .bg-black h2:not([style*="color"]),
    ${s} .bg-black h3:not([style*="color"]) {
      color: #ffffff !important;
    }` : ''}
  `;
}

export function ResumePreview({ resume }: ResumePreviewProps) {
  const scopeId = useId();
  const theme: ThemeConfig = { ...DEFAULT_THEME, ...(resume.themeConfig || {}) };

  // Defensive: ensure resume.sections is always an array (AI may return invalid/empty data)
  const safeResume = resume.sections ? resume : { ...resume, sections: [] };
  const resolvedTemplate = resume.resolvedTemplate ?? resolveSavedTemplateSnapshot(resume.templateSnapshot);
  const legacySlug = resolvedTemplate?.kind === 'legacy-react' ? resolvedTemplate.slug : safeResume.template;

  if (resolvedTemplate?.kind === 'declarative-v1') {
    const document = buildTemplateDocument(normalizeResumeForTemplate(safeResume), resolvedTemplate.manifest);
    return <DeclarativeTemplateDocument document={document} />;
  }

  return (
    <>
      <style>{`@font-face{font-family:"Noto Sans SC";src:url("/fonts/NotoSansSC-Regular.otf") format("opentype");font-weight:400;font-display:swap}@font-face{font-family:"Noto Sans SC";src:url("/fonts/NotoSansSC-Bold.otf") format("opentype");font-weight:700;font-display:swap}`}</style>
      <div data-theme-scope={scopeId}>
        <style dangerouslySetInnerHTML={{ __html: buildThemeCSS(scopeId, theme, safeResume.template) }} />
        <Suspense fallback={<div className="min-h-[297mm] bg-white" aria-busy="true" />}>
          <LegacyTemplateRenderer slug={legacySlug} resume={safeResume} />
        </Suspense>
      </div>
    </>
  );
}
