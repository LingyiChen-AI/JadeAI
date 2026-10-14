import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import * as mupdf from 'mupdf';
import { renderResumePdf } from './render-resume-pdf';
import { generatePdf } from './generate-pdf';
import { generateHtml } from '@/app/api/resume/[id]/export/builders';
import { generateInterviewReportHtml } from '@/app/api/interview/[id]/report/export/html';
import { pdfResumeFixture } from './resume-pdf.fixtures';
import { createPdfSnapshot } from './snapshot';
import { pdfSnapshotRequestSchema } from './snapshot-schema';
import { PDF_LAYOUTS } from './layout';

// Real Chromium is opt-in so ordinary unit tests also run without a browser.
// Avoid external font networking in this suite; the API smoke check covers it.
vi.mock('@/app/api/resume/[id]/export/builders', async importOriginal => {
  const actual = await importOriginal<typeof import('@/app/api/resume/[id]/export/builders')>();
  return { ...actual, generateHtml: async (...args: Parameters<typeof actual.generateHtml>) =>
    (await actual.generateHtml(...args)).replace(/<link\b[^>]*>/g, '') };
});

function inspectPdf(buffer: Buffer, name: string) {
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  try {
    let text = '';
    const bounds = [];
    const contentBounds: number[][] = [];
    const lineFontSizes: number[] = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      const structured = page.toStructuredText('preserve-whitespace');
      text += structured.asText();
      let lineText = '';
      let lineSize = 0;
      const extent = [Infinity, Infinity, -Infinity, -Infinity];
      structured.walk({
        beginLine: () => { lineText = ''; },
        onChar: (character, _origin, _font, size, quad) => {
          lineText += character;
          lineSize = size;
          for (let j = 0; j < quad.length; j += 2) {
            extent[0] = Math.min(extent[0], quad[j]);
            extent[1] = Math.min(extent[1], quad[j + 1]);
            extent[2] = Math.max(extent[2], quad[j]);
            extent[3] = Math.max(extent[3], quad[j + 1]);
          }
        },
        endLine: () => {
          if (/^Line\d{3}:/.test(lineText)) lineFontSizes.push(lineSize);
        },
      });
      contentBounds.push(extent);
      structured.destroy();
      bounds.push(page.getBounds());
      if (process.env.PDF_TEST_OUTPUT_DIR) {
        const pixmap = page.toPixmap(mupdf.Matrix.scale(0.75, 0.75), mupdf.ColorSpace.DeviceRGB, false);
        mkdirSync(process.env.PDF_TEST_OUTPUT_DIR, { recursive: true });
        writeFileSync(join(process.env.PDF_TEST_OUTPUT_DIR, `${name}-${i + 1}.png`), pixmap.asPNG());
        pixmap.destroy();
      }
      page.destroy();
    }
    if (process.env.PDF_TEST_OUTPUT_DIR) {
      writeFileSync(join(process.env.PDF_TEST_OUTPUT_DIR, `${name}.pdf`), buffer);
    }
    return { pages: doc.countPages(), bounds, contentBounds, lineFontSizes, text };
  } finally {
    doc.destroy();
  }
}

