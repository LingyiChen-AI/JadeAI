import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { TemplateCapabilitySchema } from '../../src/lib/templates/schema';
import { hashManifest } from '../../src/lib/templates/normalize-manifest';
import {
  type TemplateSeedWriteReport,
  type TemplateTransaction,
  asTemplateTransaction,
  type VerifiedTemplateSeed,
  writeVerifiedTemplateSeed,
} from '../../src/lib/db/repositories/template.repository';
import { validateLegacyCatalogFiles, type LegacyAssetValidationOptions } from './legacy-catalog';
import { verifyExternalRelease } from './external-release';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_PATH = 'template-sources/legacy/catalog.json';
const LEGACY_CATALOG_PUBLISHED_AT = 1_784_160_000;

export type LegacyCatalog = {
  schemaVersion: number;
  categories: Array<{ id: string; nameZh: string; nameEn: string }>;
  tags: Array<{ id: string; nameZh: string; nameEn: string; dimension: string }>;
  aliases: Array<{ alias: string; templateId: string }>;
  templates: Array<{
    id: string;
    slug: string;
    version: string;
    nameZh: string;
    nameEn: string;
    category: string;
    tags: string[];
    aliases: string[];
    rendererKind: string;
    source: { kind: string; preview: string; previewSha256: string; export: string; exportSha256: string };
    license: { spdx: string; path: string; sha256: string; copyright: string };
    provenance: {
      fixturePath: string;
      baselineReportPath: string;
      fixtureSha256: string;
      baselineReportSha256: string;
      languages: string[];
      network: string;
    };
    capabilities: Record<string, unknown>;
    manifest: Record<string, unknown>;
    manifestHash: string;
    thumbnail: { path: string; sha256: string; bytes: number; width: number; height: number; mediaType: string };
    preview: { path: string; sha256: string; bytes: number; width: number; height: number; mediaType: string };
  }>;
};

export type SeedLegacyCatalogOptions = LegacyAssetValidationOptions & {
  databaseUrl: string;
  catalog?: LegacyCatalog;
  publishedAt?: number;
};

export type TemplateCliTarget = {
  databaseName: string;
  safeTarget: string;
  flags: Set<string>;
};

export function parseTemplateApplyCli(
  args: string[],
  databaseUrl: string,
  allowedFlags: string[] = [],
): TemplateCliTarget {
  const applyArguments = args.filter((arg) => arg.startsWith('--apply='));
  if (applyArguments.length !== 1) throw new Error('template_cli_apply_required');
  const flags = new Set(args.filter((arg) => !arg.startsWith('--apply=')));
  if ([...flags].some((flag) => !allowedFlags.includes(flag))) throw new Error('template_cli_argument_invalid');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const requestedDatabase = applyArguments[0]!.slice('--apply='.length);
  if (!databaseName || requestedDatabase !== databaseName) throw new Error('template_cli_apply_mismatch');
  const port = parsed.port || (parsed.protocol === 'postgresql:' ? '5432' : '');
  return {
    databaseName,
    safeTarget: `${parsed.hostname}${port ? `:${port}` : ''}/${databaseName}`,
    flags,
  };
}

export function parseSeedCatalogCli(args: string[], databaseUrl: string): Omit<TemplateCliTarget, 'flags'> {
  const target = parseTemplateApplyCli(args, databaseUrl);
  return { databaseName: target.databaseName, safeTarget: target.safeTarget };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeAlias(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/g, ' ');
}

