import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import puppeteer, { type Browser } from 'puppeteer-core';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { TEMPLATES, SECTION_TYPES } from '../../src/lib/constants';
import { templateLabelsMap } from '../../src/lib/template-labels';
import { loadLegacyTemplateAdapter } from '../../src/components/templates/legacy-template-registry';
import { generateHtml } from '../../src/app/api/resume/[id]/export/builders';
import type { Resume } from '../../src/types/resume';
import type { ResumeWithSections } from '../../src/app/api/resume/[id]/export/utils';

type Language = 'zh' | 'en';

export interface TemplateInventory {
  templateIds: {
    templates: string[];
    preview: string[];
    export: string[];
    labels: string[];
    thumbnails: string[];
    previewSources: string[];
    exportSources: string[];
  };
  labels: Array<{ templateId: string; key: string; zh: string; en: string }>;
  sourceFiles: string[];
  mismatches: string[];
}

interface PdfMetadata {
  status: 'generated' | 'skipped';
  reason?: string;
  format?: string;
  pageCount?: number;
  pageSizePoints?: { width: number; height: number };
  producer?: string;
}

interface ToolchainFingerprint {
  browserVersion: string;
  mupdfVersion: string;
  fontStrategy: string;
  fontAssets: Array<{ path: string; sha256: string }>;
  nodeVersion: string;
  zlibVersion: string;
  brotliVersion: string;
  platform: string;
  arch: string;
}

interface TemplateOutput {
  htmlHash: string;
  previewHtmlHash: string;
  pdfMetadata: PdfMetadata;
  sectionTextInventory: SectionTextInventory[];
  missingSections: string[];
  assets: string[];
  clientMetrics: {
    domNodeCount: number;
    dataSectionCount: number;
    renderedBytes: number;
    templateSourceBytes: number;
  };
}

export interface SectionTextInventory {
  sectionType: string;
  expectedText: string[];
  expectedPreviewText: string[];
  expectedExportText: string[];
  previewText: string;
  exportText: string;
  previewScopedText: string;
  exportScopedText: string;
  fieldMatrixText: string[];
  previewOmittedText: string[];
  exportOmittedText: string[];
  missingPreview: string[];
  missingExport: string[];
}

export interface BaselineReport {
  schemaVersion: 1;
  fixturePath: string;
  toolchainFingerprint: ToolchainFingerprint | null;
  inventory: TemplateInventory;
  clientChunkMetrics: ClientChunkMetrics;
  templates: Array<{ templateId: string; outputs: Record<string, TemplateOutput> }>;
}

export type ClientChunkMetrics = {
  status: 'available';
  manifestPaths: string[];
  fileCount: number;
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  files: Array<{ path: string; rawBytes: number; gzipBytes: number; brotliBytes: number }>;
} | {
  status: 'unavailable';
  reason: string;
  manifestPaths: string[];
  fileCount: 0;
  rawBytes: 0;
  gzipBytes: 0;
  brotliBytes: 0;
  files: [];
};

export interface CollectBaselineOptions {
  rootDir?: string;
  languages?: Language[];
  includePdf?: boolean;
  writeReport?: boolean;
  reportPath?: string;
  partial?: boolean;
}

const FIXTURE_PATH = 'test-fixtures/templates/legacy-baseline-resume.json';
const REPORT_PATH = 'test-fixtures/templates/legacy-baseline-report.json';
const PREVIEW_DIR = 'src/components/preview/templates';
const EXPORT_DIR = 'src/app/api/resume/[id]/export/templates';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

async function objectKeys(rootDir: string, relativeFile: string, variableName: string): Promise<string[]> {
  const file = path.join(rootDir, relativeFile);
  const sourceText = await readFile(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, relativeFile.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let keys: string[] | undefined;

  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName || !declaration.initializer) continue;
      if (!ts.isObjectLiteralExpression(declaration.initializer)) continue;
      keys = declaration.initializer.properties.flatMap((property) => {
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property) && !ts.isMethodDeclaration(property)) return [];
        const name = propertyName(property.name);
        return name ? [name] : [];
      });
    }
  });

  if (!keys) throw new Error(`Unable to find object registry ${variableName} in ${relativeFile}`);
  return keys;
}

async function sourceStems(rootDir: string, relativeDir: string, extension: '.ts' | '.tsx'): Promise<string[]> {
  const entries = await readdir(path.join(rootDir, relativeDir));
  return entries.filter((name) => name.endsWith(extension)).map((name) => name.slice(0, -extension.length));
}

