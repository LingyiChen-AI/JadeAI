import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import { generateHtml } from '../../src/app/api/resume/[id]/export/builders';
import type { ResumeWithSections } from '../../src/app/api/resume/[id]/export/utils';
import type { ResolvedTemplate } from '../../src/lib/templates/resolve-template';
import { loadBaselineFontAssets, resolveChromeExecutable, runWithResourceCleanup } from './collect-baseline';
import type { ValidatedSourcePackage } from './template-toolchain';
import { validateApprovedSources } from './validate';

const MAX_RENDER_HTML_BYTES = 512 * 1024;
const MAX_RENDER_DOM_NODES = 4_000;
const MAX_RENDER_MS = 5_000;

export type RenderMetrics = {
  htmlBytes: number;
  domNodes: number;
  renderMs: number;
  pages: number;
};

type MatrixCase = RenderMetrics & {
  slug: string;
  language: 'zh' | 'en';
  length: 'short' | 'long';
  paper: 'a4' | 'letter';
  externalRequests: number;
  htmlSha256: string;
};

export type TemplateRenderResult = {
  report: {
    schemaVersion: 1;
    fixturePath: string;
    fixtureSha256: string;
    network: 'disabled';
    cases: MatrixCase[];
  };
  assets: Map<string, { thumbnail: Uint8Array; preview: Uint8Array }>;
};

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function assertRenderMetrics(metrics: RenderMetrics, maxPages: number): void {
  if (metrics.htmlBytes > MAX_RENDER_HTML_BYTES) throw new Error('template_render_html_limit');
  if (metrics.domNodes > MAX_RENDER_DOM_NODES) throw new Error('template_render_dom_limit');
  if (metrics.renderMs > MAX_RENDER_MS) throw new Error('template_render_time_limit');
  if (metrics.pages > maxPages) throw new Error('template_render_page_limit');
}

function paperDimensions(paper: 'a4' | 'letter'): { width: number; height: number; css: string; maxWidth: string } {
  return paper === 'a4'
    ? { width: 794, height: 1123, css: 'A4', maxWidth: '210mm' }
    : { width: 816, height: 1056, css: 'Letter', maxWidth: '216mm' };
}

function forPaper(html: string, paper: 'a4' | 'letter'): string {
  const dimensions = paperDimensions(paper);
  return html
    .replace('@page { size: A4;', `@page { size: ${dimensions.css};`)
    .replace('max-width: 210mm;', `max-width: ${dimensions.maxWidth};`);
}

function shortResume(resume: ResumeWithSections): ResumeWithSections {
  const retained = new Set(['personal_info', 'summary', 'work_experience', 'education']);
  return {
    ...structuredClone(resume),
    title: `${resume.title} - short`,
    sections: resume.sections.filter((section) => retained.has(section.type)).map((section) => {
      const cloned = structuredClone(section);
      if (cloned.content && typeof cloned.content === 'object') {
        for (const key of ['items', 'categories'] as const) {
          const value = (cloned.content as Record<string, unknown>)[key];
          if (Array.isArray(value)) (cloned.content as Record<string, unknown>)[key] = value.slice(0, 1);
        }
      }
      return cloned;
    }),
  };
}

function resolved(source: ValidatedSourcePackage): ResolvedTemplate {
  const shared = {
    source: 'local-snapshot',
    degraded: false,
    capabilities: {
      supportedSections: source.manifest.sectionSlots.map((slot) => slot.sectionType),
      paperSizes: ['a4', 'letter'] as Array<'a4' | 'letter'>,
      supportsAvatar: source.manifest.features.showAvatar,
      atsCompatible: source.manifest.layout.type === 'single-column',
      supportsZh: true,
      supportsEn: true,
      supportsHtml: true,
      supportsPdf: true,
      docxFidelity: 'generic' as const,
    },
  };
  return source.manifest.rendererKind === 'declarative-v2'
    ? { ...shared, source: 'local-snapshot', kind: 'declarative-v2', manifest: source.manifest }
    : { ...shared, source: 'local-snapshot', kind: 'declarative-v1', manifest: source.manifest };
}