describe.skipIf(process.env.RUN_PDF_INTEGRATION !== '1')('real Chromium resume PDF', () => {
  it.each(PDF_LAYOUTS)('preserves literal technical text in %s snapshots', async layout => {
    const resume = pdfResumeFixture();
    delete (resume.sections[0].content as Record<string, unknown>).avatar;
    const literal = 'Promise<T> 与 List<String>\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>';
    resume.sections[2].content = { text: literal };
    const request = pdfSnapshotRequestSchema.parse({ format: 'pdf', layout, resume: createPdfSnapshot(resume) });
    const result = inspectPdf(await renderResumePdf({ ...resume, ...request.resume }, request.layout), `literal-text-${layout}`);
    expect(result.text.replace(/\s/g, '')).toContain(literal.replace(/\s/g, ''));
  }, 60_000);

  it.each([
    ['classic', 3], ['classic', 130], ['two-column', 130], ['neon', 130],
    ['sidebar', 70], ['coder', 70],
  ])('exports %s with %i lines on one continuous page', async (template, lines) => {
    const before = pdfResumeFixture(template, lines);
    const buffer = await renderResumePdf(before, 'continuous');
    const result = inspectPdf(buffer, `${template}-${lines}-continuous`);
    expect(result.pages).toBe(1);
    expect(result.bounds[0][2]).toBeCloseTo(210 / 25.4 * 72, 0);
    if (lines > 70) expect(result.bounds[0][3]).toBeGreaterThan(297 / 25.4 * 72);
    else if (lines === 3) expect(result.bounds[0][3]).toBeLessThan(297 / 25.4 * 72);
    for (let i = 0; i < lines; i++) expect(result.text).toContain(`Line${String(i).padStart(3, '0')}`);
    expect(result.text).toContain('LAST_LINE_SENTINEL');
    expect(result.text).toContain('最后一行');
    expect(result.text.replace(/\s/g, '')).toContain('BOTTOM_QR_SENTINEL');
    expect(result.lineFontSizes).toHaveLength(lines);
    // 14 CSS pixels at 96dpi must remain 10.5 PDF points, even on long pages.
    for (const size of result.lineFontSizes) expect(size).toBeCloseTo(10.5, 3);
    const extent = result.contentBounds[0];
    expect(extent[0]).toBeGreaterThanOrEqual(0);
    expect(extent[1]).toBeGreaterThanOrEqual(0);
    expect(extent[2]).toBeLessThanOrEqual(result.bounds[0][2]);
    expect(extent[3]).toBeLessThanOrEqual(result.bounds[0][3]);
    expect(before).toEqual(pdfResumeFixture(template, lines));
  }, 60_000);

  it('keeps both A4 layouts and legacy fitOnePage behavior', async () => {
    const resume = pdfResumeFixture('classic', 130);
    for (const layout of ['a4', 'fit-one-page'] as const) {
      const result = inspectPdf(await renderResumePdf(resume, layout), `classic-130-${layout}`);
      expect(result.pages).toBeGreaterThan(1);
      expect(result.text).toContain('LAST_LINE_SENTINEL');
      expect(result.text.replace(/\s/g, '')).toContain('BOTTOM_QR_SENTINEL');
      for (const bounds of result.bounds) {
        // Chromium rounds the standard A4 format to device pixels.
        expect(Math.abs(bounds[2] - 595.28)).toBeLessThan(1);
        expect(Math.abs(bounds[3] - 841.89)).toBeLessThan(1);
      }
    }
    const html = await generateHtml(pdfResumeFixture('classic', 35), true);
    const legacy = inspectPdf(await generatePdf(html, { fitOnePage: true }), 'legacy-fit-one-page');
    const explicit = inspectPdf(await generatePdf(html, { layout: 'fit-one-page' }), 'explicit-fit-one-page');
    expect(legacy.pages).toBe(explicit.pages);
    expect(legacy.text).toBe(explicit.text);
  }, 60_000);

  it('preserves the interview report default A4 output', async () => {
    const html = generateInterviewReportHtml({
      overallScore: 85, overallFeedback: 'INTERVIEW_REPORT_SENTINEL', roundEvaluations: [],
      dimensionScores: [], improvementPlan: [], strengths: [], weaknesses: [],
    }, { jobTitle: 'Engineer', createdAt: new Date(0) });
    const result = inspectPdf(await generatePdf(html), 'interview-report');
    expect(result.pages).toBeGreaterThanOrEqual(1);
    expect(Math.abs(result.bounds[0][2] - 595.28)).toBeLessThan(1);
    expect(Math.abs(result.bounds[0][3] - 841.89)).toBeLessThan(1);
    expect(result.text).toContain('INTERVIEW_REPORT_SENTINEL');
  }, 60_000);

  it('rejects excessive height instead of clipping or shrinking', async () => {
    await expect(renderResumePdf(pdfResumeFixture('classic', 1000), 'continuous'))
      .rejects.toThrow('Use an A4 layout');
    // A subsequent render must succeed after the failure cleanup.
    expect(inspectPdf(await renderResumePdf(pdfResumeFixture(), 'continuous'), 'after-height-error').pages).toBe(1);
  }, 60_000);

  it('bounds resource waiting and recovers after a stalled image', async () => {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    try {
      const resume = pdfResumeFixture();
      resume.sections[0].content = { fullName: 'Stalled avatar', avatar: `http://127.0.0.1:${address.port}/image` };
      const started = Date.now();
      await expect(renderResumePdf(resume, 'continuous')).rejects.toThrow(/timeout|timed out/i);
      expect(Date.now() - started).toBeLessThan(30_000);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    expect(inspectPdf(await renderResumePdf(pdfResumeFixture(), 'continuous'), 'after-resource-error').pages).toBe(1);
  }, 60_000);
});
