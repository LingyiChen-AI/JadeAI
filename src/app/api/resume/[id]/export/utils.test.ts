import { describe, expect, it } from 'vitest';

import { buildExportThemeCSS, DEFAULT_THEME, md } from './utils';

describe('resume export rich text integration', () => {
  it('renders host-safe ordered-list and indentation semantics', () => {
    const html = md('**Impact**\n\t1. Saved 20%');

    expect(html).toContain('<strong>Impact</strong>');
    expect(html).toContain('data-kind="ordered"');
    expect(html).toContain('data-indent="1"');
    expect(html).toContain('>1. </span>');
    expect(html).not.toMatch(/<(?:p|ul|ol|li|div)(?:\s|>)/);
  });

  it('resolves unsupported PDF theme fonts through the same stable registry', () => {
    const css = buildExportThemeCSS({ ...DEFAULT_THEME, fontFamily: 'Georgia' }, 'classic');

    expect(css).toContain('font-family: "Noto Sans SC", sans-serif !important');
    expect(css).not.toContain('font-family: Georgia');
    expect(css).toContain('.resume-export, .resume-export * {');
    expect(css).toContain('.resume-export *::before, .resume-export *::after {');
    expect(css).not.toMatch(/\.resume-export(?:, \.resume-export \*)?\s*\{[\s\S]*?font-weight:/);
  });
});