async function startFontServer(rootDirectory: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const routes = new Map([
    ['/NotoSansSC-Regular.otf', path.join(rootDirectory, 'public/fonts/NotoSansSC-Regular.otf')],
    ['/NotoSansSC-Bold.otf', path.join(rootDirectory, 'public/fonts/NotoSansSC-Bold.otf')],
  ]);
  const server = createServer(async (request, response) => {
    const file = routes.get(request.url || '');
    if (!file) { response.writeHead(404).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'Content-Type': 'font/otf',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': bytes.byteLength,
    });
    response.end(bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('template_render_font_server_failed');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function injectFonts(html: string, css: string): string {
  if (!html.includes('</head>')) throw new Error('template_render_html_invalid');
  return html.replace('</head>', `<style data-template-fonts>${css}</style></head>`);
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function previewFrame(html: string, viewportWidth: number, viewportHeight: number, paper: 'a4' | 'letter'): string {
  const dimensions = paperDimensions(paper);
  const inset = viewportWidth <= 400 ? 8 : 20;
  const scale = Math.min(
    (viewportWidth - inset * 2) / dimensions.width,
    (viewportHeight - inset * 2) / dimensions.height,
  );
  const renderedWidth = dimensions.width * scale;
  const renderedHeight = dimensions.height * scale;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e4e7eb}
    main{position:relative;width:100%;height:100%}
    iframe{position:absolute;left:${(viewportWidth - renderedWidth) / 2}px;top:${(viewportHeight - renderedHeight) / 2}px;width:${dimensions.width}px;height:${dimensions.height}px;border:0;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.2);transform:scale(${scale});transform-origin:top left}
  </style></head><body><main><iframe title="Fixed template preview" srcdoc="${escapeAttribute(html)}"></iframe></main></body></html>`;
}

async function screenshot(page: Page, html: string, width: number, height: number): Promise<Buffer> {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(previewFrame(html, width, height, 'a4'), { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  if (!frame) throw new Error('template_render_frame_missing');
  await frame.evaluate(async () => { await document.fonts.ready; });
  return Buffer.from(await page.screenshot({ type: 'png', captureBeyondViewport: false }));
}

export async function renderTemplateMatrix(options: {
  rootDirectory: string;
  sources: ValidatedSourcePackage[];
}): Promise<TemplateRenderResult> {
  return runWithResourceCleanup(async (defer) => {
    const fixturePath = 'test-fixtures/templates/legacy-baseline-resume.json';
    const fixtureBytes = await readFile(path.join(options.rootDirectory, fixturePath));
    const fixture = JSON.parse(fixtureBytes.toString('utf8')) as Record<'zh' | 'en', ResumeWithSections>;
    const fontServer = await startFontServer(options.rootDirectory);
    let browser: Browser;
    try {
      browser = await puppeteer.launch({
        executablePath: await resolveChromeExecutable(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch (error) {
      await fontServer.close();
      throw error;
    }
    let page: Page;
    try {
      page = await browser.newPage();
    } catch (error) {
      await browser.close();
      await fontServer.close();
      throw error;
    }
    defer(() => page.close());
    defer(() => browser.close());
    defer(() => fontServer.close());
    const fontAssets = await loadBaselineFontAssets(options.rootDirectory, fontServer.origin);
    let externalRequests = 0;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith(`${fontServer!.origin}/`)) void request.continue();
      else if (/^https?:/i.test(request.url())) { externalRequests += 1; void request.abort(); }
      else void request.continue();
    });

    const cases: MatrixCase[] = [];
    const assets = new Map<string, { thumbnail: Uint8Array; preview: Uint8Array }>();
    for (const source of [...options.sources].sort((left, right) => left.metadata.slug.localeCompare(right.metadata.slug))) {
      let representativeHtml = '';
      for (const language of ['zh', 'en'] as const) {
        for (const length of ['short', 'long'] as const) {
          for (const paper of ['a4', 'letter'] as const) {
            const resume = length === 'short' ? shortResume(fixture[language]) : structuredClone(fixture[language]);
            const plainHtml = forPaper(await generateHtml(resume, false, resolved(source)), paper);
            const htmlBytes = Buffer.byteLength(plainHtml);
            const html = injectFonts(plainHtml, fontAssets.css);
            const dimensions = paperDimensions(paper);
            await page.setViewport({ width: dimensions.width, height: dimensions.height, deviceScaleFactor: 1 });
            const requestsBefore = externalRequests;
            const started = performance.now();
            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: MAX_RENDER_MS });
            await page.evaluate(async () => { await document.fonts.ready; });
            const renderMs = performance.now() - started;
            const measured = await page.evaluate((pageHeight) => ({
              domNodes: document.querySelectorAll('*').length,
              pages: Math.max(1, Math.ceil(document.documentElement.scrollHeight / pageHeight)),
            }), dimensions.height);
            const metrics = { htmlBytes, domNodes: measured.domNodes, renderMs, pages: measured.pages };
            assertRenderMetrics(metrics, source.manifest.features.maxPages);
            cases.push({
              slug: source.metadata.slug,
              language,
              length,
              paper,
              ...metrics,
              externalRequests: externalRequests - requestsBefore,
              htmlSha256: sha256(plainHtml),
            });
            if (language === 'zh' && length === 'long' && paper === 'a4') representativeHtml = html;
          }
        }
      }
      if (!representativeHtml) throw new Error('template_render_representative_missing');
      assets.set(source.metadata.slug, {
        thumbnail: await screenshot(page, representativeHtml, 400, 300),
        preview: await screenshot(page, representativeHtml, 1200, 900),
      });
    }
    return {
      report: {
        schemaVersion: 1,
        fixturePath,
        fixtureSha256: sha256(fixtureBytes),
        network: 'disabled',
        cases,
      },
      assets,
    };
  });
}

async function main(): Promise<void> {
  if (process.argv.slice(2).join(' ') !== '--verify') throw new Error('Usage: template:render --verify');
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const sources = await validateApprovedSources(rootDirectory);
  const result = await renderTemplateMatrix({ rootDirectory, sources });
  console.log(JSON.stringify({ templates: sources.length, cases: result.report.cases.length, network: result.report.network }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
