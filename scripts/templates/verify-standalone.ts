import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function verifyStandaloneTemplateAssets(rootDirectory: string, standaloneDirectory: string): Promise<{ assets: number }> {
  const manifest = JSON.parse(
    await readFile(path.join(rootDirectory, 'public/templates/asset-manifest.json'), 'utf8'),
  ) as { schemaVersion: number; assets: Array<{ path: string; sha256: string; bytes: number }> };
  if (manifest.schemaVersion !== 1 || manifest.assets.length === 0) throw new Error('template_standalone_manifest_invalid');
  for (const asset of manifest.assets) {
    const source = await readFile(path.join(rootDirectory, 'public', asset.path));
    const standalone = await readFile(path.join(standaloneDirectory, 'public', asset.path));
    if (
      source.byteLength !== asset.bytes
      || standalone.byteLength !== asset.bytes
      || sha256(source) !== asset.sha256
      || sha256(standalone) !== asset.sha256
    ) throw new Error('template_standalone_hash_mismatch');
  }
  return { assets: manifest.assets.length };
}

async function main(): Promise<void> {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--standalone='));
  if (!argument || process.argv.length !== 3) throw new Error('Usage: template:verify-standalone --standalone=<directory>');
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  console.log(JSON.stringify(await verifyStandaloneTemplateAssets(rootDirectory, path.resolve(argument.slice('--standalone='.length)))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
