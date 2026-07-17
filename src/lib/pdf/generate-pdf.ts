import puppeteer, { type Page } from 'puppeteer-core';
import { accessSync } from 'fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// A4 dimensions in CSS pixels at 96 DPI
const A4_WIDTH_PX = 794;   // 210mm
const A4_HEIGHT_PX = 1123;  // 297mm
const MAX_ITERATIONS = 20;
const PDF_ASSET_ORIGIN = 'http://jadeai.local';
const PDF_FONT_FILES = new Map([
  [`${PDF_ASSET_ORIGIN}/fonts/NotoSansSC-Regular.otf`, 'NotoSansSC-Regular.otf'],
  [`${PDF_ASSET_ORIGIN}/fonts/NotoSansSC-Bold.otf`, 'NotoSansSC-Bold.otf'],
]);
const pdfFontCache = new Map<string, Promise<Buffer>>();

export function preparePdfHtml(html: string): string {
  return html.replaceAll('/fonts/NotoSansSC-Regular.otf', `${PDF_ASSET_ORIGIN}/fonts/NotoSansSC-Regular.otf`)
    .replaceAll('/fonts/NotoSansSC-Bold.otf', `${PDF_ASSET_ORIGIN}/fonts/NotoSansSC-Bold.otf`);
}

function loadPdfFont(filename: string): Promise<Buffer> {
  const cached = pdfFontCache.get(filename);
  if (cached) return cached;
  const loading = readFile(resolve(process.cwd(), 'public/fonts', filename));
  pdfFontCache.set(filename, loading);
  return loading;
}

interface PdfOptions {
  fitOnePage?: boolean;
  maxPages?: number;
}

export class TemplatePdfPageLimitError extends Error {
  readonly code = 'TEMPLATE_RENDER_LIMIT';

  constructor(readonly pageCount: number, readonly maxPages: number) {
    super('template_pdf_page_limit_exceeded');
    this.name = 'TemplatePdfPageLimitError';
  }
}

export function assertPdfPageLimit(contentHeight: number, maxPages: number, printablePageHeight = A4_HEIGHT_PX): void {
  if (!Number.isFinite(contentHeight) || contentHeight < 0) throw new Error('template_pdf_height_invalid');
  if (!Number.isInteger(maxPages) || maxPages < 1 || !Number.isFinite(printablePageHeight) || printablePageHeight <= 0) {
    throw new Error('template_pdf_page_limit_invalid');
  }
  const pageCount = Math.max(1, Math.ceil(contentHeight / printablePageHeight));
  if (pageCount > maxPages) throw new TemplatePdfPageLimitError(pageCount, maxPages);
}

// Container/host-friendly Chromium flags. --disable-dev-shm-usage avoids the
// small default /dev/shm that makes Chrome crash in Docker on constrained boxes
// (a common cause of the process dying mid-render → 502, issue #85).
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

async function getBrowser() {
  // Vercel serverless: use @sparticuz/chromium-min (downloads binary at runtime)
  if (process.env.VERCEL) {
    const chromium = await import('@sparticuz/chromium-min');
    return puppeteer.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar',
      ),
      headless: true,
    });
  }

  // Docker / self-hosted (CHROME_PATH) first, then common install locations.
  // We DON'T blindly trust CHROME_PATH: if it points at a missing binary the
  // launch throws and the whole request 500s/hangs, so verify it exists and
  // otherwise fall through to the candidates below (issue #85).
  const candidates = [
    process.env.CHROME_PATH || null,
    process.env['PROGRAMFILES'] ? `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env['PROGRAMFILES'] ? `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
    process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser-unstable',
    '/snap/bin/chromium',
  ].filter((path): path is string => Boolean(path));

  for (const path of candidates) {
    try {
      accessSync(path);
      return puppeteer.launch({
        executablePath: path,
        args: LAUNCH_ARGS,
        headless: true,
      });
    } catch {
      continue;
    }
  }

  throw new Error(
    'No Chrome/Chromium found for PDF export. Install Google Chrome / Chromium (or Microsoft Edge), ' +
    'or set CHROME_PATH to a valid Chromium binary. In Docker, `apk add chromium` and set ' +
    'CHROME_PATH=/usr/bin/chromium-browser.',
  );
}

// ─── Shrink state for iterative fitting ───────────────────────

interface ShrinkState {
  sectionSpacingDelta: number;   // cumulative px reduction from base
  lineSpacingDelta: number;      // cumulative reduction from base
  marginDelta: number;           // cumulative px reduction from base
  scalePct: number;              // 100 = no scaling, min 80
}

