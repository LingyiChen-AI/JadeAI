import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SECTION_TYPES, TEMPLATES } from '../../src/lib/constants';
import {
  validateLegacyCatalog,
  validateLegacyCatalogFiles,
  validateRenderedAssetHashes,
  writeImmutableAssetSet,
} from './legacy-catalog';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CATALOG_PATH = path.join(ROOT, 'template-sources/legacy/catalog.json');
const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSIONED_ASSET_PATH = /^templates\/[a-z0-9]+(?:-[a-z0-9]+)*\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\/[a-z0-9][a-z0-9.-]*\.png$/;
const APPROVED_CATEGORIES = [
  '通用', 'ATS', '技术研发', '产品运营', '设计创意', '金融咨询',
  '教育学术', '医疗科研', '管理高管', '应届校招', '中文特色', '国际求职',
] as const;

type Definition = { id: string; nameZh: string; nameEn: string };
type TagDefinition = Definition & { dimension: 'layout' | 'style' | 'scenario' | 'capability' | 'paper' | 'source' | 'export' };
type AliasDefinition = { alias: string; templateId: string };
type CatalogAsset = {
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  mediaType: 'image/png';
};
type CatalogEntry = {
  id: string;
  slug: string;
  version: string;
  nameZh: string;
  nameEn: string;
  category: string;
  tags: string[];
  aliases: string[];
  rendererKind: 'legacy-react';
  source: { kind: 'built-in'; preview: string; previewSha256: string; export: string; exportSha256: string };
  license: { spdx: 'Apache-2.0'; path: 'LICENSE'; sha256: string; copyright: string };
  provenance: {
    fixturePath: string;
    baselineReportPath: string;
    fixtureSha256: string;
    baselineReportSha256: string;
    languages: ['zh', 'en'];
    network: 'disabled';
  };
  capabilities: {
    supportedSections: string[];
    paperSizes: ['a4', 'letter'];
    supportsAvatar: boolean;
    atsCompatible: boolean;
    supportsZh: true;
    supportsEn: true;
    supportsHtml: true;
    supportsPdf: true;
    docxFidelity: 'unsupported';
  };
  manifest: Record<string, unknown>;
  manifestHash: string;
  thumbnail: CatalogAsset;
  preview: CatalogAsset;
};
type LegacyCatalog = {
  schemaVersion: 1;
  categories: Definition[];
  tags: TagDefinition[];
  aliases: AliasDefinition[];
  templates: CatalogEntry[];
};

async function readCatalog(): Promise<LegacyCatalog> {
  return JSON.parse(await readFile(CATALOG_PATH, 'utf8')) as LegacyCatalog;
}

function sha256Bytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fakeRenderedAssets(): Record<(typeof TEMPLATES)[number], { thumbnail: Buffer; preview: Buffer }> {
  return Object.fromEntries(TEMPLATES.map((template, index) => [template, {
    thumbnail: Buffer.from(`thumbnail-${index}-${template}`),
    preview: Buffer.from(`preview-${index}-${template}`),
  }])) as Record<(typeof TEMPLATES)[number], { thumbnail: Buffer; preview: Buffer }>;
}

