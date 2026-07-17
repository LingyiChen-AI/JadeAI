import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, ImageRun,
  TableBorders, VerticalAlignTable, NumberFormat,
  type IFontAttributesProperties, type ITableCellBorders, type IBorderOptions,
} from 'docx';
import type {
  PersonalInfoContent, SummaryContent, WorkExperienceContent,
  EducationContent, SkillsContent, ProjectsContent,
  CertificationsContent, LanguagesContent, CustomContent,
  GitHubContent, QrCodesContent,
} from '@/types/resume';
import QRCode from 'qrcode';
import { resolveExportFont } from '@/lib/export/font-registry';
import { embedDocxFonts } from '@/lib/export/docx-fonts';
import { parseRichText } from '@/lib/resume/rich-text';
import { type ResumeWithSections, getPersonalInfo, visibleSections, DEFAULT_THEME, safe } from './utils';

// ─── Template style configuration ───────────────────────────
// Colors + layout style per template. Templates without headerBg
// get a light (no-background) header automatically.
// headingStyle defaults: light header → 'bottom-border', dark → 'left-border'
// itemBorder defaults: light header → false, dark → true

type HeadingStyle = 'left-border' | 'bottom-border' | 'bg-badge' | 'plain';
type LayoutType = 'single' | 'sidebar-left';

interface TemplateStyle {
  headerBg?: string;
  accent?: string;
  secondary?: string;
  headingStyle?: HeadingStyle;
  headerAlign?: 'center' | 'left';
  itemBorder?: boolean;
  layout?: LayoutType;
  sidebarWidth?: number;
  sidebarBg?: string;
  sidebarTextColor?: string;
  sidebarLabelColor?: string;
  sidebarSections?: string[];
  headerInSidebar?: boolean;
}

const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  // ── Dark header + left-border headings (default) ──
  architect:    { headerBg: '#1e3a5f', accent: '#1d4ed8' },
  artistic:     { headerBg: '#1e1b4b', accent: '#f43f5e', secondary: '#fbbf24' },
  card:         { headerBg: '#18181b', accent: '#6366f1' },
  creative:     { headerBg: '#7c3aed', accent: '#7c3aed', secondary: '#f97316' },
  executive:    { headerBg: '#2d3436', accent: '#00b894' },
  gradient:     { headerBg: '#ec4899', accent: '#a855f7' },
  legal:        { headerBg: '#1a472a', accent: '#15803d', secondary: '#166534' },
  material:     { headerBg: '#4f46e5', accent: '#7c3aed' },
  modern:       { headerBg: '#16213e', accent: '#e94560', secondary: '#0f3460' },
  mosaic:       { headerBg: '#1e293b', accent: '#3b82f6' },
  rose:         { headerBg: '#881337', accent: '#be185d' },
  startup:      { headerBg: '#6366f1', accent: '#06b6d4' },
  watercolor:   { headerBg: '#4c1d95', accent: '#c084fc' },
  zigzag:       { headerBg: '#1e293b', accent: '#8b5cf6' },

  // ── Dark header + bottom-border headings ──
  berlin:       { headerBg: '#000000', accent: '#2563eb', secondary: '#eab308', headingStyle: 'bottom-border', itemBorder: false },
  bold:         { headerBg: '#000000', headingStyle: 'bottom-border', itemBorder: false },
  compact:      { headerBg: '#1e293b', headingStyle: 'bottom-border', itemBorder: false, layout: 'sidebar-left', sidebarWidth: 32, sidebarBg: '#f4f4f5', sidebarTextColor: '3F3F46', sidebarLabelColor: '71717A', sidebarSections: ['skills', 'languages', 'certifications', 'custom'], headerInSidebar: false },
  consultant:   { headerBg: '#2563eb', accent: '#2563eb', headingStyle: 'bottom-border', itemBorder: false },
  finance:      { headerBg: '#1e293b', accent: '#c4a747', headingStyle: 'bottom-border', itemBorder: false },
  japanese:     { headerBg: '#1c1917', accent: '#a8a29e', headingStyle: 'bottom-border', itemBorder: false },
  retro:        { headerBg: '#78350f', accent: '#92400e', headingStyle: 'bottom-border', itemBorder: false },
  'two-column': { headerBg: '#1a1a2e', headingStyle: 'bottom-border', itemBorder: false, layout: 'sidebar-left', sidebarWidth: 35, sidebarBg: '#16213e', sidebarTextColor: 'FFFFFF', sidebarLabelColor: 'A0AEC0', sidebarSections: ['skills', 'languages', 'certifications', 'custom'], headerInSidebar: true },

  // ── Dark header + bg-badge headings ──
  coder:        { headerBg: '#0d1117', accent: '#58a6ff', secondary: '#3fb950', headingStyle: 'bg-badge', layout: 'sidebar-left', sidebarWidth: 32, sidebarBg: '#0d1117', sidebarTextColor: 'C9D1D9', sidebarLabelColor: '8B949E', sidebarSections: ['skills', 'languages', 'certifications'], headerInSidebar: true },
  developer:    { headerBg: '#282c34', accent: '#61afef', secondary: '#98c379', headingStyle: 'bg-badge' },
  engineer:     { headerBg: '#1e293b', accent: '#0284c7', secondary: '#64748b', headingStyle: 'bg-badge' },
  medical:      { headerBg: '#115e59', accent: '#0d9488', headingStyle: 'bg-badge' },
  metro:        { headerBg: '#1e293b', accent: '#f59e0b', headingStyle: 'bg-badge', itemBorder: false },
  neon:         { headerBg: '#111827', accent: '#22d3ee', secondary: '#a78bfa', headingStyle: 'bg-badge' },
  ribbon:       { headerBg: '#dc2626', accent: '#b91c1c', headingStyle: 'bg-badge' },
  scientist:    { headerBg: '#0f172a', accent: '#0891b2', headingStyle: 'bg-badge', itemBorder: false },
  teacher:      { headerBg: '#9a3412', accent: '#ea580c', headingStyle: 'bg-badge' },
  timeline:     { headerBg: '#475569', accent: '#3b82f6', headingStyle: 'bg-badge' },

  // ── Dark header + no item border ──
  blocks:       { headerBg: '#37352f', accent: '#2383e2', itemBorder: false },
  corporate:    { headerBg: '#0f172a', accent: '#2563eb', itemBorder: false },
  infographic:  { headerBg: '#1e40af', accent: '#3b82f6', itemBorder: false },
  sidebar:      { headerBg: '#1e40af', accent: '#3b82f6', itemBorder: false, layout: 'sidebar-left', sidebarWidth: 35, sidebarBg: '#1e40af', sidebarTextColor: 'FFFFFF', sidebarLabelColor: 'B3D4FC', sidebarSections: ['skills', 'languages', 'certifications', 'custom'], headerInSidebar: true },

  // ── Light header (no bg) + bottom-border (default for light) ──
  classic:      { accent: '#d4d4d8', headingStyle: 'bottom-border', itemBorder: false },
  academic:     { accent: '#27272a', headingStyle: 'bottom-border', itemBorder: false },
  ats:          { accent: '#000000', headingStyle: 'bottom-border', itemBorder: false },
  elegant:      { accent: '#d4af37' },
  euro:         { accent: '#1e40af' },
  formal:       { accent: '#004d40' },
  luxe:         { accent: '#d4af37' },
  minimal:      { accent: '#a1a1aa', headingStyle: 'plain', headerAlign: 'left', itemBorder: false },
  nordic:       { accent: '#64748b' },
  professional: { accent: '#1e3a5f' },
  swiss:        { accent: '#dc2626' },

  // ── Light header + left-border headings (override) ──
  clean:        { accent: '#0d9488', secondary: '#0066cc', headingStyle: 'left-border', itemBorder: true },
  designer:     { accent: '#ff6b6b', headingStyle: 'left-border', itemBorder: true },
  magazine:     { accent: '#dc2626', headingStyle: 'left-border' },
};