async function readAndVerify(rootDir: string, relativePath: string, expectedHash: string, code: string): Promise<void> {
  const absoluteRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${code}_path_invalid`);
  const bytes = await readFile(absolutePath);
  if (sha256(bytes) !== expectedHash) throw new Error(`${code}_hash_mismatch`);
}

async function validatePublicationCatalog(
  catalog: LegacyCatalog,
  options: LegacyAssetValidationOptions,
): Promise<void> {
  const rootDir = options.rootDir ?? ROOT;
  await validateLegacyCatalogFiles(
    catalog as Parameters<typeof validateLegacyCatalogFiles>[0],
    { ...options, rootDir },
  );
  if (catalog.schemaVersion !== 1 || catalog.categories.length !== 12 || catalog.templates.length !== 50) {
    throw new Error('template_seed_catalog_shape_invalid');
  }
  for (const entry of catalog.templates) {
    if (canonicalize(entry.manifest) === undefined || sha256(canonicalize(entry.manifest)) !== entry.manifestHash) {
      throw new Error(`template_seed_manifest_hash_mismatch:${entry.id}`);
    }
    if (
      entry.manifest.schemaVersion !== 1
      || entry.manifest.rendererKind !== entry.rendererKind
      || entry.manifest.templateId !== entry.id
      || entry.manifest.version !== entry.version
    ) throw new Error(`template_seed_manifest_contract_invalid:${entry.id}`);
    if (!TemplateCapabilitySchema.safeParse(entry.capabilities).success) {
      throw new Error(`template_seed_capabilities_invalid:${entry.id}`);
    }
    if (entry.provenance.network !== 'disabled' || entry.provenance.languages.join(',') !== 'zh,en') {
      throw new Error(`template_seed_provenance_invalid:${entry.id}`);
    }
    await readAndVerify(rootDir, entry.source.preview, entry.source.previewSha256, 'template_seed_preview_source');
    await readAndVerify(rootDir, entry.source.export, entry.source.exportSha256, 'template_seed_export_source');
    await readAndVerify(rootDir, entry.license.path, entry.license.sha256, 'template_seed_license');
    await readAndVerify(rootDir, entry.provenance.fixturePath, entry.provenance.fixtureSha256, 'template_seed_fixture');
    await readAndVerify(rootDir, entry.provenance.baselineReportPath, entry.provenance.baselineReportSha256, 'template_seed_baseline');
  }
}

function buildVerifiedSeed(catalog: LegacyCatalog, publishedAt: number): VerifiedTemplateSeed {
  return {
    categories: catalog.categories.map((category, sortOrder) => ({
      ...category,
      slug: category.id,
      sortOrder,
    })),
    tags: catalog.tags.map((tag, sortOrder) => ({
      ...tag,
      slug: tag.id,
      sortOrder,
    })),
    tagAliases: catalog.tags.flatMap((tag) => ([
      { id: `${tag.id}:zh`, tagId: tag.id, locale: 'zh', alias: tag.nameZh, normalizedAlias: normalizeAlias(tag.nameZh) },
      { id: `${tag.id}:en`, tagId: tag.id, locale: 'en', alias: tag.nameEn, normalizedAlias: normalizeAlias(tag.nameEn) },
    ])),
    templates: catalog.templates.map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      nameZh: entry.nameZh,
      nameEn: entry.nameEn,
      categoryId: entry.category,
      sourceKind: 'native',
      sourceUrl: entry.source.preview,
      sourceRevision: `${entry.source.previewSha256}:${entry.source.exportSha256}`,
      licenseSpdx: entry.license.spdx,
      licenseUrl: entry.license.path,
      licenseHash: entry.license.sha256,
      searchText: normalizeAlias([
        entry.nameZh,
        entry.nameEn,
        entry.slug,
        ...entry.aliases,
        ...entry.tags,
      ].join(' ')),
      stableVersionId: `${entry.id}@${entry.version}`,
      publishedAt,
      tagIds: [...entry.tags],
    })),
    versions: catalog.templates.map((entry) => ({
      id: `${entry.id}@${entry.version}`,
      templateId: entry.id,
      version: entry.version,
      schemaVersion: entry.manifest.schemaVersion as number,
      rendererKind: entry.rendererKind,
      manifest: canonicalize(entry.manifest),
      manifestHash: entry.manifestHash,
      capabilities: canonicalize(entry.capabilities),
      thumbnailPath: entry.thumbnail.path,
      previewPath: entry.preview.path,
      provenance: canonicalize({
        source: entry.source,
        license: entry.license,
        provenance: entry.provenance,
        assets: { thumbnail: entry.thumbnail, preview: entry.preview },
      }),
      publishedAt,
    })),
  };
}

type UnifiedCatalogEntry = {
  id: string;
  slug: string;
  version: string;
  nameZh: string;
  nameEn: string;
  category: string;
  tags: string[];
  aliases: string[];
  rendererKind: 'legacy-react' | 'declarative-v1';
  source: Record<string, unknown>;
  license: { spdx: string; path: string; sha256: string; copyright: string };
  provenance: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  manifest: Record<string, unknown>;
  manifestHash: string;
  thumbnail: { path: string; sha256: string };
  preview: { path: string; sha256: string };
  publication?: { publishedAt?: string; promotedAt?: string; status?: string; stable?: boolean };
};

type UnifiedCatalog = {
  schemaVersion: number;
  categories: Array<{ id: string; nameZh: string; nameEn: string }>;
  tags: Array<{ id: string; nameZh: string; nameEn: string; dimension: string }>;
  aliases: Array<{ alias: string; templateId: string }>;
  templates: UnifiedCatalogEntry[];
};

export async function buildUnifiedCatalogSeed(options: {
  rootDir?: string;
  catalog?: UnifiedCatalog;
  publishedAt?: number;
} = {}): Promise<VerifiedTemplateSeed> {
  const rootDir = options.rootDir ?? ROOT;
  if (!options.catalog) await verifyExternalRelease(rootDir);
  const catalog = options.catalog ?? JSON.parse(
    await readFile(path.join(rootDir, 'template-sources/catalog.json'), 'utf8'),
  ) as UnifiedCatalog;
  if (catalog.schemaVersion !== 1 || catalog.templates.length < 1) throw new Error('template_seed_catalog_shape_invalid');
  const publishedAt = options.publishedAt ?? LEGACY_CATALOG_PUBLISHED_AT;
  for (const entry of catalog.templates) {
    const expectedHash = entry.rendererKind === 'declarative-v1'
      ? hashManifest(entry.manifest)
      : sha256(canonicalize(entry.manifest));
    if (expectedHash !== entry.manifestHash) throw new Error(`template_seed_manifest_hash_mismatch:${entry.id}`);
    if (!TemplateCapabilitySchema.safeParse(entry.capabilities).success) {
      throw new Error(`template_seed_capabilities_invalid:${entry.id}`);
    }
    if (entry.rendererKind === 'declarative-v1') {
      if (
        entry.manifest.schemaVersion !== 1
        || entry.manifest.rendererKind !== 'declarative-v1'
        || entry.publication?.status !== 'published'
        || entry.publication.stable !== true
      ) throw new Error(`template_seed_manifest_contract_invalid:${entry.id}`);
    }
    await readAndVerify(rootDir, `public/${entry.thumbnail.path}`, entry.thumbnail.sha256, 'template_seed_thumbnail');
    await readAndVerify(rootDir, `public/${entry.preview.path}`, entry.preview.sha256, 'template_seed_preview');
    await readAndVerify(rootDir, entry.license.path, entry.license.sha256, 'template_seed_license');
  }
  return {
    categories: catalog.categories.map((category, sortOrder) => ({ ...category, slug: category.id, sortOrder })),
    tags: catalog.tags.map((tag, sortOrder) => ({ ...tag, slug: tag.id, sortOrder })),
    tagAliases: catalog.tags.flatMap((tag) => ([
      { id: `${tag.id}:zh`, tagId: tag.id, locale: 'zh', alias: tag.nameZh, normalizedAlias: normalizeAlias(tag.nameZh) },
      { id: `${tag.id}:en`, tagId: tag.id, locale: 'en', alias: tag.nameEn, normalizedAlias: normalizeAlias(tag.nameEn) },
    ])),
    templates: catalog.templates.map((entry) => {
      const isExternal = entry.rendererKind === 'declarative-v1';
      const sourceUrl = isExternal ? String(entry.source.url) : String(entry.source.preview);
      const sourceRevision = isExternal
        ? String(entry.source.revision)
        : `${String(entry.source.previewSha256)}:${String(entry.source.exportSha256)}`;
      return {
        id: entry.id,
        slug: entry.slug,
        nameZh: entry.nameZh,
        nameEn: entry.nameEn,
        categoryId: entry.category,
        sourceKind: isExternal ? 'jsonresume' : 'native',
        sourceUrl,
        sourceRevision,
        licenseSpdx: entry.license.spdx,
        licenseUrl: entry.license.path,
        licenseHash: entry.license.sha256,
        searchText: normalizeAlias([entry.nameZh, entry.nameEn, entry.slug, ...entry.aliases, ...entry.tags].join(' ')),
        stableVersionId: `${entry.id}@${entry.version}`,
        publishedAt: entry.publication?.publishedAt
          ? Math.floor(new Date(entry.publication.publishedAt).getTime() / 1_000)
          : publishedAt,
        tagIds: [...entry.tags],
      };
    }),
    versions: catalog.templates.map((entry) => ({
      id: `${entry.id}@${entry.version}`,
      templateId: entry.id,
      version: entry.version,
      schemaVersion: Number(entry.manifest.schemaVersion),
      rendererKind: entry.rendererKind,
      manifest: canonicalize(entry.manifest),
      manifestHash: entry.manifestHash,
      capabilities: canonicalize(entry.capabilities),
      thumbnailPath: entry.thumbnail.path,
      previewPath: entry.preview.path,
      provenance: canonicalize({
        source: entry.source,
        license: entry.license,
        provenance: entry.provenance,
        publication: entry.publication ?? null,
        assets: { thumbnail: entry.thumbnail, preview: entry.preview },
      }),
      publishedAt: entry.publication?.publishedAt
        ? Math.floor(new Date(entry.publication.publishedAt).getTime() / 1_000)
        : publishedAt,
    })),
  };
}

export async function seedLegacyCatalog(options: SeedLegacyCatalogOptions): Promise<TemplateSeedWriteReport> {
  const rootDir = options.rootDir ?? ROOT;
  const catalog = options.catalog ?? JSON.parse(await readFile(path.resolve(rootDir, CATALOG_PATH), 'utf8')) as LegacyCatalog;
  const publishedAt = options.publishedAt ?? LEGACY_CATALOG_PUBLISHED_AT;
  await validatePublicationCatalog(catalog, options);
  const seed = buildVerifiedSeed(catalog, publishedAt);
  const client = postgres(options.databaseUrl, { max: 1 });
  try {
    return await client.begin(async (tx) => {
      const transaction: TemplateTransaction = asTemplateTransaction(tx);
      await transaction`SELECT pg_advisory_xact_lock(1784160000)`;
      await validatePublicationCatalog(catalog, options);
      return writeVerifiedTemplateSeed(transaction, seed);
    });
  } finally {
    await client.end();
  }
}

export async function seedUnifiedCatalog(options: {
  databaseUrl: string;
  rootDir?: string;
  publishedAt?: number;
}): Promise<TemplateSeedWriteReport> {
  const rootDir = options.rootDir ?? ROOT;
  await buildUnifiedCatalogSeed({ rootDir, publishedAt: options.publishedAt });
  const client = postgres(options.databaseUrl, { max: 1 });
  try {
    return await client.begin(async (tx) => {
      const transaction: TemplateTransaction = asTemplateTransaction(tx);
      await transaction`SELECT pg_advisory_xact_lock(1784160000)`;
      const reverified = await buildUnifiedCatalogSeed({ rootDir, publishedAt: options.publishedAt });
      return writeVerifiedTemplateSeed(transaction, reverified);
    });
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const target = parseSeedCatalogCli(process.argv.slice(2), databaseUrl);
  console.error(`[template-seed] applying to ${target.safeTarget}`);
  const report = await seedUnifiedCatalog({ databaseUrl });
  console.log(JSON.stringify(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
