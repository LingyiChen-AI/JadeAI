import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { loadLegacyTemplateAdapter } from './legacy-template-registry';

describe('legacy renderer lazy loading', () => {
  test('loads a selected adapter and keeps the preview entry free of static legacy template imports', async () => {
    const adapter = await loadLegacyTemplateAdapter('classic');
    expect(adapter).toBeTypeOf('function');

    const previewSource = await readFile(resolve(process.cwd(), 'src/components/preview/resume-preview.tsx'), 'utf8');
    expect(previewSource).toContain('loadLegacyTemplateAdapter');
    expect(previewSource).not.toMatch(/from ['"]\.\/templates\//);
    expect(previewSource).not.toContain('templateMap');
  });
});