// ─── Theme resolution ────────────────────────────────────────

interface DocxTheme {
  primary: string;
  accent: string;
  secondary: string;
  headerBg: string;
  headerText: string;
  headerLight: boolean;
  headingStyle: HeadingStyle;
  headerAlign: 'center' | 'left';
  itemBorder: boolean;
  fontWest: string;
  fontEast: string;
  bodySize: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  lineSpacing: number;
  sectionSpacing: number;
  layout: LayoutType;
  sidebarWidth: number;
  sidebarBg: string;
  sidebarTextColor: string;
  sidebarLabelColor: string;
  sidebarSections: string[];
  headerInSidebar: boolean;
  numberingInstanceCounter: number;
}

const FONT_SIZES: Record<string, { body: number; h1: number; h2: number; h3: number }> = {
  small:  { body: 20, h1: 36, h2: 24, h3: 22 },
  medium: { body: 22, h1: 40, h2: 26, h3: 24 },
  large:  { body: 24, h1: 44, h2: 30, h3: 26 },
};

function strip(hex: string) { return hex.replace('#', ''); }

function isDark(hex: string) {
  const c = strip(hex);
  if (c.length < 6) return true;
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}

function resolveTheme(cfg: unknown, template?: string): DocxTheme {
  const userCfg = (cfg as Record<string, unknown>) || {};
  const tc = template ? TEMPLATE_STYLES[template] : undefined;

  // Merge: global defaults → template colors → user overrides
  const base = { ...DEFAULT_THEME } as Record<string, unknown>;
  if (tc?.accent && !userCfg.accentColor) base.accentColor = tc.accent;
  const t = { ...base, ...userCfg } as typeof DEFAULT_THEME;

  const fs = FONT_SIZES[t.fontSize] || FONT_SIZES.medium;
  const primary = strip(t.primaryColor);
  const accent = strip(t.accentColor);

  // Header: dark-bg if template has headerBg, otherwise light
  const wantsDarkHeader = !!tc?.headerBg;
  let headerBg: string;
  let headerLight: boolean;

  if (wantsDarkHeader) {
    headerBg = userCfg.primaryColor
      ? strip(userCfg.primaryColor as string)
      : strip(tc!.headerBg!);
    headerLight = false;
  } else {
    headerLight = true;
    headerBg = 'FFFFFF';
  }
  const headerText = headerLight ? '222222' : (isDark(headerBg) ? 'FFFFFF' : '222222');

  // Secondary: template-specific > accent
  const secondary = tc?.secondary && !userCfg.accentColor ? strip(tc.secondary) : accent;

  // Layout styles with smart defaults
  const headingStyle: HeadingStyle = tc?.headingStyle ?? (headerLight ? 'bottom-border' : 'left-border');
  const itemBorder = tc?.itemBorder ?? !headerLight;

  return {
    primary, accent, secondary, headerBg, headerText, headerLight,
    headingStyle, headerAlign: tc?.headerAlign ?? 'center', itemBorder,
    fontWest: resolveExportFont(t.fontFamily).family,
    fontEast: resolveExportFont(t.fontFamily).family,
    bodySize: fs.body,
    h1Size: fs.h1,
    h2Size: fs.h2,
    h3Size: fs.h3,
    // CSS line-height 1.5 ≈ DOCX 1.15x; use *184 instead of *240 to match visual density
    lineSpacing: Math.round(t.lineSpacing * 184),
    sectionSpacing: Math.round((t.sectionSpacing || 16) * 20),
    layout: tc?.layout ?? 'single',
    sidebarWidth: tc?.sidebarWidth ?? 35,
    sidebarBg: tc?.sidebarBg ? strip(tc.sidebarBg) : 'F4F4F5',
    sidebarTextColor: tc?.sidebarTextColor ?? 'FFFFFF',
    sidebarLabelColor: tc?.sidebarLabelColor ?? 'A0AEC0',
    sidebarSections: tc?.sidebarSections ?? [],
    headerInSidebar: tc?.headerInSidebar ?? false,
    numberingInstanceCounter: 0,
  };
}