function compareRegistry(name: string, actual: string[], expected: readonly string[]): string[] {
  const mismatches: string[] = [];
  const duplicates = actual.filter((id, index) => actual.indexOf(id) !== index);
  const missing = expected.filter((id) => !actual.includes(id));
  const extra = actual.filter((id) => !expected.includes(id));
  if (duplicates.length) mismatches.push(`${name}: duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
  if (missing.length) mismatches.push(`${name}: missing IDs: ${missing.join(', ')}`);
  if (extra.length) mismatches.push(`${name}: extra IDs: ${extra.join(', ')}`);
  if (!duplicates.length && !missing.length && !extra.length && actual.join('\0') !== expected.join('\0')) {
    mismatches.push(`${name}: template order differs from TEMPLATES`);
  }
  return mismatches;
}

export async function collectInventory(rootDir = process.cwd()): Promise<TemplateInventory> {
  const expected = [...TEMPLATES];
  const [preview, exportBuilders, thumbnails, previewStemList, exportStemList, zhMessages, enMessages] = await Promise.all([
    objectKeys(rootDir, 'src/components/templates/legacy-template-registry.ts', 'legacyTemplateLoaders'),
    objectKeys(rootDir, 'src/app/api/resume/[id]/export/builders.ts', 'TEMPLATE_BUILDERS'),
    objectKeys(rootDir, 'src/components/dashboard/template-thumbnail.tsx', 'thumbnails'),
    sourceStems(rootDir, PREVIEW_DIR, '.tsx'),
    sourceStems(rootDir, EXPORT_DIR, '.ts'),
    readFile(path.join(rootDir, 'messages/zh.json'), 'utf8').then(JSON.parse),
    readFile(path.join(rootDir, 'messages/en.json'), 'utf8').then(JSON.parse),
  ]);
  const labels = Object.keys(templateLabelsMap);
  const previewSources: string[] = expected.filter((id) => previewStemList.includes(id));
  const exportSources: string[] = expected.filter((id) => exportStemList.includes(id));
  previewSources.push(...previewStemList.filter((id) => !expected.includes(id as (typeof TEMPLATES)[number])).sort());
  exportSources.push(...exportStemList.filter((id) => !expected.includes(id as (typeof TEMPLATES)[number])).sort());

  const templateIds = {
    templates: expected,
    preview,
    export: exportBuilders,
    labels,
    thumbnails,
    previewSources,
    exportSources,
  };
  const mismatches = Object.entries(templateIds).flatMap(([name, ids]) => compareRegistry(name, ids, expected));
  const localizedLabels = expected.map((templateId) => {
    const key = templateLabelsMap[templateId];
    const messageKey = key?.replace(/^dashboard\./, '');
    const zh = messageKey ? zhMessages.dashboard?.[messageKey] : undefined;
    const en = messageKey ? enMessages.dashboard?.[messageKey] : undefined;
    if (!key || typeof zh !== 'string' || typeof en !== 'string') mismatches.push(`labels: missing localization for ${templateId}`);
    return { templateId, key: key || '', zh: zh || '', en: en || '' };
  });
  const sourceFiles = [
    ...previewSources.map((id) => `${PREVIEW_DIR}/${id}.tsx`),
    ...exportSources.map((id) => `${EXPORT_DIR}/${id}.ts`),
  ];

  return { templateIds, labels: localizedLabels, sourceFiles, mismatches };
}

function cloneResume(resume: unknown, templateId: string): Resume {
  return { ...(structuredClone(resume) as Resume), template: templateId };
}

function validateFixture(fixture: Record<string, Resume>): void {
  for (const language of ['zh', 'en'] as const) {
    const resume = fixture[language];
    if (!resume) throw new Error(`Fixture is missing ${language}`);
    const sectionTypes = resume.sections.map((section) => section.type);
    if (sectionTypes.join('\0') !== SECTION_TYPES.join('\0')) {
      throw new Error(`Fixture ${language} sections differ from SECTION_TYPES: ${sectionTypes.join(', ')}`);
    }
  }
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    const numeric = lower.startsWith('&#x')
      ? Number.parseInt(lower.slice(3, -1), 16)
      : Number.parseInt(lower.slice(2, -1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });
}

export function extractAssets(...documents: string[]): string[] {
  const assets = new Set<string>();
  for (const document of documents) {
    for (const match of document.matchAll(/\b(?:src|href)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
      assets.add(decodeHtmlEntities(match[2]));
    }
    for (const match of document.matchAll(/\burl\(\s*(?:(["'])([\s\S]*?)\1|([^\s)]+))\s*\)/gi)) {
      assets.add(decodeHtmlEntities(match[2] || match[3]));
    }
  }
  return [...assets].sort();
}

function normalizeText(value: unknown): string {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractScopedSectionTexts(_markup: string): { outsideText: string; sections: string[] } {
  const markup = _markup
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(?:style|script|template)\b[^>]*>[\s\S]*?<\/(?:style|script|template)>/gi, ' ');
  const sections: string[] = [];
  let outside = '';
  let current = '';
  let sectionDepth: number | null = null;
  let depth = 0;
  let ignoredDepth: number | null = null;
  const ignoredTags = new Set(['head', 'style', 'script', 'template']);
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  for (const token of markup.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || []) {
    if (!token.startsWith('<')) {
      if (ignoredDepth != null) continue;
      if (sectionDepth == null) outside += ` ${token}`;
      else current += ` ${token}`;
      continue;
    }
    const closing = token.match(/^<\s*\/\s*([\w-]+)/);
    if (closing) {
      depth = Math.max(0, depth - 1);
      if (ignoredDepth != null && depth === ignoredDepth) {
        ignoredDepth = null;
        continue;
      }
      if (ignoredDepth != null) continue;
      if (sectionDepth != null && depth === sectionDepth) {
        sections.push(normalizeText(current));
        current = '';
        sectionDepth = null;
      }
      continue;
    }
    const opening = token.match(/^<\s*([\w-]+)/);
    if (!opening || token.startsWith('<!')) continue;
    const tag = opening[1].toLowerCase();
    if (ignoredDepth == null && ignoredTags.has(tag)) ignoredDepth = depth;
    if (ignoredDepth != null) {
      if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) depth += 1;
      continue;
    }
    if (sectionDepth == null && /\bdata-section(?:\s|=|>)/i.test(token)) sectionDepth = depth;
    if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) depth += 1;
  }
  if (sectionDepth != null) throw new Error('Unclosed data-section container');
  return { outsideText: normalizeText(outside), sections };
}

export async function loadBaselineFontAssets(rootDir: string, baseUrl?: string): Promise<{
  assets: Array<{ path: string; sha256: string }>;
  css: string;
}> {
  const definitions = [
    { path: 'public/fonts/NotoSansSC-Regular.otf', weight: 400 },
    { path: 'public/fonts/NotoSansSC-Bold.otf', weight: 700 },
  ];
  const loaded = await Promise.all(definitions.map(async (definition) => {
    const bytes = await readFile(path.join(rootDir, definition.path));
    if (!bytes.byteLength) throw new Error(`Baseline font is empty: ${definition.path}`);
    return { ...definition, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  const faces = loaded.map((font) => {
    const source = baseUrl
      ? `'${baseUrl}/${path.basename(font.path)}'`
      : `data:font/otf;base64,${font.bytes.toString('base64')}`;
    return `@font-face{font-family:'Baseline Noto Sans SC';src:url(${source}) format('opentype');font-weight:${font.weight};font-style:normal;font-display:block}`;
  }).join('\n');
  return {
    assets: loaded.map(({ path: fontPath, sha256: hash }) => ({ path: fontPath, sha256: hash })),
    css: `${faces}\n.resume-export,.resume-export *{font-family:'Baseline Noto Sans SC'!important}`,
  };
}

async function startBaselineFontServer(rootDir: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const routes = new Map([
    ['/NotoSansSC-Regular.otf', path.join(rootDir, 'public/fonts/NotoSansSC-Regular.otf')],
    ['/NotoSansSC-Bold.otf', path.join(rootDir, 'public/fonts/NotoSansSC-Bold.otf')],
  ]);
  const server = createServer(async (request, response) => {
    const file = routes.get(request.url || '');
    if (!file) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Content-Type': 'font/otf',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': bytes.byteLength,
      });
      response.end(bytes);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to resolve baseline font server address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function waitForBaselineFonts(page: Pick<import('puppeteer-core').Page, 'evaluate'>, timeoutMs = 10_000): Promise<void> {
  const readiness = page.evaluate(async () => {
    const sample = '固定字体简历';
    await Promise.all([
      document.fonts.load('400 16px "Baseline Noto Sans SC"', sample),
      document.fonts.load('700 16px "Baseline Noto Sans SC"', sample),
    ]);
    await document.fonts.ready;
    return {
      regular: document.fonts.check('400 16px "Baseline Noto Sans SC"', sample),
      bold: document.fonts.check('700 16px "Baseline Noto Sans SC"', sample),
    };
  });
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`Baseline fonts did not become ready within ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });
  const result = await Promise.race([readiness, timeout]);
  if (!result.regular) throw new Error('Baseline Noto Sans SC regular font is not loaded');
  if (!result.bold) throw new Error('Baseline Noto Sans SC bold font is not loaded');
}