function buildShrinkCSS(state: ShrinkState, childPaddingBase = 0, skipBreakRules = false): string {
  const sel = '.resume-export';
  const rules: string[] = [];

  if (!skipBreakRules) {
    // Disable break-inside: avoid so content flows continuously
    // (otherwise Puppeteer pushes whole sections to next page)
    // overflow: visible is critical — Chrome treats overflow:hidden as monolithic (no fragmentation)
    rules.push(`
      ${sel} > div,
      ${sel} [data-section],
      ${sel} [data-section] *,
      ${sel} .item,
      ${sel} .rounded-lg,
      ${sel} .border-l-2,
      ${sel} ul, ${sel} ol {
        break-inside: auto !important;
        overflow: visible !important;
      }
      ${sel} h2, ${sel} h3 {
        break-after: auto !important;
      }
    `);
  }

  // Stage 1: section spacing
  if (state.sectionSpacingDelta > 0) {
    rules.push(`
      ${sel} [data-section] {
        margin-bottom: calc(var(--base-section-spacing) - ${state.sectionSpacingDelta}px) !important;
        padding-bottom: calc(var(--base-section-spacing) - ${state.sectionSpacingDelta}px) !important;
      }
    `);
  }

  // Stage 2: line spacing
  if (state.lineSpacingDelta > 0) {
    const delta = state.lineSpacingDelta.toFixed(2);
    rules.push(`
      ${sel} > div { line-height: calc(var(--base-line-spacing) - ${delta}) !important; }
      ${sel} p, ${sel} li, ${sel} span:not(.shrink-0), ${sel} td, ${sel} a {
        line-height: calc(var(--base-line-spacing) - ${delta}) !important;
      }
    `);
  }

  // Stage 3: page margin / child padding reduction
  if (state.marginDelta > 0) {
    if (childPaddingBase > 0) {
      // BACKGROUND templates: reduce child div padding (sidebar/content areas)
      const pt = Math.max(16, childPaddingBase - state.marginDelta);
      rules.push(`
        ${sel} > div > div {
          padding-top: ${pt}px !important;
          padding-bottom: ${pt}px !important;
        }
      `);
    } else {
      // Regular templates: top/bottom handled by @page margins (padding is 0),
      // only reduce left/right padding (more width → text reflows shorter)
      rules.push(`
        ${sel} > div {
          padding-left: calc(var(--base-margin-left) - ${state.marginDelta}px) !important;
          padding-right: calc(var(--base-margin-right) - ${state.marginDelta}px) !important;
        }
      `);
    }
  }

  // Stage 4: font size scaling
  if (state.scalePct < 100) {
    const factor = (state.scalePct / 100).toFixed(3);
    rules.push(`
      ${sel} p, ${sel} li, ${sel} span:not(.shrink-0), ${sel} td, ${sel} a {
        font-size: calc(var(--base-body-size) * ${factor}) !important;
      }
      ${sel} h1 { font-size: calc(var(--base-h1-size) * ${factor}) !important; }
      ${sel} h2 { font-size: calc(var(--base-h2-size) * ${factor}) !important; }
      ${sel} h3 { font-size: calc(var(--base-h3-size) * ${factor}) !important; }
    `);
  }

  return rules.join('\n');
}

async function measureHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.resume-export, .declarative-resume');
    if (!el) return 0;
    return el.scrollHeight;
  });
}

export function countGeneratedPdfPages(pdf: Buffer): number {
  const count = pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)\b/g)?.length ?? 0;
  if (count < 1) throw new Error('template_pdf_page_count_invalid');
  return count;
}

