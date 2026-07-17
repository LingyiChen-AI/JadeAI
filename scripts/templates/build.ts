import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderTemplateMatrix } from './render-previews';
import { buildExternalCatalog } from './template-toolchain';
import { validateApprovedSources } from './validate';

export const BUILD_OWNERSHIP_MARKER = '.jadeai-template-build.json';
const BUILD_OWNERSHIP_CONTENT = '{"schemaVersion":1,"owner":"jadeai-template-build"}\n';

export async function replaceOwnedBuildDirectory(outputDirectory: string, temporary: string): Promise<void> {
  let existing;
  try {
    existing = await lstat(outputDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await rename(temporary, outputDirectory);
    return;
  }
  if (!existing.isDirectory()) throw new Error('template_build_output_not_owned');
  let marker: string;
  try {
    marker = await readFile(path.join(outputDirectory, BUILD_OWNERSHIP_MARKER), 'utf8');
  } catch {
    throw new Error('template_build_output_not_owned');
  }
  if (marker !== BUILD_OWNERSHIP_CONTENT) throw new Error('template_build_output_not_owned');

  const backup = `${outputDirectory}.previous-${randomUUID()}`;
  await rename(outputDirectory, backup);
  try {
    await rename(temporary, outputDirectory);
  } catch (error) {
    await rename(backup, outputDirectory);
    throw error;
  }
  await rm(backup, { recursive: true });
}

async function main(): Promise<void> {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--output='));
  if (!argument || process.argv.length !== 3) throw new Error('Usage: template:build --output=<staging-directory>');
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const outputDirectory = path.resolve(argument.slice('--output='.length));
  if (!path.relative(rootDirectory, outputDirectory).startsWith('..')) throw new Error('template_build_output_must_be_external');
  const sources = await validateApprovedSources(rootDirectory);
  const rendered = await renderTemplateMatrix({ rootDirectory, sources });
  const catalog = await buildExternalCatalog(sources.map((source) => ({
    source,
    ...rendered.assets.get(source.metadata.slug)!,
  })));
  const temporary = `${outputDirectory}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(path.join(temporary, 'assets'), { recursive: true });
    await writeFile(path.join(temporary, 'validated-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
    await writeFile(path.join(temporary, 'render-report.json'), `${JSON.stringify(rendered.report, null, 2)}\n`, { flag: 'wx' });
    await writeFile(path.join(temporary, BUILD_OWNERSHIP_MARKER), BUILD_OWNERSHIP_CONTENT, { flag: 'wx' });
    for (const [slug, assets] of rendered.assets) {
      await writeFile(path.join(temporary, 'assets', `${slug}-thumbnail.png`), assets.thumbnail, { flag: 'wx' });
      await writeFile(path.join(temporary, 'assets', `${slug}-preview.png`), assets.preview, { flag: 'wx' });
    }
    await replaceOwnedBuildDirectory(outputDirectory, temporary);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({ status: 'validated', templates: sources.length, outputDirectory }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