function injectBaselineFonts(html: string, css: string): string {
  const tag = `<style data-baseline-fonts>${css}</style>`;
  if (!html.includes('</head>')) throw new Error('PDF HTML has no </head> for baseline font injection');
  return html.replace('</head>', `${tag}</head>`);
}

export async function resolveChromeExecutable(options: { env?: Record<string, string | undefined>; candidates?: string[] } = {}): Promise<string> {
  const env = options.env || process.env;
  const candidates = [
    env.CHROME_PATH,
    env.PROGRAMFILES ? `${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    env['PROGRAMFILES(X86)'] ? `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    env.LOCALAPPDATA ? `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/chromium-browser-unstable', '/snap/bin/chromium',
    ...(options.candidates || []),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try { await stat(candidate); return candidate; } catch { /* try next local executable */ }
  }
  throw new Error('No local Chrome/Chromium executable found; remote downloads are disabled for baseline collection.');
}

export async function readPdfMetadata(buffer: Uint8Array, documentFactory?: { openDocument: (buffer: Uint8Array, magic: string) => any }): Promise<Omit<PdfMetadata, 'status'>> {
  const factory = documentFactory || (await import('mupdf')).Document;
  const document = factory.openDocument(buffer, 'application/pdf');
  try {
    const page = document.loadPage(0);
    try {
      const bounds = page.getBounds();
      return {
        format: document.getMetaData('format') || 'PDF',
        pageCount: document.countPages(),
        pageSizePoints: { width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] },
        producer: document.getMetaData('info:Producer') || 'unknown',
      };
    } finally {
      page.destroy();
    }
  } finally {
    document.destroy();
  }
}

function nonEmpty(values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return nonEmpty(value);
    const text = normalizeText(value);
    return text ? [text] : [];
  });
}

function searchableText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, '');
}

function expectedSectionText(section: Resume['sections'][number]): { preview: string[]; export: string[] } {
  const content = section.content as Record<string, any>;
  const items = content.items || [];
  switch (section.type) {
    case 'personal_info':
      break;
    case 'summary':
      break;
    case 'work_experience':
      break;
    case 'education':
      break;
    case 'skills':
      break;
    case 'projects':
      break;
    case 'certifications':
      break;
    case 'languages':
      break;
    case 'github':
      break;
    case 'qr_codes':
      return { preview: nonEmpty([section.title]), export: nonEmpty(items.flatMap((item: any) => item.label)) };
    case 'custom':
      break;
    default:
      return { preview: [], export: [] };
  }
  let text: string[];
  if (section.type === 'personal_info') text = nonEmpty([content.fullName, content.jobTitle, content.email, content.phone, content.location]);
  else if (section.type === 'summary') text = nonEmpty(String(content.text || '').split('\n').map((line) => line.replace(/^[-–•]\s+/, '').replace(/\*\*|`/g, '')));
  else if (section.type === 'work_experience') text = nonEmpty(items.flatMap((item: any) => [item.company, item.position, item.description, item.technologies, item.highlights]));
  else if (section.type === 'education') text = nonEmpty(items.flatMap((item: any) => [item.institution, item.degree, item.field, item.gpa, item.highlights]));
  else if (section.type === 'skills') text = nonEmpty((content.categories || []).flatMap((category: any) => category.skills));
  else if (section.type === 'projects') text = nonEmpty(items.flatMap((item: any) => [item.name, item.description, item.technologies, item.highlights]));
  else if (section.type === 'certifications') text = nonEmpty(items.flatMap((item: any) => [item.name, item.issuer, item.date]));
  else if (section.type === 'languages') text = nonEmpty(items.flatMap((item: any) => [item.language, item.proficiency]));
  else if (section.type === 'github') text = nonEmpty(items.flatMap((item: any) => [item.name, String(item.stars), item.language, item.description]));
  else text = nonEmpty(items.flatMap((item: any) => [item.title, item.subtitle, item.description]));
  return { preview: text, export: text };
}

