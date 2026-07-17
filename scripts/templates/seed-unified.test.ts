import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildUnifiedCatalogSeed } from './seed-catalog';

describe('unified catalog seed input', () => {
  it('maps 50 legacy and 52 declarative versions with immutable source provenance', async () => {
    const rootDir = path.resolve(import.meta.dirname, '../..');
    const seed = await buildUnifiedCatalogSeed({ rootDir });
    expect(seed.templates).toHaveLength(102);
    expect(seed.versions).toHaveLength(102);
    expect(seed.templates.filter((entry) => entry.sourceKind === 'jsonresume')).toHaveLength(52);
    expect(seed.versions.filter((entry) => entry.rendererKind === 'declarative-v2')).toHaveLength(50);
    expect(seed.templates.every((entry) => (
      seed.versions.some((version) => version.id === entry.stableVersionId && version.templateId === entry.id)
    ))).toBe(true);
    const patchedTemplate = seed.templates.find((entry) => entry.id === 'jsonresume-architects-portfolio')!;
    const patchedVersion = seed.versions.find((entry) => entry.id === patchedTemplate.stableVersionId)!;
    expect(patchedTemplate.publishedAt).toBe(1_784_232_000);
    expect(patchedVersion.publishedAt).toBeGreaterThan(patchedTemplate.publishedAt);
  });

  it('rejects a declarative manifest/hash drift before database access', async () => {
    const rootDir = path.resolve(import.meta.dirname, '../..');
    const catalog = JSON.parse(await readFile(path.join(rootDir, 'template-sources/catalog.json'), 'utf8'));
    catalog.templates.at(-1).manifest.colors.accent = '#ff0000';
    await expect(buildUnifiedCatalogSeed({ rootDir, catalog })).rejects.toThrow('template_seed_manifest_hash_mismatch');
  });
});
