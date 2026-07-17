import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectJsonResumeTheme } from './template-toolchain';

function option(name: string): string {
  const matches = process.argv.slice(2).filter((argument) => argument.startsWith(`--${name}=`));
  if (matches.length !== 1) throw new Error(`template_import_${name}_required`);
  return matches[0]!.slice(name.length + 3);
}

async function main(): Promise<void> {
  const inputDirectory = path.resolve(option('input'));
  const outputDirectory = path.resolve(option('output'));
  const report = await inspectJsonResumeTheme({
    inputDirectory,
    outputDirectory,
    sourceRevision: option('revision'),
  });
  console.log(JSON.stringify(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