function fieldMatrixText(section: Resume['sections'][number], language: string): string[] {
  const content = section.content as Record<string, any>;
  const items = content.items || [];
  if (section.type === 'personal_info') return nonEmpty([content.location, content.website, content.linkedin, content.github, (content.customLinks || []).map((link: any) => link.url)]);
  if (section.type === 'work_experience') return nonEmpty(items.flatMap((item: any) => [item.location, item.startDate, item.endDate, item.current ? (language === 'zh' ? '至今' : 'Present') : '']));
  if (section.type === 'education') return nonEmpty(items.flatMap((item: any) => [item.location, item.startDate, item.endDate]));
  if (section.type === 'skills') return nonEmpty((content.categories || []).map((category: any) => category.name));
  if (section.type === 'projects') return nonEmpty(items.flatMap((item: any) => [item.url, item.startDate, item.endDate]));
  if (section.type === 'certifications') return nonEmpty(items.map((item: any) => item.url));
  if (section.type === 'languages') return nonEmpty(items.map((item: any) => item.description));
  if (section.type === 'github') return nonEmpty(items.map((item: any) => item.repoUrl));
  if (section.type === 'qr_codes') return nonEmpty(items.map((item: any) => item.url));
  if (section.type === 'custom') return nonEmpty(items.map((item: any) => item.date));
  return [];
}

