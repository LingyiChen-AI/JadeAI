import { esc, buildExportThemeCSS, DEFAULT_THEME, type ResumeWithSections } from './utils';
import { EXPORT_TAILWIND_CSS } from '@/lib/pdf/export-tailwind-css';
import { BACKGROUND_TEMPLATES } from '@/lib/constants';
import { generateQrSvg } from '@/lib/qrcode';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';
import {
  buildTemplateDocument,
  normalizeResumeForTemplate,
  serializeTemplateDocumentHtml,
} from '@/lib/templates/template-document';
import { buildClassicHtml } from './templates/classic';
import { buildModernHtml } from './templates/modern';
import { buildMinimalHtml } from './templates/minimal';
import { buildProfessionalHtml } from './templates/professional';
import { buildTwoColumnHtml } from './templates/two-column';
import { buildCreativeHtml } from './templates/creative';
import { buildAtsHtml } from './templates/ats';
import { buildAcademicHtml } from './templates/academic';
import { buildElegantHtml } from './templates/elegant';
import { buildExecutiveHtml } from './templates/executive';
import { buildDeveloperHtml } from './templates/developer';
import { buildDesignerHtml } from './templates/designer';
import { buildStartupHtml } from './templates/startup';
import { buildFormalHtml } from './templates/formal';
import { buildInfographicHtml } from './templates/infographic';
import { buildCompactHtml } from './templates/compact';
import { buildEuroHtml } from './templates/euro';
import { buildCleanHtml } from './templates/clean';
import { buildBoldHtml } from './templates/bold';
import { buildTimelineHtml } from './templates/timeline';
// Batch 1
import { buildNordicHtml } from './templates/nordic';
import { buildCorporateHtml } from './templates/corporate';
import { buildConsultantHtml } from './templates/consultant';
import { buildFinanceHtml } from './templates/finance';
import { buildMedicalHtml } from './templates/medical';
// Batch 2
import { buildGradientHtml } from './templates/gradient';
import { buildMetroHtml } from './templates/metro';
import { buildMaterialHtml } from './templates/material';
import { buildCoderHtml } from './templates/coder';
import { buildBlocksHtml } from './templates/blocks';
// Batch 3
import { buildMagazineHtml } from './templates/magazine';
import { buildArtisticHtml } from './templates/artistic';
import { buildRetroHtml } from './templates/retro';
import { buildNeonHtml } from './templates/neon';
import { buildWatercolorHtml } from './templates/watercolor';
// Batch 4
import { buildSwissHtml } from './templates/swiss';
import { buildJapaneseHtml } from './templates/japanese';
import { buildBerlinHtml } from './templates/berlin';
import { buildLuxeHtml } from './templates/luxe';
import { buildRoseHtml } from './templates/rose';
// Batch 5
import { buildArchitectHtml } from './templates/architect';
import { buildLegalHtml } from './templates/legal';
import { buildTeacherHtml } from './templates/teacher';
import { buildScientistHtml } from './templates/scientist';
import { buildEngineerHtml } from './templates/engineer';
// Batch 6
import { buildSidebarHtml } from './templates/sidebar';
import { buildCardHtml } from './templates/card';
import { buildZigzagHtml } from './templates/zigzag';
import { buildRibbonHtml } from './templates/ribbon';
import { buildMosaicHtml } from './templates/mosaic';

// Templates whose ENTIRE page is dark (not just header/sidebar).
// Body background must match so the PDF page doesn't show white gaps.
const FULL_DARK_TEMPLATES: Record<string, string> = {
  neon: '#111827',
};

// Templates with a dark sidebar — body uses a horizontal gradient so the
// sidebar colour fills every page edge-to-edge, even when the sidebar div
// has no more content on later pages.  @page margin is 0 so there are no
// white gaps between pages; text padding comes from the template's own p-*.
const SIDEBAR_DARK_TEMPLATES: Record<string, { bg: string; width: string }> = {
  'two-column': { bg: '#16213e', width: '35%' },
  sidebar:      { bg: '#1e40af', width: '35%' },
  coder:        { bg: '#0d1117', width: '32%' },
};

