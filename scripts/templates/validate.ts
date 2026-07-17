import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSourcePackage } from './template-toolchain';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function validateApprovedSources(rootDirectory = ROOT) {
  const sourceRoot = path.join(rootDirectory, 'template-sources/external');
  const entries = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(entries.map((slug) => validateSourcePackage(path.join(sourceRoot, slug))));
}

async function main(): Promise<void> {
  if (process.argv.slice(2).join(' ') !== '--verify') throw new Error('Usage: template:validate --verify');
  const sources = await validateApprovedSources();
  console.log(JSON.stringify({ templates: sources.length, slugs: sources.map((source) => source.metadata.slug) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