async function fitContentToOnePage(page: Page): Promise<void> {
  // Set viewport to match A4 width for accurate measurement
  await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });

  // Read base values from CSS custom properties
  const baseValues = await page.evaluate(() => {
    const el = document.querySelector('.resume-export > div') as HTMLElement | null;
    if (!el) return { sectionSpacing: 16, lineSpacing: 1.5, marginTop: 20, marginBottom: 20, needsPadding: true, childPaddingTop: 0 };
    const cs = getComputedStyle(el);
    const needsPadding = cs.getPropertyValue('--needs-padding')?.trim() === '1';
    // For BACKGROUND templates, read child div padding (sidebar/content areas)
    let childPaddingTop = 0;
    if (!needsPadding) {
      const child = el.querySelector(':scope > div') as HTMLElement | null;
      if (child) childPaddingTop = parseFloat(getComputedStyle(child).paddingTop) || 0;
    }
    return {
      sectionSpacing: parseFloat(cs.getPropertyValue('--base-section-spacing')) || 16,
      lineSpacing: parseFloat(cs.getPropertyValue('--base-line-spacing')) || 1.5,
      marginTop: parseFloat(cs.getPropertyValue('--base-margin-top')) || 20,
      marginBottom: parseFloat(cs.getPropertyValue('--base-margin-bottom')) || 20,
      needsPadding,
      childPaddingTop,
    };
  });

  // Regular templates use @page margins (top/bottom) — subtract from A4 height.
  // BACKGROUND/dark templates use @page { margin: 0 } + clone — full height usable.
  const usableHeight = baseValues.needsPadding
    ? A4_HEIGHT_PX - baseValues.marginTop - baseValues.marginBottom
    : A4_HEIGHT_PX;

  const height = await measureHeight(page);
  if (height <= usableHeight) return; // already fits

  const state: ShrinkState = {
    sectionSpacingDelta: 0,
    lineSpacingDelta: 0,
    marginDelta: 0,
    scalePct: 100,
  };

  // Stage limits
  const maxSectionDelta = Math.max(0, baseValues.sectionSpacing - 4);
  const maxLineDelta = Math.max(0, baseValues.lineSpacing - 1.15);
  // For regular templates: reduce outer div padding; for BACKGROUND: reduce child padding
  const maxMarginDelta = baseValues.needsPadding
    ? Math.max(0, baseValues.marginTop - 8)
    : Math.max(0, Math.round(baseValues.childPaddingTop - 16));
  const minScale = 80;

  let stage = 1;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Advance one step in the current stage
    if (stage === 1) {
      state.sectionSpacingDelta = Math.min(state.sectionSpacingDelta + 4, maxSectionDelta);
      if (state.sectionSpacingDelta >= maxSectionDelta) stage = 2;
    } else if (stage === 2) {
      state.lineSpacingDelta = Math.min(
        +(state.lineSpacingDelta + 0.1).toFixed(2),
        +maxLineDelta.toFixed(2),
      );
      if (state.lineSpacingDelta >= +maxLineDelta.toFixed(2)) stage = 3;
    } else if (stage === 3) {
      state.marginDelta = Math.min(state.marginDelta + 4, maxMarginDelta);
      if (state.marginDelta >= maxMarginDelta) stage = 4;
    } else if (stage === 4) {
      state.scalePct = Math.max(state.scalePct - 5, minScale);
      if (state.scalePct <= minScale) stage = 5; // exhausted
    }

    const css = buildShrinkCSS(state, baseValues.needsPadding ? 0 : baseValues.childPaddingTop);
    await page.evaluate((cssText) => {
      let styleEl = document.getElementById('__fit-one-page');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__fit-one-page';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = cssText;
    }, css);

    // Wait for reflow
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

    const newHeight = await measureHeight(page);
    if (newHeight <= usableHeight) return; // fits now

    if (stage === 5) break; // exhausted all strategies
  }
}

/** Auto-shrink content that barely exceeds one page to prevent nearly-blank second pages.
 *  Only activates when content overflows by ≤15%.  Uses light spacing/padding
 *  adjustments (no font scaling, no break-rule changes) so that if it fails,
 *  normal multi-page pagination still works correctly. */
