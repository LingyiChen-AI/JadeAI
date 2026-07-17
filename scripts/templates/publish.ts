import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExternalRelease, parsePublicationActions, verifyExternalRelease } from './external-release';
import { renderTemplateMatrix } from './render-previews';
import { validateApprovedSources } from './validate';

async function main(): Promise<void> {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (process.argv.slice(2).join(' ') === '--verify') {
    console.log(JSON.stringify(await verifyExternalRelease(rootDirectory)));
    return;
  }
  const actions = parsePublicationActions(process.argv.slice(2));
  const sources = await validateApprovedSources(rootDirectory);
  const rendered = await renderTemplateMatrix({ rootDirectory, sources });
  await buildExternalRelease({ sourceRoot: rootDirectory, outputRoot: rootDirectory, sources, rendered, actions });
  console.log(JSON.stringify(await verifyExternalRelease(rootDirectory)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
