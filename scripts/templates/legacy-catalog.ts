import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import { generateHtml } from '../../src/app/api/resume/[id]/export/builders';
import { SECTION_TYPES, TEMPLATES, type Template } from '../../src/lib/constants';
import type { Resume } from '../../src/types/resume';
import type { ResumeWithSections } from '../../src/app/api/resume/[id]/export/utils';
import { loadBaselineFontAssets, resolveChromeExecutable, runWithResourceCleanup } from './collect-baseline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = 'test-fixtures/templates/legacy-baseline-resume.json';
const BASELINE_PATH = 'test-fixtures/templates/legacy-baseline-report.json';
const CATALOG_PATH = 'template-sources/legacy/catalog.json';
const VERSION = '1.0.0';

const CATEGORIES = [
  { id: 'general', nameZh: '通用', nameEn: 'General' },
  { id: 'ats', nameZh: 'ATS', nameEn: 'ATS' },
  { id: 'engineering', nameZh: '技术研发', nameEn: 'Engineering' },
  { id: 'product-operations', nameZh: '产品运营', nameEn: 'Product & Operations' },
  { id: 'design-creative', nameZh: '设计创意', nameEn: 'Design & Creative' },
  { id: 'finance-consulting', nameZh: '金融咨询', nameEn: 'Finance & Consulting' },
  { id: 'education-academic', nameZh: '教育学术', nameEn: 'Education & Academic' },
  { id: 'medical-research', nameZh: '医疗科研', nameEn: 'Medical & Research' },
  { id: 'management-executive', nameZh: '管理高管', nameEn: 'Management & Executive' },
  { id: 'graduate', nameZh: '应届校招', nameEn: 'Graduate Recruitment' },
  { id: 'chinese', nameZh: '中文特色', nameEn: 'Chinese Styles' },
  { id: 'international', nameZh: '国际求职', nameEn: 'International' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const TEMPLATE_CATEGORIES: Record<Template, CategoryId> = {
  classic: 'general', modern: 'product-operations', minimal: 'general', professional: 'general', 'two-column': 'general',
  creative: 'design-creative', ats: 'ats', academic: 'education-academic', elegant: 'international', executive: 'management-executive',
  developer: 'engineering', designer: 'design-creative', startup: 'product-operations', formal: 'general', infographic: 'design-creative',
  compact: 'ats', euro: 'international', clean: 'ats', bold: 'graduate', timeline: 'product-operations',
  nordic: 'international', corporate: 'finance-consulting', consultant: 'finance-consulting', finance: 'finance-consulting', medical: 'medical-research',
  gradient: 'design-creative', metro: 'product-operations', material: 'design-creative', coder: 'engineering', blocks: 'engineering',
  magazine: 'design-creative', artistic: 'design-creative', retro: 'design-creative', neon: 'design-creative', watercolor: 'design-creative',
  swiss: 'international', japanese: 'international', berlin: 'international', luxe: 'management-executive', rose: 'chinese',
  architect: 'engineering', legal: 'finance-consulting', teacher: 'education-academic', scientist: 'medical-research', engineer: 'engineering',
  sidebar: 'general', card: 'graduate', zigzag: 'design-creative', ribbon: 'chinese', mosaic: 'design-creative',
};

const TAGS = [
  { id: 'layout-single-column', nameZh: '单栏', nameEn: 'Single column', dimension: 'layout' },
  { id: 'layout-two-column', nameZh: '双栏', nameEn: 'Two column', dimension: 'layout' },
  { id: 'layout-sidebar', nameZh: '侧边栏', nameEn: 'Sidebar', dimension: 'layout' },
  { id: 'style-legacy', nameZh: '经典内置', nameEn: 'Legacy built-in', dimension: 'style' },
  ...CATEGORIES.map((category) => ({
    id: `scenario-${category.id}`,
    nameZh: category.nameZh,
    nameEn: category.nameEn,
    dimension: 'scenario',
  })),
  { id: 'capability-bilingual', nameZh: '中英双语', nameEn: 'Chinese and English', dimension: 'capability' },
] as const;

const TWO_COLUMN = new Set<Template>(['two-column', 'coder']);
const SIDEBAR = new Set<Template>(['sidebar']);
const ATS_COMPATIBLE = new Set<Template>(['ats', 'clean', 'minimal', 'professional', 'compact', 'formal']);

type BaselineReport = {
  inventory: { labels: Array<{ templateId: string; zh: string; en: string }> };
  templates: Array<{
    templateId: string;
    outputs: Record<'zh' | 'en', { htmlHash: string; previewHtmlHash: string }>;
  }>;
};

type Asset = { path: string; sha256: string; bytes: number; width: number; height: number; mediaType: 'image/png' };
type RenderedAssets = Record<Template, { thumbnail: Buffer; preview: Buffer }>;
type ImmutableAssetSet = Partial<Record<Template, { thumbnail: Uint8Array; preview: Uint8Array }>>;
type CatalogShape = {
  categories: ReadonlyArray<{ id: string; nameZh: string; nameEn: string }>;
  tags: ReadonlyArray<{ id: string; dimension: string }>;
  aliases: ReadonlyArray<{ alias: string; templateId: string }>;
  templates: ReadonlyArray<{
    id: string;
    nameZh: string;
    nameEn: string;
    category: string;
    tags: readonly string[];
    aliases: readonly string[];
    thumbnail: Asset;
    preview: Asset;
  }>;
};

const VALID_TAG_DIMENSIONS = new Set(['layout', 'style', 'scenario', 'capability', 'paper', 'source', 'export']);

export function validateLegacyCatalog(catalog: CatalogShape): void {
  const fail = (code: string): never => { throw new Error(code); };
  if (catalog.templates.length !== TEMPLATES.length) fail('legacy_template_count');
  const ids = catalog.templates.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== TEMPLATES[index])) fail('legacy_duplicate_template_id');
  const categoryIds = new Set(catalog.categories.map((category) => category.id));
  if (catalog.categories.length !== CATEGORIES.length || new Set(categoryIds).size !== CATEGORIES.length) fail('legacy_category_registry');
  const tagIds = new Set(catalog.tags.map((tag) => tag.id));
  if (tagIds.size !== catalog.tags.length || catalog.tags.some((tag) => !VALID_TAG_DIMENSIONS.has(tag.dimension))) fail('legacy_tag_dimension_invalid');
  const aliases = new Map(catalog.aliases.map((alias) => [alias.alias, alias.templateId]));
  if (aliases.size !== catalog.aliases.length) fail('legacy_alias_duplicate');
  const paths = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of catalog.templates) {
    if (!entry.nameZh.trim() || !entry.nameEn.trim()) fail('legacy_name_required');
    if (!categoryIds.has(entry.category)) fail('legacy_category_unknown');
    if (entry.tags.some((tag) => !tagIds.has(tag))) fail('legacy_tag_unknown');
    if (entry.aliases.some((alias) => aliases.get(alias) !== entry.id)) fail('legacy_alias_unknown');
    for (const kind of ['thumbnail', 'preview'] as const) {
      const asset = entry[kind];
      if (paths.has(asset.path)) fail('legacy_asset_path_duplicate');
      if (hashes.has(asset.sha256)) fail('legacy_asset_hash_duplicate');
      if (
        asset.path.includes('\\')
        || path.posix.isAbsolute(asset.path)
        || path.posix.normalize(asset.path) !== asset.path
        || asset.path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      ) fail('legacy_asset_path_invalid');
      if (!asset.path.startsWith(`templates/${entry.id}/v${VERSION}/`)) fail('legacy_asset_owner_mismatch');
      const filename = path.basename(asset.path);
      const match = filename.match(/^(thumbnail|preview)-([0-9a-f]{16})\.png$/);
      if (!match || match[1] !== kind || match[2] !== asset.sha256.slice(0, 16)) fail('legacy_asset_filename_prefix_mismatch');
      paths.add(asset.path);
      hashes.add(asset.sha256);
    }
  }
}

