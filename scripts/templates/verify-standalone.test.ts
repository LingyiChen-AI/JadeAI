import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { verifyStandaloneTemplateAssets } from './verify-standalone';

describe('standalone template assets', () => {
  it('matches the public asset manifest and rejects tampered bytes', async () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const standalone = await mkdtemp(path.join(tmpdir(), 'jade-standalone-'));
    await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
    await expect(verifyStandaloneTemplateAssets(root, standalone)).resolves.toEqual({ assets: 104 });
    const manifest = JSON.parse(await readFile(path.join(root, 'public/templates/asset-manifest.json'), 'utf8'));
    const target = manifest.assets.find((asset: { path: string }) => asset.path.includes('jsonresume-even') && asset.path.includes('thumbnail'));
    await writeFile(path.join(standalone, 'public', target.path), 'tampered');
    await expect(verifyStandaloneTemplateAssets(root, standalone)).rejects.toThrow('template_standalone_hash_mismatch');
  });
});
