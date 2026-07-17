import { describe, expect, test } from 'vitest';

import { TemplatePdfPageLimitError, assertPdfPageLimit, countGeneratedPdfPages, generatePdf, preparePdfHtml } from './generate-pdf';

describe('assertPdfPageLimit', () => {
  test('accepts content within the printable page budget', () => {
    expect(() => assertPdfPageLimit(2000, 2, 1000)).not.toThrow();
  });

  test('throws a stable error when content exceeds the manifest page budget', () => {
    expect(() => assertPdfPageLimit(2001, 2, 1000)).toThrowError(TemplatePdfPageLimitError);
    try {
      assertPdfPageLimit(2001, 2, 1000);
    } catch (error) {
      expect(error).toMatchObject({ code: 'TEMPLATE_RENDER_LIMIT', pageCount: 3, maxPages: 2 });
    }
  });
});

describe('preparePdfHtml', () => {
  test('routes only bundled Noto font URLs through the local PDF asset origin', () => {
    const html = '<style>url("/fonts/NotoSansSC-Regular.otf") url(/fonts/NotoSansSC-Bold.otf)</style>';
    const prepared = preparePdfHtml(html);
    expect(prepared).not.toContain('url("/fonts/');
    expect(prepared).toContain('http://jadeai.local/fonts/NotoSansSC-Regular.otf');
    expect(prepared).toContain('http://jadeai.local/fonts/NotoSansSC-Bold.otf');
  });
});

describe('generated PDF page limits', () => {
  test('counts concrete PDF page objects', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj <</Type /Pages /Count 2>> endobj\n2 0 obj <</Type /Page>> endobj\n3 0 obj <</Type /Page>> endobj');
    expect(countGeneratedPdfPages(pdf)).toBe(2);
  });

  test('rejects the actual print pagination after Chromium applies page margins and wrapping', async () => {
    const html = `<style>@page{size:A4;margin:30mm}p{font:16px sans-serif}</style><div class="resume-export"><div><p>${'wrapped content '.repeat(3_000)}</p></div></div>`;
    await expect(generatePdf(html, { maxPages: 2 })).rejects.toMatchObject({
      code: 'TEMPLATE_RENDER_LIMIT',
      maxPages: 2,
    });
  }, 30_000);

  test('loads the bundled Noto font before rendering CJK text', async () => {
    const html = '<style>@font-face{font-family:"Noto Sans SC";src:url("/fonts/NotoSansSC-Regular.otf")}body{font-family:"Noto Sans SC"}</style><div class="resume-export"><div>中文字体加载验证</div></div>';
    await expect(generatePdf(html)).resolves.toEqual(expect.objectContaining({ byteLength: expect.any(Number) }));
  }, 30_000);
});
