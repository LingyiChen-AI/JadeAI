import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod/v4';

import { SECTION_TYPES } from '../../src/lib/constants';
import { hashManifest, normalizeManifest } from '../../src/lib/templates/normalize-manifest';
import { TemplateCapabilitySchema } from '../../src/lib/templates/schema';
import type { TemplateCapability, TemplateManifestV1 } from '../../src/types/template';

const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_FILES = 512;
const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const ALLOWED_LICENSES = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0']);
const EXECUTABLE_EXTENSIONS = new Set(['.css', '.htm', '.html', '.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx']);

const AssetSchema = z.strictObject({
  path: z.string().min(1).max(512).regex(SAFE_RELATIVE_PATH),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'font/woff2']),
  sha256: z.string().regex(SHA256),
  bytes: z.number().int().positive().max(MAX_SOURCE_FILE_BYTES),
  license: z.strictObject({
    spdx: z.string().min(1).max(80),
    path: z.string().min(1).max(512).regex(SAFE_RELATIVE_PATH),
    sha256: z.string().regex(SHA256),
    copyright: z.string().trim().min(1).max(500),
  }),
});

const SourceMetadataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal('approved'),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/),
  nameZh: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  category: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  tags: z.array(z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(32),
  aliases: z.array(z.string().trim().min(1).max(120)).max(32),
  source: z.strictObject({
    kind: z.literal('jsonresume'),
    packageName: z.string().trim().min(1).max(214),
    packageVersion: z.string().trim().min(1).max(80),
    url: z.url().refine((value) => value.startsWith('https://github.com/'), 'source_url_not_github'),
    revision: z.string().regex(REVISION),
  }),
  license: z.strictObject({
    spdx: z.string().min(1).max(80),
    path: z.string().min(1).max(512).regex(SAFE_RELATIVE_PATH),
    sha256: z.string().regex(SHA256),
    copyright: z.string().trim().min(1).max(500),
  }),
  assets: z.array(AssetSchema).max(64),
  manifestPath: z.string().min(1).max(512).regex(SAFE_RELATIVE_PATH),
  manifestSha256: z.string().regex(SHA256),
  conversion: z.strictObject({
    reviewer: z.string().trim().min(1).max(120),
    reviewedAt: z.iso.datetime({ offset: true }),
    notes: z.string().trim().min(1).max(4_000),
  }),
});

export type TemplateSourceMetadata = z.output<typeof SourceMetadataSchema>;

export type ValidatedSourcePackage = {
  directory: string;
  metadata: TemplateSourceMetadata;
  manifest: TemplateManifestV1;
  manifestHash: string;
};

type BuiltAsset = {
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  mediaType: 'image/png';
};

export type ExternalCatalog = {
  schemaVersion: 1;
  templates: Array<{
    id: string;
    slug: string;
    version: string;
    nameZh: string;
    nameEn: string;
    category: string;
    tags: string[];
    aliases: string[];
    rendererKind: 'declarative-v1';
    source: TemplateSourceMetadata['source'];
    license: TemplateSourceMetadata['license'];
    provenance: {
      reviewer: string;
      reviewedAt: string;
      conversionNotes: string;
      network: 'disabled';
      codeExecuted: false;
      assetsRedistributed: boolean;
      assetInventory: TemplateSourceMetadata['assets'];
    };
    capabilities: TemplateCapability;
    manifest: TemplateManifestV1;
    manifestHash: string;
    thumbnail: BuiltAsset;
    preview: BuiltAsset;
  }>;
};

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safePath(root: string, relativePath: string, code = 'template_source_path_invalid'): string {
  if (!SAFE_RELATIVE_PATH.test(relativePath) || path.isAbsolute(relativePath)) throw new Error(code);
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(code);
  return absolutePath;
}

async function inventoryTree(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new Error('template_source_symlink_forbidden');
      if (metadata.isDirectory()) await visit(absolute);
      else if (metadata.isFile()) {
        if (metadata.size > MAX_SOURCE_FILE_BYTES) throw new Error('template_source_file_too_large');
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
        if (files.length > MAX_SOURCE_FILES) throw new Error('template_source_file_count_exceeded');
      } else throw new Error('template_source_file_type_forbidden');
    }
  }
  await visit(root);
  return files.sort();
}

