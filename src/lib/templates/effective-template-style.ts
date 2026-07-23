import type { DeclarativeTemplateManifest, TemplateManifestV1, TemplateManifestV2 } from '@/types/template';

type ThemeInput = Readonly<Record<string, unknown>>;

export type EffectiveTemplateStyle = {
  headingColor: string;
  fontFamily: TemplateManifestV1['typography']['fontFamily'];
  avatarStyle: 'circle' | 'oneInch';
  typography: TemplateManifestV1['typography'];
  colors: TemplateManifestV1['colors'];
  spacing: TemplateManifestV1['spacing'];
  pageMarginMm: { top: number; right: number; bottom: number; left: number };
  presentation?: {
    header: TemplateManifestV2['header'];
    entry: TemplateManifestV2['entry'];
    section: TemplateManifestV2['section'];
    skills: TemplateManifestV2['skills'];
    decoration: TemplateManifestV2['decoration'];
    density: TemplateManifestV2['density'];
    palette: TemplateManifestV2['palette'];
    border: TemplateManifestV2['border'];
  };
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PX_TO_MM = 25.4 / 96;
const FONT_SIZE_SCALE = { small: 0.9, medium: 1, large: 1.1 } as const;

function isRecord(value: unknown): value is ThemeInput {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function pxToMm(value: number): number {
  return Math.round(value * PX_TO_MM * 1_000) / 1_000;
}

export function resolveEffectiveTemplateStyle(
  manifest: DeclarativeTemplateManifest,
  themeConfig: ThemeInput | null | undefined,
): EffectiveTemplateStyle {
  const theme = isRecord(themeConfig) ? themeConfig : {};
  const fontSizeScale = typeof theme.fontSize === 'string'
    ? FONT_SIZE_SCALE[theme.fontSize as keyof typeof FONT_SIZE_SCALE]
    : undefined;
  const margin = isRecord(theme.margin) ? theme.margin : {};
  const defaultMargin = manifest.spacing.pageMarginMm;
  const marginMm = (side: 'top' | 'right' | 'bottom' | 'left') => inRange(margin[side], 0, 60)
    ? pxToMm(margin[side])
    : defaultMargin;
  const presentation = manifest.rendererKind === 'declarative-v2'
    ? {
        header: manifest.header,
        entry: manifest.entry,
        section: manifest.section,
        skills: manifest.skills,
        decoration: manifest.decoration,
        density: manifest.density,
        palette: manifest.palette,
        border: manifest.border,
      }
    : undefined;

  return {
    headingColor: typeof theme.primaryColor === 'string' && HEX_COLOR.test(theme.primaryColor)
      ? theme.primaryColor
      : manifest.colors.text,
    fontFamily: 'noto-sans-sc',
    avatarStyle: theme.avatarStyle === 'circle' || theme.avatarStyle === 'oneInch' ? theme.avatarStyle : 'oneInch',
    typography: {
      ...manifest.typography,
      fontFamily: 'noto-sans-sc',
      ...(fontSizeScale === undefined ? {} : { baseFontSizePt: manifest.typography.baseFontSizePt * fontSizeScale }),
      lineHeight: inRange(theme.lineSpacing, 1, 2.5) ? theme.lineSpacing : manifest.typography.lineHeight,
    },
    colors: {
      ...manifest.colors,
      accent: typeof theme.accentColor === 'string' && HEX_COLOR.test(theme.accentColor)
        ? theme.accentColor
        : manifest.colors.accent,
    },
    spacing: {
      ...manifest.spacing,
      sectionGapMm: inRange(theme.sectionSpacing, 4, 32)
        ? pxToMm(theme.sectionSpacing)
        : manifest.spacing.sectionGapMm,
    },
    pageMarginMm: { top: marginMm('top'), right: marginMm('right'), bottom: marginMm('bottom'), left: marginMm('left') },
    ...(presentation ? { presentation } : {}),
  };
}