const TEMPLATE_BUILDERS: Record<string, (r: ResumeWithSections) => string> = {
  classic: buildClassicHtml,
  modern: buildModernHtml,
  minimal: buildMinimalHtml,
  professional: buildProfessionalHtml,
  'two-column': buildTwoColumnHtml,
  creative: buildCreativeHtml,
  ats: buildAtsHtml,
  academic: buildAcademicHtml,
  elegant: buildElegantHtml,
  executive: buildExecutiveHtml,
  developer: buildDeveloperHtml,
  designer: buildDesignerHtml,
  startup: buildStartupHtml,
  formal: buildFormalHtml,
  infographic: buildInfographicHtml,
  compact: buildCompactHtml,
  euro: buildEuroHtml,
  clean: buildCleanHtml,
  bold: buildBoldHtml,
  timeline: buildTimelineHtml,
  // Batch 1
  nordic: buildNordicHtml,
  corporate: buildCorporateHtml,
  consultant: buildConsultantHtml,
  finance: buildFinanceHtml,
  medical: buildMedicalHtml,
  // Batch 2
  gradient: buildGradientHtml,
  metro: buildMetroHtml,
  material: buildMaterialHtml,
  coder: buildCoderHtml,
  blocks: buildBlocksHtml,
  // Batch 3
  magazine: buildMagazineHtml,
  artistic: buildArtisticHtml,
  retro: buildRetroHtml,
  neon: buildNeonHtml,
  watercolor: buildWatercolorHtml,
  // Batch 4
  swiss: buildSwissHtml,
  japanese: buildJapaneseHtml,
  berlin: buildBerlinHtml,
  luxe: buildLuxeHtml,
  rose: buildRoseHtml,
  // Batch 5
  architect: buildArchitectHtml,
  legal: buildLegalHtml,
  teacher: buildTeacherHtml,
  scientist: buildScientistHtml,
  engineer: buildEngineerHtml,
  // Batch 6
  sidebar: buildSidebarHtml,
  card: buildCardHtml,
  zigzag: buildZigzagHtml,
  ribbon: buildRibbonHtml,
  mosaic: buildMosaicHtml,
};