async function readVerifiedFile(root: string, relativePath: string, expectedHash: string, code: string): Promise<Buffer> {
  const absolutePath = safePath(root, relativePath);
  const metadata = await lstat(absolutePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error('template_source_symlink_forbidden');
  if (metadata.size > MAX_SOURCE_FILE_BYTES) throw new Error('template_source_file_too_large');
  const bytes = await readFile(absolutePath);
  if (sha256(bytes) !== expectedHash) throw new Error(code);
  return bytes;
}

function defaultManifest() {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#18181b', muted: '#71717a', accent: '#0f766e', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: SECTION_TYPES.map((sectionType, order) => ({ sectionType, placement: order === 0 ? 'header' : 'main', order })),
    sectionStyles: [],
    features: { showAvatar: false, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
  };
}

export async function inspectJsonResumeTheme(options: {
  inputDirectory: string;
  outputDirectory: string;
  sourceRevision: string;
}): Promise<{ ignoredExecutableFiles: string[] }> {
  if (!REVISION.test(options.sourceRevision)) throw new Error('template_source_revision_invalid');
  const inputDirectory = path.resolve(options.inputDirectory);
  const outputDirectory = path.resolve(options.outputDirectory);
  const inputMetadata = await lstat(inputDirectory);
  if (!inputMetadata.isDirectory() || inputMetadata.isSymbolicLink()) throw new Error('template_source_directory_invalid');
  const relativeOutput = path.relative(inputDirectory, outputDirectory);
  if (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput)) throw new Error('template_source_output_inside_input');
  const files = await inventoryTree(inputDirectory);
  const packagePath = path.join(inputDirectory, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
  if (typeof packageJson.name !== 'string' || typeof packageJson.version !== 'string') {
    throw new Error('template_source_package_invalid');
  }
  const repository = packageJson.repository;
  const sourceUrl = typeof repository === 'string'
    ? repository
    : repository && typeof repository === 'object' && typeof (repository as { url?: unknown }).url === 'string'
      ? (repository as { url: string }).url.replace(/^git\+/, '').replace(/\.git$/, '')
      : null;
  const draft = {
    schemaVersion: 1,
    status: 'draft',
    slug: packageJson.name.replace(/^@[^/]+\//, '').replace(/^jsonresume-theme-/, '').replace(/[^a-z0-9-]/g, '-'),
    version: '1.0.0',
    source: {
      kind: 'jsonresume',
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      url: sourceUrl,
      revision: options.sourceRevision,
    },
    declaredLicense: typeof packageJson.license === 'string' ? packageJson.license : null,
    discoveredFiles: files,
    ignoredExecutableFiles: files.filter((file) => EXECUTABLE_EXTENSIONS.has(path.extname(file).toLowerCase())),
    manifestDraft: defaultManifest(),
  };
  const temporary = `${outputDirectory}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(temporary, { recursive: false });
    await writeFile(path.join(temporary, 'source.draft.json'), `${JSON.stringify(draft, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, outputDirectory);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { ignoredExecutableFiles: draft.ignoredExecutableFiles };
}

export async function validateSourcePackage(directory: string): Promise<ValidatedSourcePackage> {
  const absoluteDirectory = path.resolve(directory);
  const files = await inventoryTree(absoluteDirectory);
  if (files.some((file) => EXECUTABLE_EXTENSIONS.has(path.extname(file).toLowerCase()))) {
    throw new Error('template_source_executable_forbidden');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(absoluteDirectory, 'source.json'), 'utf8'));
  } catch {
    throw new Error('template_source_metadata_invalid');
  }
  const parsed = SourceMetadataSchema.safeParse(raw);
  if (!parsed.success) throw new Error('template_source_metadata_invalid');
  const metadata = parsed.data;
  if (!ALLOWED_LICENSES.has(metadata.license.spdx)) throw new Error('template_license_not_allowed');
  await readVerifiedFile(absoluteDirectory, metadata.license.path, metadata.license.sha256, 'template_license_hash_mismatch');
  for (const asset of metadata.assets) {
    if (!ALLOWED_LICENSES.has(asset.license.spdx)) throw new Error('template_asset_license_not_allowed');
    if (EXECUTABLE_EXTENSIONS.has(path.extname(asset.path).toLowerCase())) throw new Error('template_asset_type_forbidden');
    const bytes = await readVerifiedFile(absoluteDirectory, asset.path, asset.sha256, 'template_asset_hash_mismatch');
    if (bytes.byteLength !== asset.bytes) throw new Error('template_asset_bytes_mismatch');
    await readVerifiedFile(absoluteDirectory, asset.license.path, asset.license.sha256, 'template_asset_license_hash_mismatch');
  }
  const manifestBytes = await readVerifiedFile(
    absoluteDirectory,
    metadata.manifestPath,
    metadata.manifestSha256,
    'template_manifest_source_hash_mismatch',
  );
  let manifest: TemplateManifestV1;
  try {
    manifest = normalizeManifest(JSON.parse(manifestBytes.toString('utf8')));
  } catch {
    throw new Error('template_manifest_invalid');
  }
  return { directory: absoluteDirectory, metadata, manifest, manifestHash: hashManifest(manifest) };
}

function defaultCapabilities(manifest: TemplateManifestV1): TemplateCapability {
  return TemplateCapabilitySchema.parse({
    supportedSections: [...SECTION_TYPES],
    paperSizes: ['a4', 'letter'],
    supportsAvatar: manifest.features.showAvatar,
    atsCompatible: manifest.layout.type === 'single-column',
    supportsZh: true,
    supportsEn: true,
    supportsHtml: true,
    supportsPdf: true,
    docxFidelity: 'generic',
  });
}

function builtAsset(slug: string, version: string, kind: 'thumbnail' | 'preview', bytes: Uint8Array): BuiltAsset {
  const hash = sha256(bytes);
  return {
    path: `templates/${slug}/v${version}/${kind}-${hash.slice(0, 16)}.png`,
    sha256: hash,
    bytes: bytes.byteLength,
    width: kind === 'thumbnail' ? 400 : 1200,
    height: kind === 'thumbnail' ? 300 : 900,
    mediaType: 'image/png',
  };
}

export async function buildExternalCatalog(
  inputs: Array<{ source: ValidatedSourcePackage; thumbnail: Uint8Array; preview: Uint8Array }>,
): Promise<ExternalCatalog> {
  const sorted = [...inputs].sort((left, right) => left.source.metadata.slug.localeCompare(right.source.metadata.slug));
  const slugs = sorted.map(({ source }) => source.metadata.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error('template_catalog_slug_duplicate');
  return {
    schemaVersion: 1,
    templates: sorted.map(({ source, thumbnail, preview }) => {
      const { metadata, manifest, manifestHash } = source;
      return {
        id: metadata.slug,
        slug: metadata.slug,
        version: metadata.version,
        nameZh: metadata.nameZh,
        nameEn: metadata.nameEn,
        category: metadata.category,
        tags: [...metadata.tags],
        aliases: [...metadata.aliases],
        rendererKind: 'declarative-v1',
        source: metadata.source,
        license: metadata.license,
        provenance: {
          reviewer: metadata.conversion.reviewer,
          reviewedAt: metadata.conversion.reviewedAt,
          conversionNotes: metadata.conversion.notes,
          network: 'disabled',
          codeExecuted: false,
          assetsRedistributed: metadata.assets.length > 0,
          assetInventory: metadata.assets,
        },
        capabilities: defaultCapabilities(manifest),
        manifest,
        manifestHash,
        thumbnail: builtAsset(metadata.slug, metadata.version, 'thumbnail', thumbnail),
        preview: builtAsset(metadata.slug, metadata.version, 'preview', preview),
      };
    }),
  };
}

export async function publishImmutableTemplateBundle(rootDirectory: string, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
  const root = path.resolve(rootDirectory);
  const plans: Array<{ absolute: string; bytes: Buffer; existing: Buffer | null; immutable: boolean }> = [];
  for (const [relativePath, value] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const absolute = safePath(root, relativePath, 'template_publish_path_invalid');
    const bytes = Buffer.from(value);
    let existing: Buffer | null = null;
    try { existing = await readFile(absolute); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const immutable = /^public\/templates\/[^/]+\/v\d+\.\d+\.\d+\//.test(relativePath);
    if (immutable && existing && !existing.equals(bytes)) throw new Error('template_publish_immutable_conflict');
    plans.push({ absolute, bytes, existing, immutable });
  }
  const createdFiles: string[] = [];
  const replacedFiles: Array<{ absolute: string; bytes: Buffer }> = [];
  try {
    for (const plan of plans) {
      if (plan.existing?.equals(plan.bytes)) continue;
      await mkdir(path.dirname(plan.absolute), { recursive: true });
      const temporary = `${plan.absolute}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, plan.bytes, { flag: 'wx' });
      if (plan.existing && !plan.immutable) replacedFiles.push({ absolute: plan.absolute, bytes: plan.existing });
      await rename(temporary, plan.absolute);
      if (!plan.existing) createdFiles.push(plan.absolute);
    }
  } catch (error) {
    await Promise.all(createdFiles.map((file) => rm(file, { force: true })));
    await Promise.all(replacedFiles.map(({ absolute, bytes }) => writeFile(absolute, bytes)));
    throw error;
  }
}