export function buildSectionTextInventory(resume: Resume, previewMarkup: string, exportHtml: string): SectionTextInventory[] {
  const previewScopes = extractScopedSectionTexts(previewMarkup) as unknown as { outsideText: string; sections: string[] };
  const exportScopes = extractScopedSectionTexts(exportHtml) as unknown as { outsideText: string; sections: string[] };
  const visible = resume.sections.filter((section) => section.visible);
  const bodySections = visible.filter((section) => section.type !== 'personal_info');
  if (previewScopes.sections.length !== bodySections.length) throw new Error(`Preview container count ${previewScopes.sections.length} differs from ${bodySections.length}`);
  if (exportScopes.sections.length !== bodySections.length) throw new Error(`Export container count ${exportScopes.sections.length} differs from ${bodySections.length}`);
  const assignScopes = (scopes: string[]) => {
    const unused = scopes.map((text, index) => ({ text, index }));
    return new Map(bodySections.map((section) => {
      const title = normalizeText(section.title).toLocaleLowerCase();
      let matchedIndex = unused.findIndex((scope) => scope.text.toLocaleLowerCase().startsWith(title));
      if (matchedIndex < 0) {
        const tokens = [...new Set([...expectedSectionText(section).preview, ...expectedSectionText(section).export])]
          .map(searchableText);
        matchedIndex = unused.reduce((best, scope, index) => {
          const scopeSearch = searchableText(scope.text);
          const score = tokens.filter((token) => scopeSearch.includes(token)).length;
          return score > best.score ? { index, score } : best;
        }, { index: 0, score: -1 }).index;
      }
      const [matched] = unused.splice(matchedIndex >= 0 ? matchedIndex : 0, 1);
      return [section.id, matched.text] as const;
    }));
  };
  const previewBySection = assignScopes(previewScopes.sections);
  const exportBySection = assignScopes(exportScopes.sections);
  const inventory = visible.map((section) => {
    const previewDocument = section.type === 'personal_info' ? previewScopes.outsideText : previewBySection.get(section.id)!;
    const exportDocument = section.type === 'personal_info' ? exportScopes.outsideText : exportBySection.get(section.id)!;
    const previewSearch = searchableText(previewDocument);
    const exportSearch = searchableText(exportDocument);
    const expected = expectedSectionText(section);
    const matrix = fieldMatrixText(section, resume.language);
    const expectedText = [...new Set([...expected.preview, ...expected.export])];
    const missingPreview = expected.preview.filter((text) => !previewSearch.includes(searchableText(text)));
    const missingExport = expected.export.filter((text) => !exportSearch.includes(searchableText(text)));
    return {
      sectionType: section.type,
      expectedText,
      expectedPreviewText: expected.preview,
      expectedExportText: expected.export,
      previewText: expected.preview.filter((text) => previewSearch.includes(searchableText(text))).join(' | '),
      exportText: expected.export.filter((text) => exportSearch.includes(searchableText(text))).join(' | '),
      previewScopedText: previewDocument,
      exportScopedText: exportDocument,
      fieldMatrixText: matrix,
      previewOmittedText: matrix.filter((text) => !previewSearch.includes(searchableText(text))),
      exportOmittedText: matrix.filter((text) => !exportSearch.includes(searchableText(text))),
      missingPreview,
      missingExport,
    };
  });
  const firstMissingPreview = inventory.find((section) => section.missingPreview.length);
  if (firstMissingPreview) {
    throw new Error(`Preview missing ${firstMissingPreview.sectionType} text: ${firstMissingPreview.missingPreview.join(' | ')}`);
  }
  const firstMissingExport = inventory.find((section) => section.missingExport.length);
  if (firstMissingExport) {
    throw new Error(`Export missing ${firstMissingExport.sectionType} text: ${firstMissingExport.missingExport.join(' | ')}`);
  }
  return inventory;
}

