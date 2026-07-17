import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildExternalRelease,
  parsePublicationActions,
  verifyExternalRelease,
} from './external-release';
import { renderTemplateMatrix } from './render-previews';
import { validateSourcePackage } from './template-toolchain';

describe('explicit external publication actions', () => {
  it('requires publication and stable promotion as separate exact actions', () => {
    expect(() => parsePublicationActions(['--publish=jsonresume-even@1.0.0'])).toThrow('template_stable_promotion_required');
    expect(() => parsePublicationActions(['--promote-stable=jsonresume-even@1.0.0'])).toThrow('template_publication_required');
    expect(parsePublicationActions([
      '--publish=jsonresume-even@1.0.0',
      '--promote-stable=jsonresume-even@1.0.0',
    ])).toEqual({ published: ['jsonresume-even@1.0.0'], stable: ['jsonresume-even@1.0.0'] });
  });

  it('builds and verifies a 52-template catalog, license inventory, render report and immutable assets', async () => {
    const sourceRoot = path.resolve(import.meta.dirname, '../..');
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'jade-external-release-'));
    const sources = await Promise.all(['jsonresume-even', 'jsonresume-onepage'].map((slug) => (
      validateSourcePackage(path.join(sourceRoot, 'template-sources/external', slug))
    )));
    const rendered = await renderTemplateMatrix({ rootDirectory: sourceRoot, sources });
    const actions = parsePublicationActions([
      '--publish=jsonresume-even@1.0.1',
      '--publish=jsonresume-onepage@1.0.1',
      '--promote-stable=jsonresume-even@1.0.1',
      '--promote-stable=jsonresume-onepage@1.0.1',
    ]);

    await buildExternalRelease({ sourceRoot, outputRoot, sources, rendered, actions });
    const report = await verifyExternalRelease(outputRoot);
    expect(report).toEqual({ externalTemplates: 2, templates: 52, assets: 104, licenses: 2 });
    const catalog = JSON.parse(await readFile(path.join(outputRoot, 'template-sources/catalog.json'), 'utf8'));
    expect(catalog.templates.slice(-2).map((entry: { rendererKind: string }) => entry.rendererKind)).toEqual([
      'declarative-v1', 'declarative-v1',
    ]);
    const orphanDirectory = path.join(outputRoot, 'public/templates/orphan/v1.0.0');
    await mkdir(orphanDirectory, { recursive: true });
    await writeFile(path.join(orphanDirectory, 'preview-deadbeefdeadbeef.png'), 'orphan');
    await expect(verifyExternalRelease(outputRoot)).rejects.toThrow('template_release_asset_set_drift');
  }, 120_000);
});
