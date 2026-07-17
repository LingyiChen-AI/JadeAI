import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildUnifiedCatalogSeed } from './seed-catalog';

describe('unified catalog seed input', () => {
  it('maps 50 legacy and 2 declarative versions with immutable source provenance', async () => {
    const rootDir = path.resolve(import.meta.dirname, '../..');
    const seed = await buildUnifiedCatalogSeed({ rootDir });
    expect(seed.templates).toHaveLength(52);
    expect(seed.versions).toHaveLength(52);
    expect(seed.templates.slice(-2).map((entry) => entry.sourceKind)).toEqual(['jsonresume', 'jsonresume']);
    expect(seed.templates.slice(-2).map((entry) => entry.sourceRevision)).toEqual([
      '8231a31977aa7bfc7c1724713b523a85f32a760d',
      '09f639745d868bcd58cfd26be1a0011bb206f092',
    ]);
    expect(seed.templates.every((entry) => (
      seed.versions.some((version) => version.id === entry.stableVersionId && version.templateId === entry.id)
    ))).toBe(true);
  });

  it('rejects a declarative manifest/hash drift before database access', async () => {
    const rootDir = path.resolve(import.meta.dirname, '../..');
    const catalog = JSON.parse(await readFile(path.join(rootDir, 'template-sources/catalog.json'), 'utf8'));
    catalog.templates.at(-1).manifest.colors.accent = '#ff0000';
    await expect(buildUnifiedCatalogSeed({ rootDir, catalog })).rejects.toThrow('template_seed_manifest_hash_mismatch');
  });
});
