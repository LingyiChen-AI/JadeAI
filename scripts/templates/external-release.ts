import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { TemplateRenderResult } from './render-previews';
import {
  buildExternalCatalog,
  publishImmutableTemplateBundle,
  validateSourcePackage,
  type ExternalCatalog,
  type ValidatedSourcePackage,
} from './template-toolchain';

const REFERENCE = /^[a-z0-9]+(?:-[a-z0-9]+)*@(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export type PublicationActions = { published: string[]; stable: string[] };

type LegacyCatalog = {
  schemaVersion: 1;
  categories: unknown[];
  tags: unknown[];
  aliases: unknown[];
  templates: Array<{
    id: string;
    slug: string;
    version: string;
    rendererKind: string;
    thumbnail: { path: string; sha256: string };
    preview: { path: string; sha256: string };
  }>;
};

type PublishedExternalCatalog = Omit<ExternalCatalog, 'templates'> & {
  templates: Array<ExternalCatalog['templates'][number] & {
    publication: { status: 'published'; stable: true; publishedAt: string; promotedAt: string };
  }>;
};

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

export function parsePublicationActions(args: string[]): PublicationActions {
  if (args.some((arg) => !arg.startsWith('--publish=') && !arg.startsWith('--promote-stable='))) {
    throw new Error('template_publication_argument_invalid');
  }
  const published = args.filter((arg) => arg.startsWith('--publish=')).map((arg) => arg.slice('--publish='.length)).sort();
  const stable = args.filter((arg) => arg.startsWith('--promote-stable=')).map((arg) => arg.slice('--promote-stable='.length)).sort();
  if (!published.length) throw new Error('template_publication_required');
  if (!stable.length) throw new Error('template_stable_promotion_required');
  if ([...published, ...stable].some((reference) => !REFERENCE.test(reference))) throw new Error('template_publication_reference_invalid');
  if (new Set(published).size !== published.length || new Set(stable).size !== stable.length) {
    throw new Error('template_publication_duplicate');
  }
  if (stable.some((reference) => !published.includes(reference))) throw new Error('template_stable_requires_publication');
  return { published, stable };
}

function publicationCatalog(catalog: ExternalCatalog, actions: PublicationActions): PublishedExternalCatalog {
  const catalogReferences = catalog.templates.map((entry) => `${entry.slug}@${entry.version}`).sort();
  if (catalogReferences.join('\0') !== actions.published.join('\0')) throw new Error('template_publication_set_mismatch');
  if (catalogReferences.join('\0') !== actions.stable.join('\0')) throw new Error('template_stable_set_mismatch');
  return {
    ...catalog,
    templates: catalog.templates.map((entry) => ({
      ...entry,
      license: { ...entry.license, path: `template-sources/external/${entry.slug}/${entry.license.path}` },
      provenance: {
        ...entry.provenance,
        sourcePackage: `template-sources/external/${entry.slug}/source.json`,
        manifestSource: `template-sources/external/${entry.slug}/manifest.json`,
      },
      publication: {
        status: 'published',
        stable: true,
        publishedAt: '2026-07-16T20:00:00.000Z',
        promotedAt: '2026-07-16T20:00:00.000Z',
      },
    })),
  } as PublishedExternalCatalog;
}

export async function buildExternalRelease(options: {
  sourceRoot: string;
  outputRoot: string;
  sources: ValidatedSourcePackage[];
  rendered: TemplateRenderResult;
  actions: PublicationActions;
}): Promise<void> {
  const legacy = JSON.parse(await readFile(path.join(options.sourceRoot, 'template-sources/legacy/catalog.json'), 'utf8')) as LegacyCatalog;
  const renderInputs = options.sources.map((source) => {
    const assets = options.rendered.assets.get(source.metadata.slug);
    if (!assets) throw new Error('template_render_assets_missing');
    return { source, ...assets };
  });
  const external = publicationCatalog(await buildExternalCatalog(renderInputs), options.actions);
  const legacySlugs = new Set(legacy.templates.map((entry) => entry.slug));
  if (external.templates.some((entry) => legacySlugs.has(entry.slug))) throw new Error('template_catalog_slug_conflict');
  const unified = {
    schemaVersion: 1,
    categories: legacy.categories,
    tags: legacy.tags,
    aliases: legacy.aliases,
    templates: [...legacy.templates, ...external.templates],
  };
  const licenseInventory = {
    schemaVersion: 1,
    generatedFrom: 'approved source packages',
    themes: external.templates.map((entry) => ({
      slug: entry.slug,
      version: entry.version,
      sourceUrl: entry.source.url,
      sourceRevision: entry.source.revision,
      themeLicense: entry.license,
      redistributedAssets: entry.provenance.assetInventory,
    })),
  };
  const publicationLedger = {
    schemaVersion: 1,
    events: external.templates.flatMap((entry) => [
      { action: 'publish', reference: `${entry.slug}@${entry.version}`, at: entry.publication.publishedAt },
      { action: 'promote-stable', reference: `${entry.slug}@${entry.version}`, at: entry.publication.promotedAt },
    ]),
  };
  const files = new Map<string, Uint8Array>();
  const assetInventory: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const entry of legacy.templates) {
    for (const asset of [entry.thumbnail, entry.preview]) {
      const bytes = await readFile(path.join(options.sourceRoot, 'public', asset.path));
      files.set(`public/${asset.path}`, bytes);
      assetInventory.push({ path: asset.path, sha256: asset.sha256, bytes: bytes.byteLength });
    }
  }
  for (const entry of external.templates) {
    const rendered = options.rendered.assets.get(entry.slug)!;
    files.set(`public/${entry.thumbnail.path}`, rendered.thumbnail);
    files.set(`public/${entry.preview.path}`, rendered.preview);
    assetInventory.push({ path: entry.thumbnail.path, sha256: entry.thumbnail.sha256, bytes: rendered.thumbnail.byteLength });
    assetInventory.push({ path: entry.preview.path, sha256: entry.preview.sha256, bytes: rendered.preview.byteLength });
    for (const relativePath of ['source.json', 'manifest.json', 'LICENSE', 'conversion.md']) {
      const sourcePath = path.join(options.sourceRoot, 'template-sources/external', entry.slug, relativePath);
      files.set(`template-sources/external/${entry.slug}/${relativePath}`, await readFile(sourcePath));
    }
  }
  files.set('template-sources/external/catalog.json', stableJson(external));
  files.set('template-sources/external/license-inventory.json', stableJson(licenseInventory));
  files.set('template-sources/external/publication-ledger.json', stableJson(publicationLedger));
  files.set('template-sources/external/render-report.json', stableJson(options.rendered.report));
  files.set('template-sources/catalog.json', stableJson(unified));
  files.set('public/templates/asset-manifest.json', stableJson({
    schemaVersion: 1,
    assets: assetInventory.sort((left, right) => left.path.localeCompare(right.path)),
  }));
  await publishImmutableTemplateBundle(options.outputRoot, files);
}