export type LegacyAssetValidationOptions = {
  rootDir?: string;
  readAsset?: (absolutePath: string, relativePath: string) => Promise<Uint8Array>;
};

export async function validateLegacyCatalogFiles(catalog: CatalogShape, options: LegacyAssetValidationOptions = {}): Promise<void> {
  validateLegacyCatalog(catalog);
  const rootDir = options.rootDir || ROOT;
  const publicRoot = path.resolve(rootDir, 'public');
  const readAsset = options.readAsset || (async (absolutePath: string) => readFile(absolutePath));
  for (const entry of catalog.templates) {
    for (const kind of ['thumbnail', 'preview'] as const) {
      const asset = entry[kind];
      const absolutePath = path.resolve(publicRoot, asset.path);
      const relativeToPublic = path.relative(publicRoot, absolutePath);
      if (relativeToPublic.startsWith('..') || path.isAbsolute(relativeToPublic)) failAsset('legacy_asset_path_invalid');
      let bytes: Uint8Array;
      try {
        bytes = await readAsset(absolutePath, asset.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('legacy_asset_missing');
        throw error;
      }
      if (bytes.byteLength < 1024 || Buffer.from(bytes).subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) failAsset('legacy_asset_blank_or_too_small');
      if (bytes.byteLength !== asset.bytes) failAsset('legacy_asset_bytes_mismatch');
      if (sha256(bytes) !== asset.sha256) failAsset('legacy_asset_hash_mismatch');
    }
  }
}

function failAsset(code: string): never { throw new Error(code); }

export async function validateRenderedAssetHashes(
  catalog: CatalogShape,
  rendered: Partial<Record<string, { thumbnail: Uint8Array; preview: Uint8Array }>>,
): Promise<void> {
  const entries = new Map(catalog.templates.map((entry) => [entry.id, entry]));
  for (const id of Object.keys(rendered)) {
    if (!entries.has(id)) failAsset('legacy_render_template_unknown');
  }
  for (const entry of catalog.templates) {
    const assets = rendered[entry.id];
    if (
      !assets
      || !(assets.thumbnail instanceof Uint8Array)
      || !(assets.preview instanceof Uint8Array)
    ) failAsset('legacy_render_assets_missing');
    for (const kind of ['thumbnail', 'preview'] as const) {
      if (sha256(assets[kind]) !== entry[kind].sha256) failAsset('legacy_render_hash_mismatch');
    }
  }
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

async function fileHash(relativePath: string): Promise<string> {
  return sha256(await readFile(path.join(ROOT, relativePath)));
}

function cloneResume(resume: Resume, template: Template): ResumeWithSections {
  return { ...structuredClone(resume), template } as unknown as ResumeWithSections;
}

function injectFonts(html: string, css: string): string {
  if (!html.includes('</head>')) throw new Error('Generated legacy HTML has no closing head tag');
  return html.replace('</head>', `<style data-legacy-catalog-fonts>${css}</style></head>`);
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function compositeHtml(zhHtml: string, enHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#dfe3e8}
    body{padding:12px}.stage{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;height:100%}
    .sheet{position:relative;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
    iframe{position:absolute;inset:0;width:794px;height:1123px;border:0;transform-origin:top left;transform:scale(calc((50vw - 18px)/794));background:#fff}
  </style></head><body><main class="stage" aria-label="Bilingual legacy template evidence">
    <section class="sheet"><iframe title="Chinese fixture" srcdoc="${escapeAttribute(zhHtml)}"></iframe></section>
    <section class="sheet"><iframe title="English fixture" srcdoc="${escapeAttribute(enHtml)}"></iframe></section>
  </main></body></html>`;
}

async function startFontServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const routes = new Map([
    ['/NotoSansSC-Regular.otf', path.join(ROOT, 'public/fonts/NotoSansSC-Regular.otf')],
    ['/NotoSansSC-Bold.otf', path.join(ROOT, 'public/fonts/NotoSansSC-Bold.otf')],
  ]);
  const server = createServer(async (request, response) => {
    const file = routes.get(request.url || '');
    if (!file) { response.writeHead(404).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'Content-Type': 'font/otf',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': bytes.byteLength,
    });
    response.end(bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to resolve local font server address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function configureOfflinePage(page: Page, fontOrigin: string): Promise<void> {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith(`${fontOrigin}/`)) void request.continue();
    else if (/^https?:/i.test(request.url())) void request.abort();
    else void request.continue();
  });
}

async function screenshot(page: Page, html: string, width: number, height: number): Promise<Buffer> {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const frames = page.frames().filter((frame) => frame !== page.mainFrame());
  if (frames.length !== 2) throw new Error(`Expected two bilingual frames, found ${frames.length}`);
  const fontChecks = await Promise.all(frames.map((frame) => frame.evaluate(async () => {
    const sample = '固定字体简历';
    await Promise.all([
      document.fonts.load('400 16px "Baseline Noto Sans SC"', sample),
      document.fonts.load('700 16px "Baseline Noto Sans SC"', sample),
    ]);
    await document.fonts.ready;
    return document.fonts.check('400 16px "Baseline Noto Sans SC"', sample)
      && document.fonts.check('700 16px "Baseline Noto Sans SC"', sample);
  })));
  if (fontChecks.some((ready) => !ready)) throw new Error('Bilingual frame fonts are not ready');
  return Buffer.from(await page.screenshot({ type: 'png', captureBeyondViewport: false, optimizeForSpeed: false }));
}

export async function renderLegacyAssets(): Promise<RenderedAssets> {
  return runWithResourceCleanup(async (defer) => {
    let page: Page | undefined;
    let browser: Browser | undefined;
    let fontServer: Awaited<ReturnType<typeof startFontServer>> | undefined;
    defer(() => page?.close());
    defer(() => browser?.close());
    defer(() => fontServer?.close());
    const fixture = JSON.parse(await readFile(path.join(ROOT, FIXTURE_PATH), 'utf8')) as Record<'zh' | 'en', Resume>;
    fontServer = await startFontServer();
    browser = await puppeteer.launch({
      executablePath: await resolveChromeExecutable(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const fontAssets = await loadBaselineFontAssets(ROOT, fontServer.origin);
    page = await browser.newPage();
    await configureOfflinePage(page, fontServer.origin);
    const rendered = {} as RenderedAssets;
    for (const [index, template] of TEMPLATES.entries()) {
      const zhHtml = injectFonts(await generateHtml(cloneResume(fixture.zh, template), true), fontAssets.css);
      const enHtml = injectFonts(await generateHtml(cloneResume(fixture.en, template), true), fontAssets.css);
      const html = compositeHtml(zhHtml, enHtml);
      rendered[template] = {
        thumbnail: await screenshot(page, html, 400, 300),
        preview: await screenshot(page, html, 1200, 900),
      };
      process.stdout.write(`[legacy-catalog] rendered ${index + 1}/${TEMPLATES.length} ${template}\n`);
    }
    return rendered;
  });
}

function assetPath(template: Template, kind: 'thumbnail' | 'preview', bytes: Buffer): string {
  return `templates/${template}/v${VERSION}/${kind}-${sha256(bytes).slice(0, 16)}.png`;
}

export type ImmutableAssetSetOptions = {
  rootDir?: string;
  beforeWrite?: (relativePath: string, index: number) => Promise<void>;
};

type AssetWritePlan = { bytes: Buffer; directory: string; physicalPath: string; relativePath: string; write: boolean };

async function listDirectory(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function planImmutableAssetSet(rendered: ImmutableAssetSet, rootDir: string): Promise<AssetWritePlan[]> {
  const plans: AssetWritePlan[] = [];
  for (const template of TEMPLATES) {
    const assets = rendered[template];
    if (
      !assets
      || !(assets.thumbnail instanceof Uint8Array)
      || !(assets.preview instanceof Uint8Array)
    ) failAsset('legacy_render_assets_missing');
    for (const kind of ['thumbnail', 'preview'] as const) {
      const bytes = Buffer.from(assets[kind]);
      const relativePath = assetPath(template, kind, bytes);
      const physicalPath = path.join(rootDir, 'public', relativePath);
      const directory = path.dirname(physicalPath);
      const matches = (await listDirectory(directory))
        .filter((name) => name.startsWith(`${kind}-`) && name.endsWith('.png'))
        .sort();
      if (matches.length) {
        if (matches.length !== 1 || matches[0] !== path.basename(relativePath)) failAsset('legacy_asset_version_conflict');
        const existing = await readFile(physicalPath);
        if (!existing.equals(bytes)) failAsset('legacy_asset_version_conflict');
      }
      plans.push({ bytes, directory, physicalPath, relativePath, write: matches.length === 0 });
    }
  }
  return plans;
}

async function rollbackAssetWrites(createdFiles: string[], createdRoots: string[]): Promise<void> {
  const cleanupErrors: unknown[] = [];
  for (const physicalPath of createdFiles.toReversed()) {
    try { await unlink(physicalPath); } catch (error) { cleanupErrors.push(error); }
  }
  for (const directory of [...new Set(createdRoots)].sort((a, b) => b.length - a.length)) {
    try { await rm(directory, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Immutable asset rollback failed');
}

async function publishImmutableAssetSet(rendered: ImmutableAssetSet, options: ImmutableAssetSetOptions = {}) {
  const rootDir = options.rootDir || ROOT;
  const plans = await planImmutableAssetSet(rendered, rootDir);
  const createdFiles: string[] = [];
  const createdRoots: string[] = [];
  try {
    for (const [index, plan] of plans.entries()) {
      if (!plan.write) continue;
      const firstCreated = await mkdir(plan.directory, { recursive: true });
      if (firstCreated) createdRoots.push(firstCreated);
      await options.beforeWrite?.(plan.relativePath, index);
      await writeFile(plan.physicalPath, plan.bytes, { flag: 'wx' });
      createdFiles.push(plan.physicalPath);
    }
  } catch (error) {
    try {
      await rollbackAssetWrites(createdFiles, createdRoots);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Immutable asset publish and rollback failed');
    }
    throw error;
  }
  return { rollback: () => rollbackAssetWrites(createdFiles, createdRoots) };
}

export async function writeImmutableAssetSet(rendered: ImmutableAssetSet, options: ImmutableAssetSetOptions = {}): Promise<void> {
  await publishImmutableAssetSet(rendered, options);
}

async function findAsset(template: Template, kind: 'thumbnail' | 'preview'): Promise<Asset> {
  const relativeDir = `templates/${template}/v${VERSION}`;
  const physicalDir = path.join(ROOT, 'public', relativeDir);
  const matches = (await readdir(physicalDir)).filter((name) => name.startsWith(`${kind}-`) && name.endsWith('.png')).sort();
  if (matches.length !== 1) throw new Error(`${template} must have exactly one ${kind} asset, found ${matches.length}`);
  const relativePath = `${relativeDir}/${matches[0]}`;
  const bytes = await readFile(path.join(ROOT, 'public', relativePath));
  return {
    path: relativePath,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    width: kind === 'thumbnail' ? 400 : 1200,
    height: kind === 'thumbnail' ? 300 : 900,
    mediaType: 'image/png',
  };
}

export async function buildLegacyCatalogSeed() {
  const [fixtureBytes, baselineBytes] = await Promise.all([
    readFile(path.join(ROOT, FIXTURE_PATH)),
    readFile(path.join(ROOT, BASELINE_PATH)),
  ]);
  const baseline = JSON.parse(baselineBytes.toString('utf8')) as BaselineReport;
  const labels = new Map(baseline.inventory.labels.map((label) => [label.templateId, label]));
  const outputs = new Map(baseline.templates.map((entry) => [entry.templateId, entry.outputs]));
  const fixtureSha256 = sha256(fixtureBytes);
  const baselineReportSha256 = sha256(baselineBytes);
  const licenseSha256 = await fileHash('LICENSE');
  const aliases = TEMPLATES.map((templateId) => ({ alias: `legacy-${templateId}`, templateId }));

  const templates = await Promise.all(TEMPLATES.map(async (template) => {
    const label = labels.get(template);
    const baselineOutput = outputs.get(template);
    if (!label || !baselineOutput?.zh || !baselineOutput.en) throw new Error(`Missing baseline metadata for ${template}`);
    const previewPath = `src/components/preview/templates/${template}.tsx`;
    const exportPath = `src/app/api/resume/[id]/export/templates/${template}.ts`;
    const source = {
      kind: 'built-in' as const,
      preview: previewPath,
      previewSha256: await fileHash(previewPath),
      export: exportPath,
      exportSha256: await fileHash(exportPath),
    };
    const manifest = {
      schemaVersion: 1,
      rendererKind: 'legacy-react',
      templateId: template,
      version: VERSION,
      source,
      baseline: {
        zh: { htmlHash: baselineOutput.zh.htmlHash, previewHtmlHash: baselineOutput.zh.previewHtmlHash },
        en: { htmlHash: baselineOutput.en.htmlHash, previewHtmlHash: baselineOutput.en.previewHtmlHash },
      },
    };
    const layoutTag = SIDEBAR.has(template) ? 'layout-sidebar' : TWO_COLUMN.has(template) ? 'layout-two-column' : 'layout-single-column';
    return {
      id: template,
      slug: template,
      version: VERSION,
      nameZh: label.zh,
      nameEn: label.en,
      category: TEMPLATE_CATEGORIES[template],
      tags: [layoutTag, 'style-legacy', `scenario-${TEMPLATE_CATEGORIES[template]}`, 'capability-bilingual'],
      aliases: [`legacy-${template}`],
      rendererKind: 'legacy-react' as const,
      source,
      license: { spdx: 'Apache-2.0' as const, path: 'LICENSE' as const, sha256: licenseSha256, copyright: 'JadeAI contributors' },
      provenance: {
        fixturePath: FIXTURE_PATH,
        baselineReportPath: BASELINE_PATH,
        fixtureSha256,
        baselineReportSha256,
        languages: ['zh', 'en'] as const,
        network: 'disabled' as const,
      },
      capabilities: {
        supportedSections: [...SECTION_TYPES],
        paperSizes: ['a4', 'letter'] as const,
        supportsAvatar: true,
        atsCompatible: ATS_COMPATIBLE.has(template),
        supportsZh: true as const,
        supportsEn: true as const,
        supportsHtml: true as const,
        supportsPdf: true as const,
        docxFidelity: 'unsupported' as const,
      },
      manifest,
      manifestHash: sha256(canonicalize(manifest)),
      thumbnail: await findAsset(template, 'thumbnail'),
      preview: await findAsset(template, 'preview'),
    };
  }));

  return { schemaVersion: 1 as const, categories: CATEGORIES, tags: TAGS, aliases, templates };
}

export async function verifyLegacyCatalogFiles(): Promise<{ assets: number; templates: number }> {
  const checkedIn = JSON.parse(await readFile(path.join(ROOT, CATALOG_PATH), 'utf8'));
  const rebuilt = await buildLegacyCatalogSeed();
  if (canonicalize(checkedIn) !== canonicalize(rebuilt)) throw new Error('Checked-in legacy catalog does not match deterministic seed');
  await validateLegacyCatalogFiles(checkedIn, { rootDir: ROOT });
  return { assets: rebuilt.templates.length * 2, templates: rebuilt.templates.length };
}

async function writeGeneratedCatalog(rendered: RenderedAssets): Promise<void> {
  const published = await publishImmutableAssetSet(rendered);
  const catalogPath = path.join(ROOT, CATALOG_PATH);
  const temporaryCatalogPath = `${catalogPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    const catalog = await buildLegacyCatalogSeed();
    await mkdir(path.dirname(catalogPath), { recursive: true });
    await writeFile(temporaryCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryCatalogPath, catalogPath);
  } catch (error) {
    await rm(temporaryCatalogPath, { force: true });
    try {
      await published.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Legacy catalog publish and rollback failed');
    }
    throw error;
  }
}

async function verifyRenderedAssets(rendered: RenderedAssets): Promise<void> {
  await validateRenderedAssetHashes(await buildLegacyCatalogSeed(), rendered);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === '--write') {
    await writeGeneratedCatalog(await renderLegacyAssets());
    await verifyLegacyCatalogFiles();
    return;
  }
  if (command === '--verify-rendered') {
    await verifyRenderedAssets(await renderLegacyAssets());
    await verifyLegacyCatalogFiles();
    return;
  }
  if (command === '--verify') {
    await verifyLegacyCatalogFiles();
    return;
  }
  throw new Error('Usage: pnpm tsx scripts/templates/legacy-catalog.ts --write|--verify|--verify-rendered');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