function assertEqual(label: string, current: unknown, saved: unknown): void {
  if (JSON.stringify(current) !== JSON.stringify(saved)) throw new Error(`Legacy baseline drift: ${label} changed`);
}

export function assertBaselineMatches(current: BaselineReport, saved: BaselineReport): void {
  assertEqual('schemaVersion', current.schemaVersion, saved.schemaVersion);
  assertEqual('fixturePath', current.fixturePath, saved.fixturePath);
  assertEqual('inventory', current.inventory, saved.inventory);
  assertEqual('toolchainFingerprint', current.toolchainFingerprint, saved.toolchainFingerprint);
  assertEqual('clientChunkMetrics', current.clientChunkMetrics, saved.clientChunkMetrics);
  assertEqual('template IDs', current.templates.map((template) => template.templateId), saved.templates.map((template) => template.templateId));

  for (const template of current.templates) {
    const savedTemplate = saved.templates.find((candidate) => candidate.templateId === template.templateId);
    if (!savedTemplate) throw new Error(`Legacy baseline drift: ${template.templateId} missing from saved report`);
    assertEqual(`${template.templateId} languages`, Object.keys(template.outputs), Object.keys(savedTemplate.outputs));
    for (const [language, output] of Object.entries(template.outputs)) {
      const savedOutput = savedTemplate.outputs[language];
      if (!savedOutput) throw new Error(`Legacy baseline drift: ${template.templateId}/${language} missing from saved report`);
      assertEqual(`${template.templateId}/${language} htmlHash`, output.htmlHash, savedOutput.htmlHash);
      assertEqual(`${template.templateId}/${language} previewHtmlHash`, output.previewHtmlHash, savedOutput.previewHtmlHash);
      assertEqual(`${template.templateId}/${language} sectionTextInventory`, output.sectionTextInventory, savedOutput.sectionTextInventory);
      assertEqual(`${template.templateId}/${language} missingSections`, output.missingSections, savedOutput.missingSections);
      assertEqual(`${template.templateId}/${language} assets`, output.assets, savedOutput.assets);
      assertEqual(`${template.templateId}/${language} clientMetrics`, output.clientMetrics, savedOutput.clientMetrics);
      if (output.pdfMetadata.status === 'generated') {
        const { producer: _currentProducer, ...currentPdf } = output.pdfMetadata;
        const { producer: _savedProducer, ...savedPdf } = savedOutput.pdfMetadata;
        assertEqual(`${template.templateId}/${language} pdfMetadata`, currentPdf, savedPdf);
      }
    }
  }
}

function countDomNodes(markup: string): number {
  return [...markup.matchAll(/<([a-z][a-z0-9-]*)(?:\s|>)/gi)].length;
}

function collectStringValues(value: unknown, result: string[]): void {
  if (typeof value === 'string') {
    result.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, result);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStringValues(item, result);
  }
}

