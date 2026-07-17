import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECTION_TYPES, TEMPLATES } from '@/lib/constants';
import fixture from '../../../test-fixtures/templates/legacy-baseline-resume.json';
import {
  assertBaselineMatches,
  buildSectionTextInventory,
  collectBaseline,
  collectClientChunkMetrics,
  collectInventory,
  extractScopedSectionTexts,
  extractAssets,
  readPdfMetadata,
  resolveChromeExecutable,
  type BaselineReport,
} from '../../../scripts/templates/collect-baseline';

function contentText(value: unknown): string {
  if (Array.isArray(value)) return value.map(contentText).join(' ');
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['id', 'resumeId', 'createdAt', 'updatedAt'].includes(key))
    .map(([, child]) => contentText(child)).join(' ');
  return value == null ? '' : String(value);
}

const EXPECTED_TEMPLATE_IDS = [
  'classic', 'modern', 'minimal', 'professional', 'two-column', 'creative', 'ats', 'academic', 'elegant', 'executive',
  'developer', 'designer', 'startup', 'formal', 'infographic', 'compact', 'euro', 'clean', 'bold', 'timeline',
  'nordic', 'corporate', 'consultant', 'finance', 'medical', 'gradient', 'metro', 'material', 'coder', 'blocks',
  'magazine', 'artistic', 'retro', 'neon', 'watercolor', 'swiss', 'japanese', 'berlin', 'luxe', 'rose',
  'architect', 'legal', 'teacher', 'scientist', 'engineer', 'sidebar', 'card', 'zigzag', 'ribbon', 'mosaic',
] as const;