function normalizeQrUrl(str: string): string | null {
  if (!str?.trim()) return null;
  try {
    const raw = /^https?:\/\//i.test(str) ? str : `https://${str}`;
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname;
    return host === 'localhost' || /\.\w{2,}$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isValidQrUrl(str: string): boolean {
  return normalizeQrUrl(str) !== null;
}

/** Pre-generate QR code SVGs and attach to qr_codes section content
 *  so sync template builders can render them inline. */
async function preGenerateQrSvgs(resume: ResumeWithSections): Promise<void> {
  const qrSection = resume.sections.find((s: any) => s.type === 'qr_codes');
  if (!qrSection || qrSection.visible === false) return;
  const items = ((qrSection.content as any).items || []).filter((q: any) => isValidQrUrl(q.url));
  if (items.length === 0) return;
  const svgs: Record<string, string> = {};
  for (const qr of items) {
    try { svgs[qr.id] = await generateQrSvg(qr.url, 80); } catch { /* skip */ }
  }
  (qrSection.content as any)._qrSvgs = svgs;
}

async function generateDeclarativeHtml(
  resume: ResumeWithSections,
  resolvedTemplate: Extract<ResolvedTemplate, { kind: 'declarative-v1' }>,
  forPdf: boolean,
): Promise<string> {
  const qrImagesByUrl: Record<string, string> = {};
  if (resolvedTemplate.manifest.features.showQrCodes) {
    const qrSection = resume.sections.find((section) => section.type === 'qr_codes' && section.visible !== false);
    const items = qrSection && typeof qrSection.content === 'object' && qrSection.content
      ? (qrSection.content as { items?: unknown }).items
      : null;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const url = normalizeQrUrl(String((item as { url?: unknown }).url ?? ''));
        if (!url || qrImagesByUrl[url]) continue;
        try {
          const svg = await generateQrSvg(url, 80);
          qrImagesByUrl[url] = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
        } catch { /* invalid QR input is omitted */ }
      }
    }
  }
  const document = buildTemplateDocument(normalizeResumeForTemplate(resume), resolvedTemplate.manifest, { qrImagesByUrl });
  const content = serializeTemplateDocumentHtml(document);
  return `<!DOCTYPE html>
<html lang="${esc(resume.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(resume.title)}</title>
  <style>
    @font-face { font-family: "Noto Sans SC"; src: url("/fonts/NotoSansSC-Regular.otf") format("opentype"); font-weight: 400; font-display: swap; }
    @font-face { font-family: "Noto Sans SC"; src: url("/fonts/NotoSansSC-Bold.otf") format("opentype"); font-weight: 700; font-display: swap; }
    @page {
      size: A4;
      margin: ${document.page.marginMm}mm;
      ${document.page.showPageNumbers ? `@bottom-center {
        content: counter(page);
        color: ${document.colors.muted};
        font: 8pt "Noto Sans SC", sans-serif;
      }` : ''}
    }
    html, body { margin: 0; padding: 0; background: ${document.colors.background}; color: ${document.colors.text}; }
    body { ${forPdf ? '' : `padding: ${document.page.marginMm}mm;`} font-family: "Noto Sans SC", sans-serif; }
    .declarative-resume { box-sizing: border-box; max-width: 210mm; margin: 0 auto; font-size: var(--template-font-size); line-height: var(--template-line-height); }
    .declarative-resume[data-layout="two-column"], .declarative-resume[data-layout="sidebar"] { display: grid; grid-auto-flow: row dense; grid-template-columns: minmax(0, 1fr) var(--template-sidebar-width); gap: var(--template-column-gap); }
    .declarative-resume[data-sidebar-position="left"] { grid-template-columns: var(--template-sidebar-width) minmax(0, 1fr); }
    [data-placement="header"], [data-placement="footer"] { grid-column: 1 / -1; }
    [data-placement="main"] { grid-column: ${document.layout.sidebarPosition === 'left' ? '2' : '1'}; }
    [data-placement="sidebar"] { grid-column: ${document.layout.sidebarPosition === 'left' ? '1' : '2'}; }
    [data-section] { margin-bottom: var(--template-section-gap); break-inside: auto; }
    h2 { margin: 0 0 2mm; font-size: calc(var(--template-font-size) * ${document.typography.headingScale}); color: var(--template-text); }
    [data-heading-variant="accent"] h2 { color: var(--template-accent); }
    [data-heading-variant="muted"] h2, [data-tone="muted"] { color: var(--template-muted); }
    [data-heading-variant="compact"] h2 { font-size: var(--template-font-size); margin-bottom: 1mm; }
    [data-heading-variant="bordered"] h2 { border-bottom: 1px solid var(--template-accent); padding-bottom: 1mm; }
    [data-style-divider="compact"] { margin-bottom: 1mm; padding-bottom: 1mm; }
    [data-style-divider="accent"] { border-bottom: 1px solid var(--template-accent); }
    [data-style-divider="muted"] { border-bottom: 1px solid var(--template-muted); }
    [data-style-divider="bordered"] { border-bottom: 1px solid var(--template-muted); padding-bottom: 2mm; }
    [data-style-body="compact"] [data-block="paragraph"], [data-style-contact="compact"] [data-block="contact"], [data-style-bullet="compact"] [data-block="list"] { font-size: .9em; line-height: 1.25; }
    [data-style-body="accent"] [data-block="paragraph"], [data-style-contact="accent"] [data-block="contact"], [data-style-bullet="accent"] [data-block="list"] { color: var(--template-accent); }
    [data-style-body="muted"] [data-block="paragraph"], [data-style-contact="muted"] [data-block="contact"], [data-style-bullet="muted"] [data-block="list"] { color: var(--template-muted); }
    [data-style-body="bordered"] [data-block="paragraph"], [data-style-contact="bordered"] [data-block="contact"], [data-style-bullet="bordered"] [data-block="list"] { border-left: 2px solid var(--template-accent); padding-left: 2mm; }
    [data-image-role="avatar"] { max-width: 32mm; height: auto; object-fit: cover; }
    [data-image-role="qr"] { max-width: 24mm; height: auto; }
    [data-style-avatar="compact"] [data-image-role="avatar"] { max-width: 24mm; }
    [data-style-avatar="accent"] [data-image-role="avatar"] { border: 2px solid var(--template-accent); }
    [data-style-avatar="muted"] [data-image-role="avatar"] { opacity: .72; }
    [data-style-avatar="bordered"] [data-image-role="avatar"] { border: 2px solid var(--template-accent); padding: 1mm; }
    [data-style-date="compact"] [data-tone="muted"] { font-size: .9em; line-height: 1.25; }
    [data-style-date="accent"] [data-tone="muted"] { color: var(--template-accent); }
    [data-style-date="muted"] [data-tone="muted"] { color: var(--template-muted); }
    [data-style-date="bordered"] [data-tone="muted"] { border-left: 2px solid var(--template-accent); padding-left: 2mm; }
    [data-style-qr="compact"] [data-block="qr"], [data-style-qr="compact"] [data-image-role="qr"] { max-width: 20mm; }
    [data-style-qr="accent"] [data-block="qr"], [data-style-qr="accent"] [data-image-role="qr"] { color: var(--template-accent); border-color: var(--template-accent); }
    [data-style-qr="muted"] [data-block="qr"], [data-style-qr="muted"] [data-image-role="qr"] { color: var(--template-muted); opacity: .72; }
    [data-style-qr="bordered"] [data-block="qr"], [data-style-qr="bordered"] [data-image-role="qr"] { border: 2px solid var(--template-accent); padding: 1mm; }
    [data-page-number] { color: var(--template-muted); font-size: 8pt; margin-top: 2mm; text-align: center; }
    ${forPdf ? '@media print { [data-page-number] { display: none; } }' : ''}
    p { margin: 0 0 1.5mm; white-space: pre-wrap; }
    a { color: var(--template-accent); overflow-wrap: anywhere; }
  </style>
</head>
<body>${content}</body>
</html>`;
}

