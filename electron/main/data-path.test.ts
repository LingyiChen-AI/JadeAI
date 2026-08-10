import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUserDataDir } from './data-path';

// Built with join() so the expectations hold on Windows too, where join()
// yields backslashes. A hardcoded POSIX literal would fail there, and this app
// packages for win/linux/mac.
const SUPPORT_DIR = join('/Users/me/Library/Application Support');
const PROD_DIR = join(SUPPORT_DIR, 'JadeAI');
const DEV_DIR = join(SUPPORT_DIR, 'JadeAI-dev');

describe('resolveUserDataDir', () => {
  it('returns the platform directory unchanged in production', () => {
    expect(resolveUserDataDir(PROD_DIR, false)).toBe(PROD_DIR);
  });

  // A dev session must never write into the directory a released build owns.
  it('appends -dev as a sibling directory in development', () => {
    expect(resolveUserDataDir(PROD_DIR, true)).toBe(DEV_DIR);
  });

  it('does not double-suffix a directory that is already -dev', () => {
    expect(resolveUserDataDir(DEV_DIR, true)).toBe(DEV_DIR);
  });
});

describe('getCanonicalUserDataPath', () => {
  // Lazy-resolving instead of throwing is exactly the shape of orca's
  // data-loss bug: a late app.getPath() can resolve to a differently-cased
  // directory and read as "all my data vanished".
  it('throws when initDataPath has not run yet', async () => {
    const { getCanonicalUserDataPath } = await import('./data-path');
    expect(() => getCanonicalUserDataPath()).toThrow(/initDataPath/);
  });
});