describe('legacy template baseline', () => {
  it('freezes the legacy template IDs', () => {
    expect(TEMPLATES).toEqual(EXPECTED_TEMPLATE_IDS);
  });

  it.each(['zh', 'en'] as const)('contains every supported section in the %s fixture', (language) => {
    expect(fixture[language].sections.map((section) => section.type)).toEqual(SECTION_TYPES);
  });

  it('provides the baseline collector required to verify preview and export parity', async () => {
    const collector = path.resolve(process.cwd(), 'scripts/templates/collect-baseline.ts');
    await expect(access(collector)).resolves.toBeUndefined();
    const module = await import('../../../scripts/templates/collect-baseline');
    expect(module.collectInventory).toBeTypeOf('function');
    expect(module.collectBaseline).toBeTypeOf('function');
    expect(module.extractAssets).toBeTypeOf('function');
    expect(module.collectClientChunkMetrics).toBeTypeOf('function');
    expect(module.buildSectionTextInventory).toBeTypeOf('function');
    expect(module.assertBaselineMatches).toBeTypeOf('function');
    expect(module.extractScopedSectionTexts).toBeTypeOf('function');
    expect(module.resolveChromeExecutable).toBeTypeOf('function');
    expect(module.readPdfMetadata).toBeTypeOf('function');
    expect(module.loadBaselineFontAssets).toBeTypeOf('function');
    expect(module.waitForBaselineFonts).toBeTypeOf('function');
  });

  it('keeps every legacy registry and template source in parity', async () => {
    const inventory = await collectInventory(process.cwd());
    const expected = [...EXPECTED_TEMPLATE_IDS];

    expect(inventory.mismatches).toEqual([]);
    for (const ids of Object.values(inventory.templateIds)) {
      expect(ids).toEqual(expected);
    }
    expect(inventory.labels).toHaveLength(expected.length);
    expect(inventory.sourceFiles).toHaveLength(expected.length * 2);
  });

  it('extracts quoted HTML and CSS assets without truncation and decodes entities', () => {
    const document = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E">
      <a href='https://example.test/path?x=1&amp;y=2'>link</a>
      <style>.hero{background:url("https://cdn.example.test/bg.png?x=1&amp;y=2")}.icon{mask:url(data:image/svg+xml,%3Csvg%3E)}</style>`;

    expect(extractAssets(document)).toEqual([
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E",
      'data:image/svg+xml,%3Csvg%3E',
      'https://cdn.example.test/bg.png?x=1&y=2',
      'https://example.test/path?x=1&y=2',
    ]);
  });

  it('measures actual Next client chunk files from build manifests', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'jadeai-chunks-'));
    try {
      await mkdir(path.join(rootDir, '.next/static/chunks'), { recursive: true });
      await writeFile(path.join(rootDir, '.next/app-build-manifest.json'), JSON.stringify({
        pages: { '/editor': ['static/chunks/editor-a.js', 'static/chunks/editor-b.js'] },
      }));
      await writeFile(path.join(rootDir, '.next/static/chunks/editor-a.js'), 'const alpha = "template";');
      await writeFile(path.join(rootDir, '.next/static/chunks/editor-b.js'), 'const beta = "preview";');
      await mkdir(path.join(rootDir, '.next/server/app/[locale]/editor/[id]'), { recursive: true });
      await writeFile(path.join(rootDir, '.next/static/chunks/editor-c.js'), 'const gamma = "route";');
      await writeFile(
        path.join(rootDir, '.next/server/app/[locale]/editor/[id]/page_client-reference-manifest.js'),
        'globalThis.__RSC_MANIFEST["/[locale]/editor/[id]/page"] = {"entryJSFiles":{"editor":["static/chunks/editor-c.js"]}}',
      );

      const metrics = await collectClientChunkMetrics(rootDir);
      expect(metrics.status).toBe('available');
      expect(metrics.files.map((file) => file.path)).toEqual([
        'static/chunks/editor-a.js',
        'static/chunks/editor-b.js',
        'static/chunks/editor-c.js',
      ]);
      expect(metrics.fileCount).toBe(3);
      expect(metrics.rawBytes).toBe(70);
      expect(metrics.gzipBytes).toBeGreaterThan(0);
      expect(metrics.brotliBytes).toBeGreaterThan(0);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('fails for malformed target manifests and missing referenced chunks', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'jadeai-bad-chunks-'));
    try {
      await mkdir(path.join(rootDir, '.next'), { recursive: true });
      await writeFile(path.join(rootDir, '.next/app-build-manifest.json'), '{bad json');
      await expect(collectClientChunkMetrics(rootDir)).rejects.toThrow(/parse.*app-build-manifest/i);
      await writeFile(path.join(rootDir, '.next/app-build-manifest.json'), JSON.stringify({ files: ['static/chunks/missing.js'] }));
      await expect(collectClientChunkMetrics(rootDir)).rejects.toThrow(/missing.*static\/chunks\/missing.js/i);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('checks complete multi-item section text in both preview and export', () => {
    const resume = structuredClone(fixture.en) as any;
    resume.sections = resume.sections.filter((section: any) => ['personal_info', 'work_experience', 'education'].includes(section.type));
    const personal = contentText(resume.sections[0].content);
    const work = contentText(resume.sections[1].content);
    const education = contentText(resume.sections[2].content);
    const markup = `<header>${personal}</header><section data-section>${work}</section><section data-section>${education}</section>`;
    const inventory = buildSectionTextInventory(resume, markup, markup);
    const workInventory = inventory.find((section) => section.sectionType === 'work_experience')!;
    expect(workInventory.previewText).toContain('Fictional Systems Ltd');
    expect(workInventory.exportText).toContain('Fictional Systems Ltd');
    expect(workInventory.fieldMatrixText).toEqual(expect.arrayContaining(['Berlin', '2021-04', '2021-03']));
    expect(workInventory.previewOmittedText).toContain('Present');
    expect(workInventory.exportOmittedText).toContain('Present');

    const misplaced = `<header>${personal}</header><section data-section>${work.replace('Fictional Systems Ltd', '')}</section><section data-section>Fictional Systems Ltd ${education}</section>`;
    expect(() => buildSectionTextInventory(resume, misplaced, markup))
      .toThrow(/preview.*work_experience.*Fictional Systems Ltd/i);
    expect(() => buildSectionTextInventory(resume, `<header>${personal}</header><section data-section>${work} ${education}</section>`, markup))
      .toThrow(/container count/i);
    expect(extractScopedSectionTexts(markup).sections).toHaveLength(2);
  });

  it('excludes head, style, script, and template content from scoped text', () => {
    const markup = `<!doctype html><html><head><style>.secret{color:red}</style><script>window.secret='js'</script></head>
      <body><style>.body-secret{display:none}</style><template>template-secret</template><header>Alex Berlin</header>
      <section data-section><h2>Work</h2><p>Visible work</p><script>section-secret</script></section></body></html>`;
    const scoped = extractScopedSectionTexts(markup);
    expect(scoped.outsideText).toContain('Alex Berlin');
    expect(scoped.outsideText).not.toMatch(/secret|color:red|display:none/i);
    expect(scoped.sections).toEqual(['Work Visible work']);
  });

  it('loads fixed local PDF fonts with stable hashes and data URLs', async () => {
    const module = await import('../../../scripts/templates/collect-baseline');
    expect(module.loadBaselineFontAssets).toBeTypeOf('function');
    const fonts = await module.loadBaselineFontAssets(process.cwd());
    expect(fonts.assets).toEqual([
      expect.objectContaining({ path: 'public/fonts/NotoSansSC-Regular.otf', sha256: 'faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9' }),
      expect.objectContaining({ path: 'public/fonts/NotoSansSC-Bold.otf', sha256: 'c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0' }),
    ]);
    expect(fonts.css).toContain('data:font/otf;base64,');
    expect(fonts.css).not.toContain('system-ui');
    const loopbackFonts = await module.loadBaselineFontAssets(process.cwd(), 'http://127.0.0.1:43210');
    expect(loopbackFonts.css).toContain("url('http://127.0.0.1:43210/NotoSansSC-Regular.otf')");
    expect(loopbackFonts.css).not.toContain('base64,');
  });

  it('waits for both baseline PDF font weights and rejects missing fonts', async () => {
    const module = await import('../../../scripts/templates/collect-baseline');
    const page = {
      evaluate: async () => ({ regular: true, bold: false }),
    };
    await expect(module.waitForBaselineFonts(page as any, 100)).rejects.toThrow(/bold.*not loaded/i);
    page.evaluate = async () => ({ regular: true, bold: true });
    await expect(module.waitForBaselineFonts(page as any, 100)).resolves.toBeUndefined();
  });

  it('detects saved baseline drift instead of accepting any SHA-shaped value', async () => {
    const saved = JSON.parse(await readFile(path.resolve(process.cwd(), 'test-fixtures/templates/legacy-baseline-report.json'), 'utf8')) as BaselineReport;
    const same = structuredClone(saved);
    expect(() => assertBaselineMatches(same, saved)).not.toThrow();

    same.templates[0].outputs.en.htmlHash = '0'.repeat(64);
    expect(() => assertBaselineMatches(same, saved)).toThrow(/classic\/en.*htmlHash/i);

    const previewDrift = structuredClone(saved);
    previewDrift.templates[0].outputs.en.sectionTextInventory[0].previewText = 'missing preview body';
    expect(() => assertBaselineMatches(previewDrift, saved)).toThrow(/classic\/en.*sectionTextInventory/i);

    const previewStructureDrift = structuredClone(saved) as any;
    previewStructureDrift.templates[0].outputs.en.previewHtmlHash = 'a'.repeat(64);
    const savedWithPreviewHash = structuredClone(saved) as any;
    savedWithPreviewHash.templates[0].outputs.en.previewHtmlHash = 'b'.repeat(64);
    expect(() => assertBaselineMatches(previewStructureDrift, savedWithPreviewHash)).toThrow(/previewHtmlHash/i);

    const fixtureDrift = structuredClone(saved);
    fixtureDrift.fixturePath = 'elsewhere.json';
    expect(() => assertBaselineMatches(fixtureDrift, saved)).toThrow(/fixturePath/i);

    const producerOnly = structuredClone(saved) as any;
    producerOnly.templates[0].outputs.en.pdfMetadata.producer = 'Different Chromium producer';
    expect(() => assertBaselineMatches(producerOnly, saved)).not.toThrow();

    const toolchainDrift = structuredClone(saved) as any;
    toolchainDrift.toolchainFingerprint = { browserVersion: 'changed' };
    const savedToolchain = structuredClone(saved) as any;
    savedToolchain.toolchainFingerprint = { browserVersion: 'saved' };
    expect(() => assertBaselineMatches(toolchainDrift, savedToolchain)).toThrow(/toolchain/i);
  });

  it('resolves local Chrome and releases MuPDF page/document on errors', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'jadeai-chrome-'));
    try {
      const executable = path.join(rootDir, 'chrome');
      await writeFile(executable, 'binary');
      await expect(resolveChromeExecutable({ env: { CHROME_PATH: executable }, candidates: [] })).resolves.toBe(executable);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }

    const released: string[] = [];
    const page = { getBounds: () => { throw new Error('bounds failed'); }, destroy: () => released.push('page') };
    const document = { loadPage: () => page, countPages: () => 1, getMetaData: () => 'PDF', destroy: () => released.push('document') };
    await expect(readPdfMetadata(new Uint8Array([1]), { openDocument: () => document } as any)).rejects.toThrow('bounds failed');
    expect(released).toEqual(['page', 'document']);
  });

  it('releases acquired collector resources when fingerprint initialization fails', async () => {
    const module = await import('../../../scripts/templates/collect-baseline');
    const released: string[] = [];
    const fingerprintError = new Error('fingerprint failed');

    await expect(module.runWithResourceCleanup(async (defer) => {
      defer(async () => { released.push('browser'); });
      defer(async () => { released.push('font-server'); });
      throw fingerprintError;
    })).rejects.toBe(fingerprintError);

    expect(released).toEqual(['browser', 'font-server']);
  });

  it('continues collector resource cleanup when the first close fails', async () => {
    const module = await import('../../../scripts/templates/collect-baseline');
    const released: string[] = [];
    const browserCloseError = new Error('browser close failed');

    await expect(module.runWithResourceCleanup(async (defer) => {
      defer(async () => {
        released.push('browser');
        throw browserCloseError;
      });
      defer(async () => { released.push('font-server'); });
    })).rejects.toBe(browserCloseError);

    expect(released).toEqual(['browser', 'font-server']);
  });

  it('requires explicit partial mode when PDF evidence is disabled', async () => {
    await expect(collectBaseline({ rootDir: process.cwd(), includePdf: false, languages: ['en'] } as any))
      .rejects.toThrow(/partial/i);
  });

  it('produces deterministic HTML with every fixture section and measurable client DOM output', async () => {
    const report = await collectBaseline({
      rootDir: process.cwd(),
      languages: ['zh', 'en'],
      includePdf: false,
      partial: true,
      writeReport: false,
    });
    const expectedSectionTypes = fixture.en.sections.map((section) => section.type);

    expect(report.templates).toHaveLength(EXPECTED_TEMPLATE_IDS.length);
    for (const template of report.templates) {
      for (const language of ['zh', 'en'] as const) {
        expect(template.outputs[language].htmlHash).toMatch(/^[a-f0-9]{64}$/);
        expect(template.outputs[language].previewHtmlHash).toMatch(/^[a-f0-9]{64}$/);
        expect(template.outputs[language].sectionTextInventory.map((section) => section.sectionType)).toEqual(expectedSectionTypes);
        expect(template.outputs[language].missingSections).toEqual([]);
        expect(template.outputs[language].assets.length).toBeGreaterThan(0);
        expect(template.outputs[language].clientMetrics.domNodeCount).toBeGreaterThan(0);
        expect(template.outputs[language].clientMetrics.dataSectionCount).toBe(expectedSectionTypes.length - 1);
      }
    }
  }, 30_000);
});
