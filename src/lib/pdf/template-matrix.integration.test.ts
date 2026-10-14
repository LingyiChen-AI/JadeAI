import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import * as mupdf from 'mupdf';
import { TEMPLATES } from '@/lib/constants';
import { PDF_LAYOUTS } from './layout';
import { renderResumePdf } from './render-resume-pdf';
import { pdfResumeFixture } from './resume-pdf.fixtures';

// Keep the full matrix deterministic and offline. Browser smoke tests cover web fonts.
vi.mock('@/app/api/resume/[id]/export/builders', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/api/resume/[id]/export/builders')>();
  return { ...actual, generateHtml: async (...args: Parameters<typeof actual.generateHtml>) =>
    (await actual.generateHtml(...args)).replace(/<link\b[^>]*>/g, '') };
});

const results: { template: string; layout: string; lines: number; milliseconds: number; bytes: number; pages: number; bounds: number[][] }[] = [];
const output = process.env.PDF_TEST_OUTPUT_DIR;
const focus = new Set(['classic', 'two-column', 'sidebar', 'coder', 'neon', 'gradient', 'material', 'magazine']);
const selectedTemplates = new Set(process.env.PDF_MATRIX_TEMPLATE?.split(',').filter(Boolean) ?? []);
const matrixTemplates = selectedTemplates.size
  ? TEMPLATES.filter(template => selectedTemplates.has(template))
  : TEMPLATES;

describe.skipIf(process.env.RUN_PDF_MATRIX !== '1')('registered template PDF release matrix', () => {
  afterAll(() => {
    if (output) {
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, 'matrix.json'), JSON.stringify(results, null, 2));
    }
  });

  it.each(matrixTemplates)('%s preserves all text and page geometry in every layout', async template => {
    // Exercise short, near-A4 and long single-entry content across the registry.
    const lines = focus.has(template) ? 130 : [3, 35, 130][TEMPLATES.indexOf(template) % 3];
    for (const layout of PDF_LAYOUTS) {
      const resume = pdfResumeFixture(template, lines);
      resume.language = TEMPLATES.indexOf(template) % 2 ? 'en' : 'zh';
      const before = structuredClone(resume);
      const started = performance.now();
      const buffer = await renderResumePdf(resume, layout);
      const milliseconds = Math.round(performance.now() - started);
      const document = mupdf.Document.openDocument(buffer, 'application/pdf');
      const bounds: number[][] = [];
      let text = '';
      try {
        const pages = document.countPages();
        results.push({ template, layout, lines, milliseconds, bytes: buffer.length, pages, bounds });
        if (output) {
          mkdirSync(output, { recursive: true });
          writeFileSync(join(output, `${template}-${layout}.pdf`), buffer);
          if (focus.has(template)) {
            for (let index = 0; index < pages; index++) {
              const page = document.loadPage(index);
              try {
                const pixmap = page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false);
                try { writeFileSync(join(output, `${template}-${layout}-${index + 1}.png`), pixmap.asPNG()); }
                finally { pixmap.destroy(); }
              } finally { page.destroy(); }
            }
          }
        }
        expect(pages).toBeGreaterThan(0);
        if (layout === 'continuous') expect(pages).toBe(1);
        for (let index = 0; index < pages; index++) {
          const page = document.loadPage(index);
          const structured = page.toStructuredText();
          try {
            const rect = page.getBounds();
            bounds.push(rect);
            text += structured.asText();
            expect(Math.abs(rect[2] - rect[0] - 595.28)).toBeLessThan(1);
            if (layout !== 'continuous') expect(Math.abs(rect[3] - rect[1] - 841.89)).toBeLessThan(1);
            // Extractable glyphs can still be clipped outside the MediaBox.
            structured.walk({ onChar: (character, _origin, _font, _size, quad) => {
              if (!character.trim()) return;
              for (let coordinate = 0; coordinate < quad.length; coordinate += 2) {
                expect(quad[coordinate], `${template}/${layout}: horizontal clipping`).toBeGreaterThanOrEqual(rect[0] - 1);
                expect(quad[coordinate], `${template}/${layout}: horizontal clipping`).toBeLessThanOrEqual(rect[2] + 1);
                expect(quad[coordinate + 1], `${template}/${layout}: vertical clipping`).toBeGreaterThanOrEqual(rect[1] - 1);
                expect(quad[coordinate + 1], `${template}/${layout}: vertical clipping`).toBeLessThanOrEqual(rect[3] + 1);
              }
            } });
          } finally { structured.destroy(); page.destroy(); }
        }
        const normalizedText = text.replace(/\s/g, '');
        for (let line = 0; line < lines; line++) {
          const expected = `Line${String(line).padStart(3, '0')}`;
          // Magazine renders the first character as a floated drop cap.
          expect(normalizedText).toContain(template === 'magazine' && line === 0 ? expected.slice(1) : expected);
        }
        if (template === 'magazine') expect(normalizedText.startsWith('L')).toBe(true);
        expect(text).toContain('LAST_LINE_SENTINEL');
        expect(text).toContain('最后一行');
        expect(normalizedText).toContain('BOTTOM_QR_SENTINEL');
        expect(resume).toEqual(before);
      } finally { document.destroy(); }
    }
  }, 120_000);
});