export async function generateHtml(
  resume: ResumeWithSections,
  forPdf = false,
  resolvedTemplate?: ResolvedTemplate,
): Promise<string> {
  if (resolvedTemplate?.kind === 'declarative-v1') {
    return generateDeclarativeHtml(resume, resolvedTemplate, forPdf);
  }
  // Pre-generate QR SVGs so sync template builders can use them
  await preGenerateQrSvgs(resume);
  const builder = TEMPLATE_BUILDERS[resume.template] || buildClassicHtml;
  const bodyHtml = builder(resume);
  const theme = { ...DEFAULT_THEME, ...((resume as any).themeConfig || {}) };
  const themeCSS = buildExportThemeCSS(theme, resume.template);
  const isBackground = BACKGROUND_TEMPLATES.has(resume.template);

  const fullDarkBg = FULL_DARK_TEMPLATES[resume.template];
  const isFullDark = !!fullDarkBg;
  const sidebarDark = SIDEBAR_DARK_TEMPLATES[resume.template];
  const isSidebarDark = !!sidebarDark;

  // Determine body background for PDF
  let bodyBg = 'white';
  if (isFullDark) bodyBg = fullDarkBg;
  else if (isSidebarDark) bodyBg = `linear-gradient(90deg, ${sidebarDark.bg} ${sidebarDark.width}, white ${sidebarDark.width})`;

  // BACKGROUND/dark templates need edge-to-edge layout → @page margin:0
  // Regular templates → @page margins for reliable pagination (clone reserves space at breaks,
  // causing Chrome to push items to the next page even when they visually fit)
  const needsEdgeToEdge = isFullDark || isSidebarDark || isBackground;
  // Clone on the OUTER div — sidebar-dark templates only need clone on child divs (set below),
  // putting clone on the outer flex container inflates the box at page breaks → blank pages.
  const outerNeedsClone = isFullDark || (isBackground && !isSidebarDark);
  const pxToMm = (px: number) => Math.round((px / 3.78) * 10) / 10;
  const pageMarginTop = pxToMm(theme.margin.top);
  const pageMarginBottom = pxToMm(theme.margin.bottom);

  const pdfOverrides = forPdf
    ? `/* Page margins and fragmentation */
       @page { margin: ${needsEdgeToEdge ? '0' : `${pageMarginTop}mm 0 ${pageMarginBottom}mm 0`}; }
       html, body { background: ${bodyBg} !important; padding: 0 !important; margin: 0 !important; display: block !important; min-height: 100%; }
       .resume-export { width: 100%; }
       .resume-export > div { box-shadow: none !important; overflow: visible !important; ${outerNeedsClone ? '-webkit-box-decoration-break: clone; box-decoration-break: clone;' : 'padding-top: 0 !important; padding-bottom: 0 !important;'} ${isSidebarDark ? 'min-height: auto !important; max-width: none !important; width: 100% !important; background: transparent !important;' : isBackground ? 'max-width: none !important; width: 100% !important;' : 'background: white !important;'} }
       /* Smart pagination: allow sections to break across pages, keep individual items together.
          overflow:visible is critical — Chrome treats overflow:hidden as monolithic (no page fragmentation). */
       [data-section] { break-inside: auto !important; overflow: visible !important; }
       [data-section] * { overflow: visible !important; }
       [data-section] [class*="space-y"] { break-inside: auto !important; }
       [data-section] [class*="space-y"] > div, .item { break-inside: avoid !important; }
       h2, h3 { break-after: avoid !important; }
       p { orphans: 3; widows: 3; }
       ${isSidebarDark ? `/* Sidebar dark: body gradient = sidebar colour every page.
          Sidebar uses slice to avoid clone rendering artifacts at page breaks.
          Content uses clone to replicate padding at page breaks. */
       .resume-export > div > div:first-child {
         background: ${sidebarDark.bg} !important;
         background-image: none !important;
         -webkit-box-decoration-break: slice !important;
         box-decoration-break: slice !important;
         padding-top: 5mm !important;
         padding-bottom: 5mm !important;
       }
       .resume-export > div > div:last-child {
         background-color: white !important;
         -webkit-box-decoration-break: clone;
         box-decoration-break: clone;
         padding-top: 5mm !important;
         padding-bottom: 5mm !important;
       }` : isBackground ? `/* Background templates: padding lives on child divs (e.g. p-8),
          clone so padding replicates at each page break. */
       .resume-export > div > div {
         -webkit-box-decoration-break: clone;
         box-decoration-break: clone;
       }` : ''}
       ${isFullDark ? `/* Full-dark: simulate @page margin via content padding */
       .resume-export > div > *:last-child {
         padding: 12mm 10mm !important;
         -webkit-box-decoration-break: clone;
         box-decoration-break: clone;
       }` : ''}`
    : '';

  return `<!DOCTYPE html>
<html lang="${esc(resume.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(resume.title)}</title>
  <style>${EXPORT_TAILWIND_CSS}</style>
  <style>
    @font-face { font-family: "Noto Sans SC"; src: url("/fonts/NotoSansSC-Regular.otf") format("opentype"); font-weight: 400; font-display: swap; }
    @font-face { font-family: "Noto Sans SC"; src: url("/fonts/NotoSansSC-Bold.otf") format("opentype"); font-weight: 700; font-display: swap; }
    body { margin: 0; display: flex; justify-content: center; padding: 40px 20px; background: #f4f4f5; min-height: 100vh; }
    @media print { body { padding: 0 !important; background: white !important; } .resume-export > div { box-shadow: none !important; } }
    ${themeCSS}
    ${pdfOverrides}
    /* Tailwind v4 uses calc(infinity * 1px) for rounded-full which may fail
       in some Chromium PDF rendering — use safe 9999px fallback */
    .resume-export .rounded-full { border-radius: 9999px !important; }
    /* Avatar style overrides — export templates hardcode rounded-full + equal w/h.
       Override to match the preview's AvatarImage component for each style. */
    /* oneInch: portrait rectangle (5:7) with small radius */
    .resume-export[data-avatar-style="oneInch"] img[class*="object-cover"] {
      border-radius: 4px !important;
      aspect-ratio: 5 / 7 !important;
      height: auto !important;
      max-height: none !important;
    }
    .resume-export[data-avatar-style="oneInch"] div:has(> img[class*="object-cover"]) {
      border-radius: 4px !important;
      height: auto !important;
      overflow: hidden !important;
    }
    /* circle: equal w/h with full rounding — use 9999px as safe fallback
       for Tailwind v4's calc(infinity * 1px) which may fail in some Chromium builds */
    .resume-export[data-avatar-style="circle"] img[class*="object-cover"] {
      border-radius: 9999px !important;
      aspect-ratio: 1 / 1 !important;
    }
    .resume-export[data-avatar-style="circle"] div:has(> img[class*="object-cover"]) {
      border-radius: 9999px !important;
      overflow: hidden !important;
    }
  </style>
</head>
<body>
  <div class="resume-export" data-avatar-style="${esc((resume as any).themeConfig?.avatarStyle || 'oneInch')}">
    ${bodyHtml}
  </div>
</body>
</html>`;
}