// ─── Reusable primitives ─────────────────────────────────────

function fontObj(theme: DocxTheme): IFontAttributesProperties {
  return resolveExportFont(theme.fontWest).word;
}

function run(
  text: string,
  theme: DocxTheme,
  opts?: { size?: number; bold?: boolean; italic?: boolean; color?: string },
): TextRun {
  return new TextRun({
    text,
    size: opts?.size ?? theme.bodySize,
    bold: opts?.bold,
    italics: opts?.italic,
    color: opts?.color ?? '333333',
    font: fontObj(theme),
  });
}

function richRuns(text: string, theme: DocxTheme): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push(run(text.slice(cursor, index), theme));
    runs.push(run(match[2] ?? match[3] ?? '', theme, { bold: Boolean(match[2]) }));
    cursor = index + match[0].length;
  }
  if (cursor < text.length) runs.push(run(text.slice(cursor), theme));
  return runs.length ? runs : [run('', theme)];
}

function bodyParagraphs(text: string, theme: DocxTheme, extra?: { before?: number; after?: number }): Paragraph[] {
  const blocks = parseRichText(text);
  const visibleIndexes = blocks.flatMap((block, index) => block.text ? [index] : []);
  const firstIndex = visibleIndexes[0];
  const lastIndex = visibleIndexes.at(-1);
  const paragraphs: Paragraph[] = [];
  let orderedInstance: number | null = null;
  blocks.forEach((block, index) => {
    if (!block.text) {
      orderedInstance = null;
      return;
    }
    if (block.kind === 'ordered' && orderedInstance === null) {
      theme.numberingInstanceCounter += 1;
      orderedInstance = theme.numberingInstanceCounter;
    } else if (block.kind !== 'ordered') {
      orderedInstance = null;
    }
    paragraphs.push(new Paragraph({
      children: richRuns(block.text, theme),
      spacing: {
        line: theme.lineSpacing,
        ...(index === firstIndex && extra?.before !== undefined ? { before: extra.before } : {}),
        ...(index === lastIndex && extra?.after !== undefined ? { after: extra.after } : {}),
      },
      ...(block.kind === 'bullet'
        ? { bullet: { level: block.indent } }
        : block.kind === 'ordered'
          ? { numbering: { reference: 'jade-rich-numbered', level: block.indent, instance: orderedInstance ?? undefined } }
          : block.indent > 0 ? { indent: { left: block.indent * 360 } } : {}),
    }));
  });
  return paragraphs;
}

function bullet(text: string, theme: DocxTheme): Paragraph {
  return new Paragraph({
    children: richRuns(text, theme),
    bullet: { level: 0 },
    spacing: { line: theme.lineSpacing, after: 40 },
  });
}

type DocxChild = Paragraph | Table;

