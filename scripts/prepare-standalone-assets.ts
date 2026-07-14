import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standalone = resolve(root, '.next/standalone');

if (!existsSync(standalone)) {
  throw new Error('Missing .next/standalone; ensure Next standalone output is enabled');
}

const copies = [
  [resolve(root, '.next/static'), resolve(standalone, '.next/static')],
  [resolve(root, 'public'), resolve(standalone, 'public')],
] as const;

for (const [source, destination] of copies) {
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}

console.log('[prepare-standalone-assets] Copied .next/static and public into standalone output');
