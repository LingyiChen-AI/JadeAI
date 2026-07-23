import { describe, expect, test } from 'vitest';

import type { TemplateManifestV1, TemplateManifestV2 } from '@/types/template';

import { resolveEffectiveTemplateStyle } from './effective-template-style';

const v1Manifest: TemplateManifestV1 = {
  schemaVersion: 1,
  rendererKind: 'declarative-v1',
  layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
  typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10, lineHeight: 1.4, headingScale: 1.25 },
  colors: { text: '#111111', muted: '#666666', accent: '#123456', background: '#ffffff' },
  spacing: { pageMarginMm: 12, sectionGapMm: 6 },
  sectionSlots: [],
  sectionStyles: [],
  features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
};

const v2Manifest: TemplateManifestV2 = {
  schemaVersion: 2,
  rendererKind: 'declarative-v2',
  layout: { type: 'two-column', sidebarPosition: 'right', sidebarWidthPercent: 35, columnGapMm: 7 },
  typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 11, lineHeight: 1.45, headingScale: 1.3 },
  colors: { text: '#222222', muted: '#777777', accent: '#234567', background: '#fefefe' },
  spacing: { pageMarginMm: 14, sectionGapMm: 5 },
  sectionSlots: [],
  sectionStyles: [],
  features: { showAvatar: true, showQrCodes: true, showPageNumbers: true, maxPages: 5 },
  header: { variant: 'band', contactLayout: 'separated' },
  entry: { variant: 'timeline' },
  section: { headingVariant: 'side-rule' },
  skills: { variant: 'compact-grid' },
  decoration: { variant: 'corner-accent' },
  density: 'compact',
  palette: { secondary: '#334455', surface: '#f8f8f8', border: '#cccccc' },
  border: { widthPt: 1.5, radiusMm: 2 },
};

describe('resolveEffectiveTemplateStyle', () => {
  test('applies valid theme settings to a V1 manifest', () => {
    const style = resolveEffectiveTemplateStyle(v1Manifest, {
      primaryColor: '#ABCDEF', accentColor: '#FEDCBA', fontFamily: 'Inter', fontSize: 'large',
      lineSpacing: 2, sectionSpacing: 16, margin: { top: 20, right: 10, bottom: 0, left: 30 }, avatarStyle: 'circle',
    });

    expect(style.headingColor).toBe('#ABCDEF');
    expect(style.colors.accent).toBe('#FEDCBA');
    expect(style.typography).toMatchObject({ fontFamily: 'noto-sans-sc', baseFontSizePt: 11, lineHeight: 2 });
    expect(style.spacing.sectionGapMm).toBe(4.233);
    expect(style.pageMarginMm).toEqual({ top: 5.292, right: 2.646, bottom: 0, left: 7.938 });
    expect(style.avatarStyle).toBe('circle');
    expect(style.presentation).toBeUndefined();
  });

  test('applies a partial historical config without replacing absent manifest fields', () => {
    const style = resolveEffectiveTemplateStyle(v1Manifest, {
      accentColor: '#A1B2C3',
      fontSize: 'medium',
      margin: { right: 24 },
    });

    expect(style.headingColor).toBe(v1Manifest.colors.text);
    expect(style.colors).toEqual({ ...v1Manifest.colors, accent: '#A1B2C3' });
    expect(style.typography).toEqual(v1Manifest.typography);
    expect(style.spacing).toEqual(v1Manifest.spacing);
    expect(style.pageMarginMm).toEqual({ top: 12, right: 6.35, bottom: 12, left: 12 });
    expect(style.avatarStyle).toBe('oneInch');
  });

  test('preserves defaults for invalid values and resolves V2 presentation unchanged', () => {
    const style = resolveEffectiveTemplateStyle(v2Manifest, {
      primaryColor: 'red', accentColor: '#12345', fontFamily: 'Comic Sans MS', fontSize: 'huge',
      lineSpacing: Infinity, sectionSpacing: 99, margin: { top: -1, right: 'bad', bottom: 60, left: NaN }, avatarStyle: 'square',
    });

    expect(style.headingColor).toBe(v2Manifest.colors.text);
    expect(style.colors).toEqual(v2Manifest.colors);
    expect(style.typography).toEqual(v2Manifest.typography);
    expect(style.spacing).toEqual(v2Manifest.spacing);
    expect(style.pageMarginMm).toEqual({ top: 14, right: 14, bottom: 15.875, left: 14 });
    expect(style.fontFamily).toBe('noto-sans-sc');
    expect(style.avatarStyle).toBe('oneInch');
    expect(style.presentation).toEqual({
      header: v2Manifest.header, entry: v2Manifest.entry, section: v2Manifest.section, skills: v2Manifest.skills,
      decoration: v2Manifest.decoration, density: v2Manifest.density, palette: v2Manifest.palette, border: v2Manifest.border,
    });
  });

  test('accepts absent or non-record theme config without changing manifest defaults', () => {
    expect(resolveEffectiveTemplateStyle(v1Manifest, null)).toMatchObject({
      headingColor: v1Manifest.colors.text, colors: v1Manifest.colors, typography: v1Manifest.typography,
      spacing: v1Manifest.spacing, pageMarginMm: { top: 12, right: 12, bottom: 12, left: 12 }, avatarStyle: 'oneInch',
    });
    expect(resolveEffectiveTemplateStyle(v1Manifest, undefined)).toEqual(resolveEffectiveTemplateStyle(v1Manifest, {}));
    expect(resolveEffectiveTemplateStyle(v1Manifest, [] as unknown as Record<string, unknown>))
      .toEqual(resolveEffectiveTemplateStyle(v1Manifest, {}));
  });
});