async function verifiedBytes(root: string, relativePath: string, expectedHash: string): Promise<Buffer> {
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relativePath);
  const relative = path.relative(absoluteRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('template_release_path_invalid');
  const bytes = await readFile(absolute);
  if (sha256(bytes) !== expectedHash) throw new Error('template_release_hash_mismatch');
  return bytes;
}

async function listPublishedPngs(root: string): Promise<string[]> {
  const templateRoot = path.join(root, 'public/templates');
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('template_release_asset_symlink');
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.png')) {
        files.push(path.relative(path.join(root, 'public'), absolute).split(path.sep).join('/'));
      }
    }
  }
  await visit(templateRoot);
  return files.sort();
}

export async function verifyExternalRelease(root: string): Promise<{
  externalTemplates: number;
  templates: number;
  assets: number;
  licenses: number;
}> {
  const [externalRaw, unifiedRaw, licensesRaw, ledgerRaw, renderRaw, assetsRaw] = await Promise.all([
    readFile(path.join(root, 'template-sources/external/catalog.json'), 'utf8'),
    readFile(path.join(root, 'template-sources/catalog.json'), 'utf8'),
    readFile(path.join(root, 'template-sources/external/license-inventory.json'), 'utf8'),
    readFile(path.join(root, 'template-sources/external/publication-ledger.json'), 'utf8'),
    readFile(path.join(root, 'template-sources/external/render-report.json'), 'utf8'),
    readFile(path.join(root, 'public/templates/asset-manifest.json'), 'utf8'),
  ]);
  const external = JSON.parse(externalRaw) as PublishedExternalCatalog;
  const unified = JSON.parse(unifiedRaw) as LegacyCatalog;
  const licenses = JSON.parse(licensesRaw) as { themes: Array<{ slug: string; themeLicense: { path: string; sha256: string }; redistributedAssets: unknown[] }> };
  const ledger = JSON.parse(ledgerRaw) as { events: Array<{ action: string; reference: string }> };
  const render = JSON.parse(renderRaw) as TemplateRenderResult['report'];
  const assetManifest = JSON.parse(assetsRaw) as { assets: Array<{ path: string; sha256: string; bytes: number }> };
  const externalReferences = external.templates.map((entry) => `${entry.slug}@${entry.version}`).sort();
  if (external.templates.some((entry) => entry.publication.status !== 'published' || entry.publication.stable !== true)) {
    throw new Error('template_release_publication_invalid');
  }
  for (const reference of externalReferences) {
    if (!ledger.events.some((event) => event.action === 'publish' && event.reference === reference)) throw new Error('template_release_publish_event_missing');
    if (!ledger.events.some((event) => event.action === 'promote-stable' && event.reference === reference)) throw new Error('template_release_stable_event_missing');
  }
  if (render.cases.length !== external.templates.length * 8 || render.network !== 'disabled') throw new Error('template_release_render_matrix_invalid');
  const unifiedExternal = unified.templates.slice(-external.templates.length);
  if (JSON.stringify(unifiedExternal) !== JSON.stringify(external.templates)) throw new Error('template_release_catalog_drift');
  for (const entry of unified.templates) {
    await verifiedBytes(root, `public/${entry.thumbnail.path}`, entry.thumbnail.sha256);
    await verifiedBytes(root, `public/${entry.preview.path}`, entry.preview.sha256);
  }
  if (assetManifest.assets.length !== unified.templates.length * 2) throw new Error('template_release_asset_manifest_count');
  const expectedAssetPaths = assetManifest.assets.map((asset) => asset.path).sort();
  const publishedPngs = await listPublishedPngs(root);
  if (expectedAssetPaths.join('\0') !== publishedPngs.join('\0')) throw new Error('template_release_asset_set_drift');
  for (const asset of assetManifest.assets) {
    const bytes = await verifiedBytes(root, `public/${asset.path}`, asset.sha256);
    if (bytes.byteLength !== asset.bytes) throw new Error('template_release_asset_bytes_mismatch');
  }
  for (const theme of licenses.themes) {
    await verifiedBytes(root, theme.themeLicense.path, theme.themeLicense.sha256);
    if (theme.redistributedAssets.length !== 0) throw new Error('template_release_unexpected_redistributed_asset');
  }
  for (const entry of external.templates) {
    const source = await validateSourcePackage(path.join(root, 'template-sources/external', entry.slug));
    if (
      source.metadata.version !== entry.version
      || source.metadata.source.revision !== entry.source.revision
      || source.manifestHash !== entry.manifestHash
    ) throw new Error('template_release_source_package_drift');
  }
  return {
    externalTemplates: external.templates.length,
    templates: unified.templates.length,
    assets: unified.templates.length * 2,
    licenses: licenses.themes.length,
  };
}