function noBorderCell(children: (Paragraph | Table)[], width?: number): TableCell {
  return new TableCell({
    children,
    ...(width != null ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
  });
}

function twoColRow(left: TextRun[], right: TextRun[], leftWidth = 75): Table {
  return new Table({
    borders: TableBorders.NONE,
    rows: [new TableRow({
      children: [
        noBorderCell([new Paragraph({ children: left })], leftWidth),
        noBorderCell([new Paragraph({ children: right, alignment: AlignmentType.RIGHT })], 100 - leftWidth),
      ],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function matchingBorders(color: string): ITableCellBorders {
  const b: IBorderOptions = { style: BorderStyle.SINGLE, size: 1, color };
  return { top: b, bottom: b, left: b, right: b };
}

function borderedItem(children: DocxChild[], borderColor: string): Table {
  return new Table({
    borders: TableBorders.NONE,
    rows: [new TableRow({
      children: [new TableCell({
        children,
        borders: {
          left: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        margins: { left: 120, top: 40, bottom: 40, right: 0 },
      })],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function spacer(after = 100): Paragraph {
  return new Paragraph({ spacing: { after } });
}

/** Optionally wrap item children in a left-border cell */
function wrapItem(children: DocxChild[], borderColor: string, useBorder: boolean): DocxChild[] {
  if (useBorder) return [borderedItem(children, borderColor), spacer(60)];
  return [...children, spacer(80)];
}

// ─── Section heading (3 variants) ────────────────────────────

function sectionHeading(title: string, theme: DocxTheme): DocxChild[] {
  switch (theme.headingStyle) {
    case 'plain':
      return [new Paragraph({
        children: [run(title.toUpperCase(), theme, { size: theme.bodySize - 2, bold: true, color: theme.accent })],
        spacing: { before: theme.sectionSpacing, after: 80 },
      })];
    case 'bg-badge': {
      const textColor = isDark(theme.accent) ? 'FFFFFF' : '222222';
      return [
        spacer(theme.sectionSpacing),
        new Table({
          borders: TableBorders.NONE,
          rows: [new TableRow({
            children: [new TableCell({
              children: [new Paragraph({
                children: [run(title.toUpperCase(), theme, { size: theme.h2Size, bold: true, color: textColor })],
              })],
              shading: { type: ShadingType.CLEAR, fill: theme.accent, color: 'auto' },
              borders: matchingBorders(theme.accent),
              margins: { top: 40, bottom: 40, left: 140, right: 140 },
            })],
          })],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        spacer(120),
      ];
    }
    case 'bottom-border':
      return [new Paragraph({
        children: [run(title.toUpperCase(), theme, { size: theme.h2Size, bold: true, color: theme.primary })],
        spacing: { before: theme.sectionSpacing, after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.accent, space: 4 },
        },
      })];
    case 'left-border':
    default:
      return [new Paragraph({
        children: [run(title.toUpperCase(), theme, { size: theme.h2Size, bold: true, color: theme.accent })],
        spacing: { before: theme.sectionSpacing, after: 120 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 18, color: theme.accent, space: 8 },
        },
        indent: { left: 120 },
      })];
  }
}

// ─── Header (dark-bg vs light) ───────────────────────────────

function tryParseImage(avatar: string): { data: Buffer; ext: 'png' | 'jpg' | 'gif' } | null {
  const m = avatar.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/);
  if (!m) return null;
  try {
    return { data: Buffer.from(m[2], 'base64'), ext: m[1] === 'jpeg' ? 'jpg' : m[1] as 'png' | 'gif' };
  } catch { return null; }
}

function buildContactParts(info: PersonalInfoContent): string[] {
  const parts: string[] = [];
  if (info.age) parts.push(info.age);
  if (info.gender) parts.push(info.gender);
  if (info.politicalStatus) parts.push(info.politicalStatus);
  if (info.ethnicity) parts.push(info.ethnicity);
  if (info.hometown) parts.push(info.hometown);
  if (info.maritalStatus) parts.push(info.maritalStatus);
  if (info.yearsOfExperience) parts.push(info.yearsOfExperience);
  if (info.educationLevel) parts.push(info.educationLevel);
  if (info.email) parts.push(info.email);
  if (info.phone) parts.push(info.phone);
  if (info.wechat) parts.push(info.wechat);
  if (info.location) parts.push(info.location);
  if (info.website) parts.push(info.website);
  if (info.linkedin) parts.push(info.linkedin);
  if (info.github) parts.push(info.github);
  for (const link of info.customLinks || []) {
    if (link.url) parts.push(`${link.label}: ${link.url}`);
  }
  return parts;
}

function buildHeaderDark(info: PersonalInfoContent, theme: DocxTheme): DocxChild[] {
  const tc = theme.headerText;
  const headerParas: Paragraph[] = [];

  if (info.fullName) {
    headerParas.push(new Paragraph({
      children: [run(info.fullName, theme, { size: theme.h1Size, bold: true, color: tc })],
      spacing: { after: 80 },
    }));
  }
  if (info.jobTitle) {
    headerParas.push(new Paragraph({
      children: [run(info.jobTitle, theme, { size: theme.h3Size, color: theme.accent })],
      spacing: { after: 160 },
    }));
  }
  const parts = buildContactParts(info);
  if (parts.length) {
    headerParas.push(new Paragraph({
      children: [run(parts.join('  |  '), theme, { size: theme.bodySize - 2, color: tc })],
    }));
  }

  const bg = theme.headerBg;
  const shading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' };
  const cellBorders = matchingBorders(bg);
  const cellMargins = { top: 300, bottom: 300, left: 400, right: 400 };
  const img = info.avatar ? tryParseImage(info.avatar) : null;

  let headerTable: Table;
  if (img) {
    const avatarRun = new ImageRun({
      data: img.data,
      transformation: { width: 72, height: 72 },
      type: img.ext === 'jpg' ? 'jpg' : 'png',
    });
    headerTable = new Table({
      borders: TableBorders.NONE,
      rows: [new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [avatarRun] })],
            width: { size: 12, type: WidthType.PERCENTAGE },
            shading, borders: cellBorders, margins: cellMargins,
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          new TableCell({
            children: headerParas,
            width: { size: 88, type: WidthType.PERCENTAGE },
            shading, borders: cellBorders, margins: cellMargins,
          }),
        ],
      })],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  } else {
    headerTable = new Table({
      borders: TableBorders.NONE,
      rows: [new TableRow({
        children: [new TableCell({
          children: headerParas,
          shading, borders: cellBorders, margins: cellMargins,
        })],
      })],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  return [headerTable, new Paragraph({
    spacing: { before: 0, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.accent } },
  }), spacer(160)];
}

function buildHeaderLight(info: PersonalInfoContent, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [];
  const align = theme.headerAlign === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER;

  if (info.fullName) {
    res.push(new Paragraph({
      children: [run(info.fullName, theme, { size: theme.h1Size, bold: theme.headerAlign !== 'left', color: theme.primary })],
      alignment: align,
      spacing: { after: 60 },
    }));
  }
  if (info.jobTitle) {
    res.push(new Paragraph({
      children: [run(info.jobTitle, theme, { size: theme.h3Size, color: '52525b' })],
      alignment: align,
      spacing: { after: 100 },
    }));
  }
  const parts = buildContactParts(info);
  if (parts.length) {
    res.push(new Paragraph({
      children: [run(parts.join('   '), theme, { size: theme.bodySize - 2, color: '52525b' })],
      alignment: align,
      spacing: { after: 60 },
    }));
  }

  // Separator line (skip for plain/minimal style)
  if (theme.headingStyle !== 'plain') {
    res.push(new Paragraph({
      spacing: { before: 60, after: 0 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.accent, space: 4 } },
    }));
  }
  res.push(spacer(120));

  return res;
}

function buildHeader(info: PersonalInfoContent, theme: DocxTheme): DocxChild[] {
  return theme.headerLight
    ? buildHeaderLight(info, theme)
    : buildHeaderDark(info, theme);
}

// ─── Section builders ────────────────────────────────────────

function buildSummary(c: SummaryContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  if (c.text) res.push(...bodyParagraphs(c.text, theme));
  return res;
}

function buildWorkExperience(c: WorkExperienceContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of c.items || []) {
    const dateStr = item.current
      ? `${safe(item.startDate)} - Present`
      : `${safe(item.startDate)} - ${safe(item.endDate)}`;

    const itemChildren: DocxChild[] = [];

    itemChildren.push(twoColRow(
      [run(safe(item.position), theme, { bold: true, size: theme.h3Size, color: theme.primary })],
      [run(dateStr, theme, { color: '71717a', size: theme.bodySize - 2 })],
    ));

    const companyParts = [safe(item.company)];
    if (item.location) companyParts.push(item.location);
    if (item.company) {
      itemChildren.push(new Paragraph({
        children: [run(companyParts.join(' · '), theme, { color: theme.accent })],
        spacing: { after: 60 },
      }));
    }

    if (item.description) itemChildren.push(...bodyParagraphs(item.description, theme, { before: 40, after: 40 }));

    if (item.technologies?.length) {
      itemChildren.push(new Paragraph({
        children: [
          run('Technologies: ', theme, { bold: true, color: '666666', size: theme.bodySize - 2 }),
          run(item.technologies.join(', '), theme, { color: '666666', size: theme.bodySize - 2 }),
        ],
        spacing: { before: 40, after: 40 },
      }));
    }

    for (const h of item.highlights || []) { if (h) itemChildren.push(bullet(h, theme)); }

    res.push(...wrapItem(itemChildren, theme.accent, theme.itemBorder));
  }
  return res;
}

function buildEducation(c: EducationContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of c.items || []) {
    const dateStr = `${safe(item.startDate)} - ${safe(item.endDate)}`;
    const itemChildren: DocxChild[] = [];

    itemChildren.push(new Paragraph({
      children: [run(safe(item.institution), theme, { bold: true, size: theme.h3Size, color: theme.primary })],
      spacing: { after: 40 },
    }));

    itemChildren.push(new Paragraph({
      children: [run(`${safe(item.degree)}${item.field ? ` - ${item.field}` : ''}`, theme)],
      spacing: { after: 40 },
    }));

    itemChildren.push(new Paragraph({
      children: [run(dateStr, theme, { color: '71717a', size: theme.bodySize - 2 })],
      spacing: { after: 40 },
    }));

    if (item.gpa) {
      itemChildren.push(new Paragraph({
        children: [
          run('GPA: ', theme, { bold: true, color: '666666' }),
          run(item.gpa, theme, { color: '666666' }),
        ],
        spacing: { before: 40 },
      }));
    }

    for (const h of item.highlights || []) { if (h) itemChildren.push(bullet(h, theme)); }

    res.push(...wrapItem(itemChildren, theme.secondary, theme.itemBorder));
  }
  return res;
}

function buildSkills(c: SkillsContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const cat of c.categories || []) {
    if (!cat.skills?.length) continue;
    res.push(new Paragraph({
      children: [
        run(`${safe(cat.name)}: `, theme, { bold: true, color: theme.primary }),
        run(cat.skills.join(', '), theme),
      ],
      spacing: { after: 60, line: theme.lineSpacing },
    }));
  }
  return res;
}

function buildProjects(c: ProjectsContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of c.items || []) {
    const dateStr = item.startDate ? `${item.startDate}${item.endDate ? ` - ${item.endDate}` : ''}` : '';
    const itemChildren: DocxChild[] = [];

    const nameRuns: TextRun[] = [run(safe(item.name), theme, { bold: true, size: theme.h3Size, color: theme.primary })];
    if (item.url) nameRuns.push(run(`  ${item.url}`, theme, { color: theme.accent, size: theme.bodySize - 2 }));
    itemChildren.push(twoColRow(
      nameRuns,
      [run(dateStr, theme, { color: '71717a', size: theme.bodySize - 2 })],
    ));

    if (item.description) itemChildren.push(...bodyParagraphs(item.description, theme, { before: 40, after: 40 }));

    if (item.technologies?.length) {
      itemChildren.push(new Paragraph({
        children: [
          run('Technologies: ', theme, { bold: true, color: '666666', size: theme.bodySize - 2 }),
          run(item.technologies.join(', '), theme, { color: '666666', size: theme.bodySize - 2 }),
        ],
        spacing: { before: 40, after: 40 },
      }));
    }

    for (const h of item.highlights || []) { if (h) itemChildren.push(bullet(h, theme)); }

    res.push(...wrapItem(itemChildren, theme.accent, theme.itemBorder));
  }
  return res;
}

function buildCertifications(c: CertificationsContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of c.items || []) {
    const itemChildren: DocxChild[] = [];
    const parts: TextRun[] = [run(safe(item.name), theme, { bold: true, color: theme.primary })];
    if (item.issuer) parts.push(run(` — ${safe(item.issuer)}`, theme, { color: '666666' }));
    itemChildren.push(new Paragraph({ children: parts, spacing: { after: 20 } }));
    if (item.date) {
      itemChildren.push(new Paragraph({
        children: [run(safe(item.date), theme, { color: '71717a', size: theme.bodySize - 2 })],
      }));
    }
    res.push(...wrapItem(itemChildren, theme.secondary, theme.itemBorder));
  }
  return res;
}

function buildLanguages(c: LanguagesContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of c.items || []) {
    res.push(new Paragraph({
      children: [
        run(`${safe(item.language)}: `, theme, { bold: true, color: theme.primary }),
        run(safe(item.proficiency), theme),
      ],
      spacing: { after: 60 },
    }));
  }
  return res;
}

function buildGitHub(c: GitHubContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of c.items || []) {
    const itemChildren: DocxChild[] = [];
    const nameRuns: TextRun[] = [run(safe(item.name), theme, { bold: true, size: theme.h3Size, color: theme.primary })];
    if (item.language) nameRuns.push(run(`  [${item.language}]`, theme, { color: '666666', size: theme.bodySize - 2 }));
    const rightRuns: TextRun[] = item.stars
      ? [run(`★ ${item.stars}`, theme, { color: '71717a' })]
      : [run('', theme)];
    itemChildren.push(twoColRow(nameRuns, rightRuns));
    if (item.description) itemChildren.push(...bodyParagraphs(item.description, theme, { before: 40, after: 40 }));
    if (item.repoUrl) {
      itemChildren.push(new Paragraph({
        children: [run(item.repoUrl, theme, { color: theme.accent, size: theme.bodySize - 2 })],
        spacing: { after: 80 },
      }));
    }
    res.push(...wrapItem(itemChildren, theme.accent, theme.itemBorder));
  }
  return res;
}

function buildQrCodes(c: QrCodesContent, title: string, theme: DocxTheme, qrImages: Map<string, Buffer>): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  const items = (c.items || []).filter(i => i.url);
  if (!items.length) return res;

  // Render QR codes in a grid: image + label pairs
  const qrCells: TableCell[] = [];
  for (const item of items) {
    const imgBuf = qrImages.get(item.url);
    const cellChildren: Paragraph[] = [];
    if (imgBuf) {
      cellChildren.push(new Paragraph({
        children: [new ImageRun({ data: imgBuf, transformation: { width: 72, height: 72 }, type: 'png' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      }));
    }
    cellChildren.push(new Paragraph({
      children: [run(safe(item.label), theme, { size: theme.bodySize - 4, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
    }));
    qrCells.push(new TableCell({
      children: cellChildren,
      width: { size: Math.floor(100 / Math.min(items.length, 4)), type: WidthType.PERCENTAGE },
    }));
  }

  // Split into rows of max 4
  for (let i = 0; i < qrCells.length; i += 4) {
    const rowCells = qrCells.slice(i, i + 4);
    res.push(new Table({
      borders: TableBorders.NONE,
      rows: [new TableRow({ children: rowCells })],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }
  return res;
}

function buildCustom(c: CustomContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [...sectionHeading(title, theme)];
  for (const item of (c as CustomContent).items || []) {
    const itemChildren: DocxChild[] = [];
    const nameRuns: TextRun[] = [run(safe(item.title), theme, { bold: true, size: theme.h3Size, color: theme.primary })];
    if (item.subtitle) nameRuns.push(run(` — ${item.subtitle}`, theme, { color: '666666' }));
    itemChildren.push(twoColRow(
      nameRuns,
      [run(safe(item.date), theme, { color: '71717a' })],
    ));
    if (item.description) itemChildren.push(...bodyParagraphs(item.description, theme, { before: 40, after: 40 }));
    res.push(...wrapItem(itemChildren, theme.accent, theme.itemBorder));
  }
  return res;
}

// ─── Sidebar section renderers ───────────────────────────────

function sidebarSectionHeading(title: string, theme: DocxTheme): Paragraph {
  return new Paragraph({
    children: [run(title.toUpperCase(), theme, { size: theme.bodySize, bold: true, color: theme.sidebarLabelColor })],
    spacing: { before: 200, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 2, color: theme.sidebarLabelColor, space: 4 },
    },
  });
}

function buildSidebarSkills(c: SkillsContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [sidebarSectionHeading(title, theme)];
  for (const cat of c.categories || []) {
    if (!cat.skills?.length) continue;
    res.push(new Paragraph({
      children: [
        run(`${safe(cat.name)}: `, theme, { bold: true, size: theme.bodySize - 2, color: theme.sidebarTextColor }),
        run(cat.skills.join(', '), theme, { size: theme.bodySize - 2, color: theme.sidebarTextColor }),
      ],
      spacing: { after: 40, line: theme.lineSpacing },
    }));
  }
  return res;
}

function buildSidebarLanguages(c: LanguagesContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [sidebarSectionHeading(title, theme)];
  for (const item of c.items || []) {
    res.push(new Paragraph({
      children: [
        run(safe(item.language), theme, { bold: true, size: theme.bodySize - 2, color: theme.sidebarTextColor }),
        run(` — ${safe(item.proficiency)}`, theme, { size: theme.bodySize - 2, color: theme.sidebarLabelColor }),
      ],
      spacing: { after: 40 },
    }));
  }
  return res;
}

function buildSidebarCertifications(c: CertificationsContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [sidebarSectionHeading(title, theme)];
  for (const item of c.items || []) {
    const parts: TextRun[] = [run(safe(item.name), theme, { bold: true, size: theme.bodySize - 2, color: theme.sidebarTextColor })];
    if (item.issuer) parts.push(run(` — ${safe(item.issuer)}`, theme, { size: theme.bodySize - 2, color: theme.sidebarLabelColor }));
    res.push(new Paragraph({ children: parts, spacing: { after: 40 } }));
  }
  return res;
}

function buildSidebarCustom(c: CustomContent, title: string, theme: DocxTheme): DocxChild[] {
  const res: DocxChild[] = [sidebarSectionHeading(title, theme)];
  for (const item of c.items || []) {
    res.push(new Paragraph({
      children: [run(safe(item.title), theme, { bold: true, size: theme.bodySize - 2, color: theme.sidebarTextColor })],
      spacing: { after: 20 },
    }));
    if (item.subtitle) {
      res.push(new Paragraph({
        children: [run(item.subtitle, theme, { size: theme.bodySize - 2, color: theme.sidebarLabelColor })],
        spacing: { after: 20 },
      }));
    }
    if (item.description) {
      res.push(new Paragraph({
        children: [run(item.description, theme, { size: theme.bodySize - 2, color: theme.sidebarTextColor })],
        spacing: { after: 40 },
      }));
    }
  }
  return res;
}

function buildSidebarQrCodes(c: QrCodesContent, title: string, theme: DocxTheme, qrImages: Map<string, Buffer>): DocxChild[] {
  const res: DocxChild[] = [sidebarSectionHeading(title, theme)];
  for (const item of c.items || []) {
    if (!item.url) continue;
    const imgBuf = qrImages.get(item.url);
    if (imgBuf) {
      res.push(new Paragraph({
        children: [new ImageRun({ data: imgBuf, transformation: { width: 56, height: 56 }, type: 'png' })],
        spacing: { after: 20 },
      }));
    }
    res.push(new Paragraph({
      children: [run(safe(item.label), theme, { size: theme.bodySize - 4, color: theme.sidebarLabelColor })],
      spacing: { after: 60 },
    }));
  }
  return res;
}

type Section = ReturnType<typeof visibleSections>[number];

function buildSidebarSection(section: Section, theme: DocxTheme, qrImages: Map<string, Buffer>): DocxChild[] {
  const c = section.content;
  switch (section.type) {
    case 'skills': return buildSidebarSkills(c as SkillsContent, section.title, theme);
    case 'languages': return buildSidebarLanguages(c as LanguagesContent, section.title, theme);
    case 'certifications': return buildSidebarCertifications(c as CertificationsContent, section.title, theme);
    case 'qr_codes': return buildSidebarQrCodes(c as QrCodesContent, section.title, theme, qrImages);
    case 'custom': return buildSidebarCustom(c as CustomContent, section.title, theme);
    default: return buildSidebarCustom(c as CustomContent, section.title, theme);
  }
}

// ─── Sidebar header ──────────────────────────────────────────

function buildSidebarHeader(info: PersonalInfoContent, theme: DocxTheme): DocxChild[] {
  const tc = theme.sidebarTextColor;
  const res: DocxChild[] = [];

  const img = info.avatar ? tryParseImage(info.avatar) : null;
  if (img) {
    res.push(new Paragraph({
      children: [new ImageRun({
        data: img.data,
        transformation: { width: 80, height: 80 },
        type: img.ext === 'jpg' ? 'jpg' : 'png',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }));
  }

  if (info.fullName) {
    res.push(new Paragraph({
      children: [run(info.fullName, theme, { size: theme.h2Size, bold: true, color: tc })],
      spacing: { after: 60 },
    }));
  }
  if (info.jobTitle) {
    res.push(new Paragraph({
      children: [run(info.jobTitle, theme, { size: theme.bodySize, color: theme.accent })],
      spacing: { after: 120 },
    }));
  }

  const contactFields: [string, string | undefined][] = [
    ['Age', info.age],
    ['Gender', info.gender],
    ['Political', info.politicalStatus],
    ['Ethnicity', info.ethnicity],
    ['Hometown', info.hometown],
    ['Marital', info.maritalStatus],
    ['Experience', info.yearsOfExperience],
    ['Education', info.educationLevel],
    ['Email', info.email],
    ['Phone', info.phone],
    ['WeChat', info.wechat],
    ['Location', info.location],
    ['Web', info.website],
    ['LinkedIn', info.linkedin],
    ['GitHub', info.github],
  ];
  for (const [label, value] of contactFields) {
    if (!value) continue;
    res.push(new Paragraph({
      children: [
        run(`${label}: `, theme, { bold: true, size: theme.bodySize - 2, color: theme.sidebarLabelColor }),
        run(value, theme, { size: theme.bodySize - 2, color: tc }),
      ],
      spacing: { after: 30 },
    }));
  }
  for (const link of info.customLinks || []) {
    if (!link.url) continue;
    res.push(new Paragraph({
      children: [
        run(`${link.label}: `, theme, { bold: true, size: theme.bodySize - 2, color: theme.sidebarLabelColor }),
        run(link.url, theme, { size: theme.bodySize - 2, color: tc }),
      ],
      spacing: { after: 30 },
    }));
  }

  if (res.length) res.push(spacer(80));
  return res;
}

// ─── Sidebar layout (2-column table) ─────────────────────────

function buildSidebarLayout(
  info: PersonalInfoContent,
  sections: Section[],
  theme: DocxTheme,
  qrImages: Map<string, Buffer>,
): DocxChild[] {
  const sidebarSet = new Set(theme.sidebarSections);
  const sidebarSections = sections.filter(s => sidebarSet.has(s.type));
  const mainSections = sections.filter(s => !sidebarSet.has(s.type));

  // Build sidebar content
  const sidebarChildren: DocxChild[] = [];
  if (theme.headerInSidebar) {
    sidebarChildren.push(...buildSidebarHeader(info, theme));
  }
  for (const section of sidebarSections) {
    sidebarChildren.push(...buildSidebarSection(section, theme, qrImages));
  }
  // Ensure at least one child (DOCX requires non-empty cells)
  if (!sidebarChildren.length) sidebarChildren.push(new Paragraph({}));

  // Build main content
  const mainChildren: DocxChild[] = [];
  if (!theme.headerInSidebar) {
    // Main column header for compact-style: simplified inline header
    if (info.fullName) {
      mainChildren.push(new Paragraph({
        children: [run(info.fullName, theme, { size: theme.h3Size, bold: true, color: theme.primary })],
        spacing: { after: 40 },
      }));
    }
    if (info.jobTitle) {
      mainChildren.push(new Paragraph({
        children: [run(info.jobTitle, theme, { size: theme.bodySize, color: theme.accent })],
        spacing: { after: 80 },
      }));
    }
  }
  for (const section of mainSections) {
    mainChildren.push(...buildMainSection(section, theme, qrImages));
  }
  if (!mainChildren.length) mainChildren.push(new Paragraph({}));

  const bg = theme.sidebarBg;
  const sidebarShading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' };
  const pad = { marginUnitType: WidthType.DXA, top: 400, bottom: 300, left: 350, right: 250 };

  // Use separate single-cell tables per column with TABLE-level margins (w:tblCellMar)
  // since cell-level margins (w:tcMar) are unreliable across Word renderers.
  const sidebarTable = new Table({
    borders: TableBorders.NONE,
    margins: pad,
    rows: [new TableRow({
      children: [new TableCell({ children: sidebarChildren })],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const mainTable = new Table({
    borders: TableBorders.NONE,
    margins: { marginUnitType: WidthType.DXA, top: 400, bottom: 300, left: 400, right: 400 },
    rows: [new TableRow({
      children: [new TableCell({ children: mainChildren })],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  const layoutTable = new Table({
    borders: TableBorders.NONE,
    rows: [new TableRow({
      children: [
        new TableCell({
          children: [sidebarTable],
          width: { size: theme.sidebarWidth, type: WidthType.PERCENTAGE },
          shading: sidebarShading,
          borders: matchingBorders(bg),
          verticalAlign: VerticalAlignTable.TOP,
        }),
        new TableCell({
          children: [mainTable],
          width: { size: 100 - theme.sidebarWidth, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlignTable.TOP,
        }),
      ],
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  return [layoutTable];
}

// ─── Main section dispatcher ─────────────────────────────────

function buildMainSection(section: Section, theme: DocxTheme, qrImages: Map<string, Buffer>): DocxChild[] {
  const c = section.content;
  switch (section.type) {
    case 'summary': return buildSummary(c as SummaryContent, section.title, theme);
    case 'work_experience': return buildWorkExperience(c as WorkExperienceContent, section.title, theme);
    case 'education': return buildEducation(c as EducationContent, section.title, theme);
    case 'skills': return buildSkills(c as SkillsContent, section.title, theme);
    case 'projects': return buildProjects(c as ProjectsContent, section.title, theme);
    case 'certifications': return buildCertifications(c as CertificationsContent, section.title, theme);
    case 'languages': return buildLanguages(c as LanguagesContent, section.title, theme);
    case 'github': return buildGitHub(c as GitHubContent, section.title, theme);
    case 'qr_codes': return buildQrCodes(c as QrCodesContent, section.title, theme, qrImages);
    default: return buildCustom(c as CustomContent, section.title, theme);
  }
}

// ─── Main export ─────────────────────────────────────────────

export async function generateDocxBuffer(resume: ResumeWithSections): Promise<Buffer> {
  const theme = resolveTheme(resume.themeConfig, resume.template);
  const info = getPersonalInfo(resume);
  const sections = visibleSections(resume);

  // Pre-generate QR code PNG buffers
  const qrImages = new Map<string, Buffer>();
  const qrSection = sections.find(s => s.type === 'qr_codes');
  if (qrSection) {
    const qrItems = ((qrSection.content as QrCodesContent).items || []).filter(i => i.url);
    await Promise.all(qrItems.map(async (item) => {
      try {
        const buf = await QRCode.toBuffer(item.url, { type: 'png', width: 150, margin: 1 });
        qrImages.set(item.url, buf);
      } catch { /* skip failed QR */ }
    }));
  }

  const children: DocxChild[] = [];

  if (theme.layout === 'sidebar-left') {
    if (!theme.headerInSidebar) {
      children.push(...buildHeaderDark(info, theme));
    }
    children.push(...buildSidebarLayout(info, sections, theme, qrImages));
  } else {
    children.push(...buildHeader(info, theme));
    for (const section of sections) {
      children.push(...buildMainSection(section, theme, qrImages));
    }
  }

  const margin = theme.layout === 'sidebar-left' ? 360 : 720;

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'jade-rich-numbered',
        levels: Array.from({ length: 4 }, (_, level) => ({
          level,
          format: NumberFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
        })),
      }],
    },
    sections: [{
      properties: {
        page: { margin: { top: margin, right: margin, bottom: margin, left: margin } },
      },
      children,
    }],
    styles: {
      default: {
        document: {
          run: { font: fontObj(theme), size: theme.bodySize, color: '333333' },
        },
      },
    },
  });

  const packed = Buffer.from(await Packer.toBuffer(doc));
  return embedDocxFonts(packed, resolveExportFont(theme.fontWest), JSON.stringify(resume));
}