async function fileHash(relativePath: string): Promise<string> {
  return sha256Bytes(await readFile(path.join(ROOT, relativePath)));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function readPngDimensions(bytes: Buffer): [number, number] {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('legacy template catalog', () => {
  it('defines exactly the approved categories and controlled tag and alias registries', async () => {
    const catalog = await readCatalog();
    const categoryIds = new Set(catalog.categories.map(({ id }) => id));
    const tagIds = new Set(catalog.tags.map(({ id }) => id));
    const aliases = new Map(catalog.aliases.map(({ alias, templateId }) => [alias, templateId]));

    expect(catalog.categories.map(({ nameZh }) => nameZh)).toEqual(APPROVED_CATEGORIES);
    expect(new Set(catalog.categories.map(({ id }) => id)).size).toBe(12);
    expect(catalog.tags.length).toBeGreaterThan(0);
    expect(new Set(catalog.tags.map(({ id }) => id)).size).toBe(catalog.tags.length);
    expect(new Set(catalog.aliases.map(({ alias }) => alias)).size).toBe(catalog.aliases.length);
    for (const entry of catalog.templates) {
      expect(categoryIds.has(entry.category), entry.id).toBe(true);
      expect(entry.tags.length, entry.id).toBeGreaterThan(0);
      expect(entry.tags.every((tag) => tagIds.has(tag)), entry.id).toBe(true);
      expect(entry.aliases.every((alias) => aliases.get(alias) === entry.id), entry.id).toBe(true);
    }
    expect(new Set(catalog.templates.map(({ category }) => category))).toEqual(categoryIds);
  });

  it('covers the exact 50-item TEMPLATES registry once and in registry order', async () => {
    const catalog = await readCatalog();
    const ids = catalog.templates.map((entry) => entry.id);

    expect(catalog.schemaVersion).toBe(1);
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...TEMPLATES]);
  });

  it('validates renderer, semantic version, source, SPDX license, provenance, and capabilities', async () => {
    const catalog = await readCatalog();

    for (const entry of catalog.templates) {
      expect(entry.slug).toBe(entry.id);
      expect(entry.slug).toMatch(SAFE_ID);
      expect(entry.version).toMatch(SEMVER);
      expect(entry.rendererKind).toBe('legacy-react');
      expect(entry.source.kind).toBe('built-in');
      expect(entry.source.preview).toBe(`src/components/preview/templates/${entry.id}.tsx`);
      expect(entry.source.export).toBe(`src/app/api/resume/[id]/export/templates/${entry.id}.ts`);
      expect(entry.source.previewSha256).toBe(sha256Bytes(await readFile(path.join(ROOT, entry.source.preview))));
      expect(entry.source.exportSha256).toBe(sha256Bytes(await readFile(path.join(ROOT, entry.source.export))));
      expect(entry.license.spdx).toBe('Apache-2.0');
      expect(entry.license.path).toBe('LICENSE');
      expect(entry.license.sha256).toMatch(SHA256);
      expect(entry.license.sha256).toBe(await fileHash('LICENSE'));
      expect(entry.license.copyright.trim()).not.toBe('');
      expect(entry.provenance).toMatchObject({
        fixturePath: 'test-fixtures/templates/legacy-baseline-resume.json',
        baselineReportPath: 'test-fixtures/templates/legacy-baseline-report.json',
        languages: ['zh', 'en'],
        network: 'disabled',
      });
      expect(entry.provenance.fixtureSha256).toMatch(SHA256);
      expect(entry.provenance.baselineReportSha256).toMatch(SHA256);
      expect(entry.capabilities.supportedSections).toEqual([...SECTION_TYPES]);
      expect(entry.capabilities.paperSizes).toEqual(['a4', 'letter']);
      expect(entry.capabilities).toMatchObject({
        supportsZh: true,
        supportsEn: true,
        supportsHtml: true,
        supportsPdf: true,
        docxFidelity: 'unsupported',
      });
    }
  });

  it('uses safe version-owned paths and verifies every real nonblank PNG and SHA-256', async () => {
    const catalog = await readCatalog();

    for (const entry of catalog.templates) {
      for (const [kind, asset] of [['thumbnail', entry.thumbnail], ['preview', entry.preview]] as const) {
        expect(asset.path).toMatch(VERSIONED_ASSET_PATH);
        expect(asset.path.startsWith(`templates/${entry.slug}/v${entry.version}/`)).toBe(true);
        expect(asset.sha256).toMatch(SHA256);
        const filenameHash = path.basename(asset.path).match(/^(?:thumbnail|preview)-([0-9a-f]{16})\.png$/)?.[1];
        expect(filenameHash).toBe(asset.sha256.slice(0, 16));
        expect(asset.mediaType).toBe('image/png');
        const bytes = await readFile(path.join(ROOT, 'public', asset.path));
        const metadata = await stat(path.join(ROOT, 'public', asset.path));
        expect(metadata.size, asset.path).toBe(asset.bytes);
        expect(metadata.size, asset.path).toBeGreaterThan(1024);
        expect(readPngDimensions(bytes), asset.path).toEqual([asset.width, asset.height]);
        expect(asset.width, kind).toBe(kind === 'thumbnail' ? 400 : 1200);
        expect(asset.height, kind).toBe(kind === 'thumbnail' ? 300 : 900);
        expect(new Set(Array.from(bytes.subarray(33))).size, asset.path).toBeGreaterThan(16);
        expect(sha256Bytes(bytes)).toBe(asset.sha256);
      }
    }
  });

  it('hashes each canonical manifest and checks fixture and baseline provenance hashes', async () => {
    const catalog = await readCatalog();
    const fixtureBytes = await readFile(path.join(ROOT, 'test-fixtures/templates/legacy-baseline-resume.json'));
    const baselineBytes = await readFile(path.join(ROOT, 'test-fixtures/templates/legacy-baseline-report.json'));

    for (const entry of catalog.templates) {
      expect(entry.manifestHash).toMatch(SHA256);
      expect(entry.manifestHash).toBe(sha256Bytes(canonicalize(entry.manifest)));
      expect(entry.provenance.fixtureSha256).toBe(sha256Bytes(fixtureBytes));
      expect(entry.provenance.baselineReportSha256).toBe(sha256Bytes(baselineBytes));
    }
  });

  it('contains bilingual aggregate evidence without fixture PII or external URLs', async () => {
    const raw = await readFile(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(raw) as LegacyCatalog;

    expect(catalog.templates.every(({ provenance }) => provenance.languages.join(',') === 'zh,en')).toBe(true);
    expect(raw).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(raw).not.toMatch(/https?:\/\//i);
    expect(raw).not.toContain('林晓岚');
    expect(raw).not.toContain('Alex Morgan');
  });

  it('rebuilds the checked-in catalog seed deterministically and verifies checked-in files', async () => {
    const [{ buildLegacyCatalogSeed, verifyLegacyCatalogFiles }, checkedIn] = await Promise.all([
      import('./legacy-catalog'),
      readCatalog(),
    ]);

    expect(await buildLegacyCatalogSeed()).toEqual(checkedIn);
    expect(await buildLegacyCatalogSeed()).toEqual(await buildLegacyCatalogSeed());
    await expect(verifyLegacyCatalogFiles()).resolves.toEqual({ assets: 100, templates: 50 });
  });

  it('rejects injected structural catalog faults with stable error codes', async () => {
    const valid = await readCatalog();
    const cases: Array<[string, (catalog: LegacyCatalog) => void]> = [
      ['legacy_name_required', (catalog) => { catalog.templates[0].nameZh = ''; }],
      ['legacy_duplicate_template_id', (catalog) => { catalog.templates[1].id = catalog.templates[0].id; }],
      ['legacy_category_unknown', (catalog) => { catalog.templates[0].category = 'unknown'; }],
      ['legacy_tag_unknown', (catalog) => { catalog.templates[0].tags.push('unknown'); }],
      ['legacy_tag_dimension_invalid', (catalog) => { (catalog.tags[0] as unknown as { dimension: string }).dimension = 'language'; }],
      ['legacy_asset_path_duplicate', (catalog) => { catalog.templates[0].preview.path = catalog.templates[0].thumbnail.path; }],
      ['legacy_asset_hash_duplicate', (catalog) => { catalog.templates[1].preview.sha256 = catalog.templates[0].preview.sha256; }],
      ['legacy_asset_filename_prefix_mismatch', (catalog) => { catalog.templates[0].thumbnail.path = catalog.templates[0].thumbnail.path.replace('/thumbnail-', '/preview-'); }],
      ['legacy_asset_path_invalid', (catalog) => {
        catalog.templates[0].thumbnail.path = `templates/classic/v1.0.0/../../../../outside/${path.basename(catalog.templates[0].thumbnail.path)}`;
      }],
    ];
    for (const [code, mutate] of cases) {
      const injected = structuredClone(valid);
      mutate(injected);
      expect(() => validateLegacyCatalog(injected), code).toThrow(code);
    }
  });

  it('rejects injected file and rendered-output faults without touching checked-in assets', async () => {
    const valid = await readCatalog();
    const missing = structuredClone(valid);
    missing.templates[0].thumbnail.sha256 = `f${'0'.repeat(63)}`;
    missing.templates[0].thumbnail.path = `templates/classic/v1.0.0/thumbnail-${missing.templates[0].thumbnail.sha256.slice(0, 16)}.png`;
    await expect(validateLegacyCatalogFiles(missing, { rootDir: ROOT })).rejects.toThrow('legacy_asset_missing');

    const ioError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    await expect(validateLegacyCatalogFiles(valid, {
      rootDir: ROOT,
      readAsset: async () => { throw ioError; },
    })).rejects.toBe(ioError);

    const badHash = structuredClone(valid);
    const badHashPath = badHash.templates[0].preview.path;
    const corrupted = Buffer.from(await readFile(path.join(ROOT, 'public', badHashPath)));
    corrupted[corrupted.length - 1] ^= 1;
    await expect(validateLegacyCatalogFiles(badHash, {
      rootDir: ROOT,
      readAsset: async (absolutePath, relativePath) => relativePath === badHashPath ? corrupted : readFile(absolutePath),
    })).rejects.toThrow('legacy_asset_hash_mismatch');

    const tooSmall = structuredClone(valid);
    await expect(validateLegacyCatalogFiles(tooSmall, {
      rootDir: ROOT,
      readAsset: async () => Buffer.alloc(32),
    })).rejects.toThrow('legacy_asset_blank_or_too_small');

    const rendered = structuredClone(valid);
    await expect(validateRenderedAssetHashes(rendered, {
      classic: { thumbnail: Buffer.from('nonreproducible'), preview: Buffer.from('nonreproducible') },
    } as never)).rejects.toThrow('legacy_render_hash_mismatch');
    await expect(validateRenderedAssetHashes(rendered, {})).rejects.toThrow('legacy_render_assets_missing');
    await expect(validateRenderedAssetHashes(rendered, { classic: undefined })).rejects.toThrow('legacy_render_assets_missing');
    await expect(validateRenderedAssetHashes(rendered, {
      classic: { thumbnail: Buffer.from('thumbnail') } as never,
    })).rejects.toThrow('legacy_render_assets_missing');
  });

  it('preflights immutable version conflicts before writing any new asset', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'legacy-assets-conflict-'));
    try {
      const initial = fakeRenderedAssets();
      await writeImmutableAssetSet(initial, { rootDir });
      const before = await readdir(path.join(rootDir, 'public'), { recursive: true });
      const changed = structuredClone(initial);
      changed.classic.thumbnail = Buffer.from('changed-classic-thumbnail');

      await expect(writeImmutableAssetSet(changed, { rootDir })).rejects.toThrow('legacy_asset_version_conflict');
      expect(await readdir(path.join(rootDir, 'public'), { recursive: true })).toEqual(before);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('rolls back newly-created assets and directories after a mid-write failure', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'legacy-assets-rollback-'));
    try {
      await expect(writeImmutableAssetSet(fakeRenderedAssets(), {
        rootDir,
        beforeWrite: async (_relativePath, index) => {
          if (index === 3) throw new Error('injected_write_failure');
        },
      })).rejects.toThrow('injected_write_failure');
      await expect(readdir(path.join(rootDir, 'public'), { recursive: true })).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