export async function collectClientChunkMetrics(rootDir: string): Promise<ClientChunkMetrics> {
  const candidates = [
    '.next/app-build-manifest.json',
    '.next/build-manifest.json',
    '.next/server/app-build-manifest.json',
    '.next/server/app/[locale]/editor/[id]/page_client-reference-manifest.js',
    '.next/server/app/[locale]/preview/[id]/page_client-reference-manifest.js',
    '.next/server/app/[locale]/templates/page_client-reference-manifest.js',
    '.next/server/app/[locale]/dashboard/page_client-reference-manifest.js',
  ];
  const manifestPaths: string[] = [];
  const referencedFiles = new Set<string>();
  for (const candidate of candidates) {
    try {
      const source = await readFile(path.join(rootDir, candidate), 'utf8');
      const assignmentMarker = '] = ';
      const assignmentIndex = source.lastIndexOf(assignmentMarker);
      const manifest = JSON.parse(assignmentIndex >= 0 ? source.slice(assignmentIndex + assignmentMarker.length) : source);
      manifestPaths.push(candidate);
      const values: string[] = [];
      collectStringValues(manifest, values);
      for (const value of values) {
        const normalized = value.replace(/^\/?_next\//, '').replace(/^\//, '');
        if (/^static\/chunks\/.+\.(?:js|css)$/.test(normalized)) referencedFiles.add(normalized);
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') continue;
      throw new Error(`Failed to parse target manifest ${candidate}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const files: Extract<ClientChunkMetrics, { status: 'available' }>['files'] = [];
  for (const relativePath of [...referencedFiles].sort()) {
    try {
      const contents = await readFile(path.join(rootDir, '.next', relativePath));
      files.push({
        path: relativePath,
        rawBytes: contents.byteLength,
        gzipBytes: gzipSync(contents).byteLength,
        brotliBytes: brotliCompressSync(contents).byteLength,
      });
    } catch {
      throw new Error(`Missing referenced client chunk: ${relativePath}`);
    }
  }
  if (!files.length) {
    return {
      status: 'unavailable',
      reason: manifestPaths.length
        ? 'Build manifests contain no readable static client chunks.'
        : 'No readable Next production build manifest exists.',
      manifestPaths,
      fileCount: 0,
      rawBytes: 0,
      gzipBytes: 0,
      brotliBytes: 0,
      files: [],
    };
  }
  return {
    status: 'available',
    manifestPaths,
    fileCount: files.length,
    rawBytes: files.reduce((sum, file) => sum + file.rawBytes, 0),
    gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
    brotliBytes: files.reduce((sum, file) => sum + file.brotliBytes, 0),
    files,
  };
}

async function generatePdfMetadata(browser: Browser, html: string, fontOrigin: string): Promise<PdfMetadata> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith(`${fontOrigin}/`)) void request.continue();
      else if (/^https?:/i.test(request.url())) void request.abort();
      else void request.continue();
    });
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForBaselineFonts(page);
    const buffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }));
    return { status: 'generated', ...(await readPdfMetadata(new Uint8Array(buffer))) };
  } finally {
    await page.close();
  }
}

type ResourceCleanup = () => void | Promise<void>;

export async function runWithResourceCleanup<T>(
  operation: (defer: (cleanup: ResourceCleanup) => void) => Promise<T>,
): Promise<T> {
  const cleanups: ResourceCleanup[] = [];
  let outcome: { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };
  try {
    outcome = { status: 'fulfilled', value: await operation((cleanup) => cleanups.push(cleanup)) };
  } catch (error) {
    outcome = { status: 'rejected', reason: error };
  }

  const cleanupErrors: unknown[] = [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (outcome.status === 'rejected') {
    if (cleanupErrors.length) {
      throw new AggregateError(
        [outcome.reason, ...cleanupErrors],
        'Collector operation and resource cleanup failed',
      );
    }
    throw outcome.reason;
  }
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, 'Collector resource cleanup failed');
  return outcome.value;
}

export async function collectBaseline(options: CollectBaselineOptions = {}): Promise<BaselineReport> {
  const rootDir = options.rootDir || process.cwd();
  const languages = options.languages || ['zh', 'en'];
  const includePdf = options.includePdf ?? true;
  if (!includePdf && !options.partial) throw new Error('includePdf=false requires explicit partial:true mode');
  const fixturePath = path.join(rootDir, FIXTURE_PATH);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, Resume>;
  validateFixture(fixture);

  const inventory = await collectInventory(rootDir);
  if (inventory.mismatches.length) throw new Error(`Template inventory mismatch:\n${inventory.mismatches.join('\n')}`);

  let toolchainFingerprint: ToolchainFingerprint | null = null;
  const templates: BaselineReport['templates'] = [];

  await runWithResourceCleanup(async (defer) => {
    const browser = includePdf
      ? await puppeteer.launch({ executablePath: await resolveChromeExecutable(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
      : undefined;
    if (browser) defer(() => browser.close());
    const fontServer = includePdf ? await startBaselineFontServer(rootDir) : undefined;
    if (fontServer) defer(() => fontServer.close());
    const mupdfPackage = JSON.parse(await readFile(path.join(rootDir, 'node_modules/mupdf/package.json'), 'utf8')) as { version?: string };
    const baselineFonts = await loadBaselineFontAssets(rootDir, fontServer?.origin);
    toolchainFingerprint = browser ? {
      browserVersion: await browser.version(),
      mupdfVersion: mupdfPackage.version || 'unknown',
      fontStrategy: 'loopback-only Noto Sans SC regular/bold; all external network blocked',
      fontAssets: baselineFonts.assets,
      nodeVersion: process.version,
      zlibVersion: process.versions.zlib || 'unknown',
      brotliVersion: process.versions.brotli || 'unknown',
      platform: process.platform,
      arch: process.arch,
    } : null;

    for (const templateId of TEMPLATES) {
      const outputs: Record<string, TemplateOutput> = {};
      const templateSourceBytes = (await stat(path.join(rootDir, PREVIEW_DIR, `${templateId}.tsx`))).size;
      const PreviewTemplate = await loadLegacyTemplateAdapter(templateId);
      for (const language of languages) {
        const resume = cloneResume(fixture[language], templateId);
        const html = await generateHtml(structuredClone(resume) as unknown as ResumeWithSections, false);
        const repeatHtml = await generateHtml(structuredClone(resume) as unknown as ResumeWithSections, false);
        if (html !== repeatHtml) throw new Error(`${templateId}/${language} HTML output is not reproducible`);
        const pdfHtml = includePdf
          ? injectBaselineFonts(await generateHtml(structuredClone(resume) as unknown as ResumeWithSections, true), baselineFonts.css)
          : '';
        const previewMarkup = renderToStaticMarkup(React.createElement(PreviewTemplate, { resume }));
        const repeatPreviewMarkup = renderToStaticMarkup(React.createElement(PreviewTemplate, { resume }));
        if (previewMarkup !== repeatPreviewMarkup) throw new Error(`${templateId}/${language} preview SSR output is not reproducible`);
        let sectionTextInventory: SectionTextInventory[];
        try {
          sectionTextInventory = buildSectionTextInventory(resume, previewMarkup, html);
        } catch (error) {
          throw new Error(`${templateId}/${language}: ${error instanceof Error ? error.message : error}`);
        }
        const missingSections = sectionTextInventory
          .filter((section) => section.missingPreview.length || section.missingExport.length)
          .map((section) => section.sectionType);

        outputs[language] = {
          htmlHash: sha256(html),
          previewHtmlHash: sha256(previewMarkup),
          pdfMetadata: browser
            ? await generatePdfMetadata(browser, pdfHtml, fontServer!.origin)
            : { status: 'skipped', reason: 'PDF generation disabled by caller' },
          sectionTextInventory,
          missingSections,
          assets: extractAssets(html, previewMarkup),
          clientMetrics: {
            domNodeCount: countDomNodes(previewMarkup),
            dataSectionCount: (previewMarkup.match(/\bdata-section(?:=|\s|>)/g) || []).length,
            renderedBytes: Buffer.byteLength(previewMarkup),
            templateSourceBytes,
          },
        };
      }
      templates.push({ templateId, outputs });
    }
  });

  const report: BaselineReport = {
    schemaVersion: 1,
    fixturePath: FIXTURE_PATH,
    toolchainFingerprint,
    inventory,
    clientChunkMetrics: await collectClientChunkMetrics(rootDir),
    templates,
  };
  if (options.writeReport) {
    const reportPath = options.reportPath || path.join(rootDir, REPORT_PATH);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const json = process.argv.includes('--json');
  const report = await collectBaseline({ writeReport: update });
  if (!update) {
    const saved = JSON.parse(await readFile(path.join(process.cwd(), REPORT_PATH), 'utf8')) as BaselineReport;
    assertBaselineMatches(report, saved);
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const outputs = report.templates.flatMap((template) => Object.values(template.outputs));
    process.stdout.write(`${JSON.stringify({
      mode: update ? 'update' : 'verify',
      reportPath: REPORT_PATH,
      templates: report.templates.length,
      outputs: outputs.length,
      pdfGenerated: outputs.filter((output) => output.pdfMetadata.status === 'generated').length,
      missingSections: outputs.reduce((sum, output) => sum + output.missingSections.length, 0),
      clientChunks: report.clientChunkMetrics.fileCount,
      toolchainFingerprint: report.toolchainFingerprint,
    })}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