async function preventNearlyBlankPage(page: Page): Promise<void> {
  const baseValues = await page.evaluate(() => {
    const el = document.querySelector('.resume-export > div') as HTMLElement | null;
    if (!el) return { sectionSpacing: 16, lineSpacing: 1.5, childPaddingTop: 0, needsPadding: true, marginTop: 20, marginBottom: 20 };
    const cs = getComputedStyle(el);
    const needsPadding = cs.getPropertyValue('--needs-padding')?.trim() === '1';
    let childPaddingTop = 0;
    if (!needsPadding) {
      const child = el.querySelector(':scope > div') as HTMLElement | null;
      if (child) childPaddingTop = parseFloat(getComputedStyle(child).paddingTop) || 0;
    }
    return {
      sectionSpacing: parseFloat(cs.getPropertyValue('--base-section-spacing')) || 16,
      lineSpacing: parseFloat(cs.getPropertyValue('--base-line-spacing')) || 1.5,
      childPaddingTop,
      needsPadding,
      marginTop: parseFloat(cs.getPropertyValue('--base-margin-top')) || 20,
      marginBottom: parseFloat(cs.getPropertyValue('--base-margin-bottom')) || 20,
    };
  });

  // Target height = usable area on one page
  const targetHeight = baseValues.needsPadding
    ? A4_HEIGHT_PX - baseValues.marginTop - baseValues.marginBottom
    : A4_HEIGHT_PX;

  const height = await measureHeight(page);
  // Only auto-shrink if content barely exceeds one page (within 15%)
  if (height <= targetHeight || height > targetHeight * 1.15) return;

  const state: ShrinkState = {
    sectionSpacingDelta: 0,
    lineSpacingDelta: 0,
    marginDelta: 0,
    scalePct: 100,
  };

  // Stage limits — light font scaling (cap at 95%, vs 80% for fitOnePage)
  const maxSectionDelta = Math.max(0, baseValues.sectionSpacing - 4);
  const maxLineDelta = Math.max(0, baseValues.lineSpacing - 1.15);
  const maxMarginDelta = baseValues.needsPadding
    ? Math.max(0, baseValues.marginTop - 8)
    : Math.max(0, Math.round(baseValues.childPaddingTop - 16));
  const minScale = 95; // lighter than fitOnePage (80%)

  let stage = 1;

  for (let i = 0; i < 12; i++) {
    if (stage === 1) {
      state.sectionSpacingDelta = Math.min(state.sectionSpacingDelta + 4, maxSectionDelta);
      if (state.sectionSpacingDelta >= maxSectionDelta) stage = 2;
    } else if (stage === 2) {
      state.lineSpacingDelta = Math.min(
        +(state.lineSpacingDelta + 0.1).toFixed(2),
        +maxLineDelta.toFixed(2),
      );
      if (state.lineSpacingDelta >= +maxLineDelta.toFixed(2)) stage = 3;
    } else if (stage === 3) {
      state.marginDelta = Math.min(state.marginDelta + 4, maxMarginDelta);
      if (state.marginDelta >= maxMarginDelta) stage = 4;
    } else if (stage === 4) {
      state.scalePct = Math.max(state.scalePct - 1, minScale);
      if (state.scalePct <= minScale) break; // exhausted
    }

    // skipBreakRules=true: only adjust spacing, don't touch break/overflow behaviour
    const css = buildShrinkCSS(state, baseValues.needsPadding ? 0 : baseValues.childPaddingTop, true);
    await page.evaluate((cssText) => {
      let styleEl = document.getElementById('__prevent-blank');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__prevent-blank';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = cssText;
    }, css);

    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

    const newHeight = await measureHeight(page);
    if (newHeight <= targetHeight) {
      // Content fits on one page — remove box-decoration-break:clone which
      // is only needed for multi-page pagination and can cause rendering
      // artifacts at the page boundary in single-page PDFs.
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.id = '__no-clone';
        style.textContent = `
          .resume-export > div,
          .resume-export > div > div {
            -webkit-box-decoration-break: slice !important;
            box-decoration-break: slice !important;
          }
        `;
        document.head.appendChild(style);
      });
      return;
    }
  }

  // Couldn't fit — remove auto-shrink CSS so normal pagination works cleanly
  await page.evaluate(() => {
    const el = document.getElementById('__prevent-blank');
    if (el) el.remove();
  });
}

export async function generatePdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const filename = PDF_FONT_FILES.get(request.url());
      if (filename) {
        void loadPdfFont(filename).then(
          (body) => request.respond({
            status: 200,
            contentType: 'font/otf',
            headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'private, max-age=3600' },
            body,
          }),
          () => request.abort('failed'),
        );
        return;
      }
      if (/^https?:/i.test(request.url())) {
        void request.abort('blockedbyclient');
        return;
      }
      void request.continue();
    });

    // Set viewport to A4 width before loading content for accurate layout
    await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX });

    const preparedHtml = preparePdfHtml(html);
    await page.setContent(preparedHtml, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for web fonts (e.g. Noto Sans SC) to finish loading
    await page.evaluate(() => document.fonts.ready);
    if (preparedHtml.includes(`${PDF_ASSET_ORIGIN}/fonts/`)) {
      const fontLoaded = await page.evaluate(() => document.fonts.check('12px "Noto Sans SC"'));
      if (!fontLoaded) throw new Error('pdf_bundled_font_unavailable');
    }

    // Double rAF to ensure layout is fully settled after font swap
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    ));

    if (options.fitOnePage) {
      await fitContentToOnePage(page);
    } else {
      // Auto-prevent nearly-blank second pages (e.g. sidebar-dark templates
      // where box-decoration-break:clone inflates height at page breaks)
      await preventNearlyBlankPage(page);
    }

    const pdf = await page.pdf({
      format: 'A4',
      scale: 1,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    const buffer = Buffer.from(pdf);
    if (options.maxPages !== undefined) {
      const pageCount = countGeneratedPdfPages(buffer);
      if (pageCount > options.maxPages) throw new TemplatePdfPageLimitError(pageCount, options.maxPages);
    }
    return buffer;
  } finally {
    await browser.close();
  }
}
