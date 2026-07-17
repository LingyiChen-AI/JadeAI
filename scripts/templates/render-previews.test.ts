import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateSourcePackage } from './template-toolchain';
import { assertRenderMetrics, renderTemplateMatrix } from './render-previews';

describe('external declarative render limits', () => {
  it.each([
    [{ htmlBytes: 600_000, domNodes: 100, renderMs: 10, pages: 1 }, 'template_render_html_limit'],
    [{ htmlBytes: 1_000, domNodes: 4_001, renderMs: 10, pages: 1 }, 'template_render_dom_limit'],
    [{ htmlBytes: 1_000, domNodes: 100, renderMs: 5_001, pages: 1 }, 'template_render_time_limit'],
    [{ htmlBytes: 1_000, domNodes: 100, renderMs: 10, pages: 5 }, 'template_render_page_limit'],
  ])('rejects measured budget violations', (metrics, code) => {
    expect(() => assertRenderMetrics(metrics, 4)).toThrow(code);
  });

  it('renders the checked-in zh/en, short/long, A4/Letter matrix offline', async () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const sources = await Promise.all(['jsonresume-even', 'jsonresume-onepage'].map((slug) => (
      validateSourcePackage(path.join(root, 'template-sources/external', slug))
    )));
    const result = await renderTemplateMatrix({ rootDirectory: root, sources });

    expect(result.report.cases).toHaveLength(16);
    expect(new Set(result.report.cases.map((item) => `${item.slug}:${item.language}:${item.length}:${item.paper}`)).size).toBe(16);
    expect(result.report.cases.every((item) => item.externalRequests === 0)).toBe(true);
    expect(result.report.cases.every((item) => item.domNodes > 20 && item.htmlBytes > 1_000 && item.pages >= 1)).toBe(true);
    for (const assets of result.assets.values()) {
      for (const bytes of [assets.thumbnail, assets.preview]) {
        expect(Buffer.from(bytes).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        expect(bytes.byteLength).toBeGreaterThan(1_024);
      }
    }
  }, 120_000);
});
