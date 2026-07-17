import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { BUILD_OWNERSHIP_MARKER, replaceOwnedBuildDirectory } from './build';

describe('replaceOwnedBuildDirectory', () => {
  test('refuses a non-empty directory not owned by the template build and preserves its bytes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-template-build-safe-'));
    const output = path.join(root, 'existing');
    const temporary = path.join(root, 'temporary');
    await mkdir(output);
    await mkdir(temporary);
    await writeFile(path.join(output, 'valuable.txt'), 'do not delete');
    await writeFile(path.join(temporary, BUILD_OWNERSHIP_MARKER), '{"schemaVersion":1,"owner":"jadeai-template-build"}\n');

    await expect(replaceOwnedBuildDirectory(output, temporary)).rejects.toThrow('template_build_output_not_owned');
    await expect(readFile(path.join(output, 'valuable.txt'), 'utf8')).resolves.toBe('do not delete');
  });

  test('atomically replaces a directory carrying the exact ownership marker', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'jade-template-build-owned-'));
    const output = path.join(root, 'existing');
    const temporary = path.join(root, 'temporary');
    for (const directory of [output, temporary]) {
      await mkdir(directory);
      await writeFile(path.join(directory, BUILD_OWNERSHIP_MARKER), '{"schemaVersion":1,"owner":"jadeai-template-build"}\n');
    }
    await writeFile(path.join(output, 'old.txt'), 'old');
    await writeFile(path.join(temporary, 'new.txt'), 'new');

    await replaceOwnedBuildDirectory(output, temporary);
    await expect(readFile(path.join(output, 'new.txt'), 'utf8')).resolves.toBe('new');
    await expect(readFile(path.join(output, 'old.txt'), 'utf8')).rejects.toThrow();
  });
});
