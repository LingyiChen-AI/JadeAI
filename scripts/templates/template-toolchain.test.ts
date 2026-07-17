import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildExternalCatalog,
  inspectJsonResumeTheme,
  publishImmutableTemplateBundle,
  validateSourcePackage,
} from './template-toolchain';

const MIT = 'MIT License\n\nCopyright (c) Test Author\n';

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function manifest(accent = '#0f766e') {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#18181b', muted: '#71717a', accent, background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'personal_info', placement: 'header', order: 0 }],
    sectionStyles: [{ sectionType: 'personal_info', element: 'heading', variant: 'accent' }],
    features: { showAvatar: false, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
  };
}

async function sourcePackage(root: string, overrides: Record<string, unknown> = {}) {
  const directory = path.join(root, 'jsonresume-sample');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'LICENSE'), MIT);
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest(), null, 2)}\n`);
  const metadata = {
    schemaVersion: 1,
    status: 'approved',
    slug: 'jsonresume-sample',
    version: '1.0.0',
    nameZh: 'JSON Resume 示例',
    nameEn: 'JSON Resume Sample',
    category: 'general',
    tags: ['layout-single-column', 'capability-bilingual'],
    aliases: ['json resume sample'],
    source: {
      kind: 'jsonresume',
      packageName: 'jsonresume-theme-sample',
      packageVersion: '1.2.3',
      url: 'https://github.com/jsonresume/jsonresume-theme-sample',
      revision: '0123456789abcdef0123456789abcdef01234567',
    },
    license: { spdx: 'MIT', path: 'LICENSE', sha256: sha256(MIT), copyright: 'Test Author' },
    assets: [],
    manifestPath: 'manifest.json',
    manifestSha256: sha256(`${JSON.stringify(manifest(), null, 2)}\n`),
    conversion: {
      reviewer: 'JadeAI maintainers',
      reviewedAt: '2026-07-16T00:00:00.000Z',
      notes: 'Manual declarative port; no upstream code or assets are executed or redistributed.',
    },
    ...overrides,
  };
  await writeFile(path.join(directory, 'source.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return directory;
}

describe('offline template source inspection', () => {
  it('reads metadata without running package scripts and emits a draft only', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-input-'));
    const input = path.join(root, 'input');
    const output = path.join(root, 'output');
    const marker = path.join(root, 'script-ran');
    await mkdir(input);
    await writeFile(path.join(input, 'LICENSE'), MIT);
    await writeFile(path.join(input, 'package.json'), JSON.stringify({
      name: 'jsonresume-theme-test', version: '1.0.0', license: 'MIT',
      repository: { url: 'https://github.com/jsonresume/jsonresume-theme-test' },
      scripts: { postinstall: `touch ${marker}` },
    }));
    await writeFile(path.join(input, 'index.js'), 'throw new Error("must not execute")');

    const report = await inspectJsonResumeTheme({
      inputDirectory: input,
      outputDirectory: output,
      sourceRevision: '0123456789abcdef0123456789abcdef01234567',
    });

    expect(report.ignoredExecutableFiles).toEqual(['index.js']);
    expect(await readFile(path.join(output, 'source.draft.json'), 'utf8')).toContain('jsonresume-theme-test');
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects escaping symlinks before producing output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-link-'));
    const input = path.join(root, 'input');
    await mkdir(input);
    await writeFile(path.join(input, 'package.json'), JSON.stringify({ name: 'theme', version: '1.0.0', license: 'MIT' }));
    await writeFile(path.join(root, 'outside.txt'), 'outside');
    await symlink(path.join(root, 'outside.txt'), path.join(input, 'asset.txt'));

    await expect(inspectJsonResumeTheme({
      inputDirectory: input,
      outputDirectory: path.join(root, 'output'),
      sourceRevision: '0123456789abcdef0123456789abcdef01234567',
    })).rejects.toThrow('template_source_symlink_forbidden');
  });
});

describe('source validation and deterministic catalog build', () => {
  it('validates every checked-in approved external source package', async () => {
    const root = path.resolve(import.meta.dirname, '../..', 'template-sources/external');
    const sources = await Promise.all(['jsonresume-even', 'jsonresume-onepage'].map((slug) => (
      validateSourcePackage(path.join(root, slug))
    )));
    expect(sources.map((source) => source.metadata.source.revision)).toEqual([
      '8231a31977aa7bfc7c1724713b523a85f32a760d',
      '09f639745d868bcd58cfd26be1a0011bb206f092',
    ]);
    expect(sources.every((source) => source.metadata.assets.length === 0)).toBe(true);
  });

  it('validates strict hashes, allowlisted licensing, provenance, and declarative manifests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-valid-'));
    const directory = await sourcePackage(root);
    const validated = await validateSourcePackage(directory);
    expect(validated.metadata.license.spdx).toBe('MIT');
    expect(validated.manifest.rendererKind).toBe('declarative-v1');
    expect(validated.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['template_license_not_allowed', { license: { spdx: 'GPL-3.0-only', path: 'LICENSE', sha256: sha256(MIT), copyright: 'Test' } }],
    ['template_source_metadata_invalid', { extra: true }],
  ])('rejects %s', async (code, overrides) => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-invalid-'));
    const directory = await sourcePackage(root, overrides);
    await expect(validateSourcePackage(directory)).rejects.toThrow(code);
  });

  it('rejects raw executable source files from an approved package', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-code-'));
    const directory = await sourcePackage(root);
    await writeFile(path.join(directory, 'theme.js'), 'export default () => document.cookie');
    await expect(validateSourcePackage(directory)).rejects.toThrow('template_source_executable_forbidden');
  });

  it('builds byte-identical catalog output with content-addressed assets and complete provenance', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-build-'));
    const directory = await sourcePackage(root);
    const thumbnail = Buffer.from('\u0089PNG\r\n\u001a\nthumbnail fixture');
    const preview = Buffer.from('\u0089PNG\r\n\u001a\npreview fixture');
    const input = [{ source: await validateSourcePackage(directory), thumbnail, preview }];

    const first = await buildExternalCatalog(input);
    const second = await buildExternalCatalog(input);
    expect(first).toEqual(second);
    expect(first.templates[0]).toMatchObject({
      slug: 'jsonresume-sample', rendererKind: 'declarative-v1', manifestHash: input[0].source.manifestHash,
      source: { revision: '0123456789abcdef0123456789abcdef01234567' },
      license: { spdx: 'MIT' },
      provenance: { network: 'disabled', codeExecuted: false, assetsRedistributed: false },
    });
    expect(first.templates[0].thumbnail.path).toContain(sha256(thumbnail).slice(0, 16));
    expect(first.templates[0].preview.path).toContain(sha256(preview).slice(0, 16));
  });
});

describe('immutable bundle publication', () => {
  it('publishes atomically, is idempotent for identical bytes, and rejects overwrite', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-theme-publish-'));
    const files = new Map([
      ['public/templates/sample/v1.0.0/thumbnail-a.png', Buffer.from('one')],
      ['template-sources/external/catalog.json', Buffer.from('{"ok":true}\n')],
    ]);
    await publishImmutableTemplateBundle(root, files);
    await expect(publishImmutableTemplateBundle(root, files)).resolves.toBeUndefined();
    const changed = new Map(files);
    changed.set('public/templates/sample/v1.0.0/thumbnail-a.png', Buffer.from('changed'));
    await expect(publishImmutableTemplateBundle(root, changed)).rejects.toThrow('template_publish_immutable_conflict');
    expect(await readFile(path.join(root, 'public/templates/sample/v1.0.0/thumbnail-a.png'), 'utf8')).toBe('one');
  });
});
