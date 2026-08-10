import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMigrationsDir } from './migrations-dir';

describe('resolveMigrationsDir', () => {
  it('prefers JADE_MIGRATIONS_DIR when it is set', () => {
    expect(
      resolveMigrationsDir(
        { JADE_MIGRATIONS_DIR: '/Applications/JadeAI.app/Contents/Resources/drizzle/migrations' },
        '/irrelevant',
      ),
    ).toBe('/Applications/JadeAI.app/Contents/Resources/drizzle/migrations');
  });

  it('falls back to <cwd>/drizzle/migrations when unset', () => {
    expect(resolveMigrationsDir({}, '/repo')).toBe(join('/repo', 'drizzle', 'migrations'));
  });

  // An empty string is what you get from `JADE_MIGRATIONS_DIR=` in a shell or a
  // misconfigured launcher. Treating it as "set" would point migrate() at cwd.
  it('ignores an empty JADE_MIGRATIONS_DIR', () => {
    expect(resolveMigrationsDir({ JADE_MIGRATIONS_DIR: '' }, '/repo')).toBe(
      join('/repo', 'drizzle', 'migrations'),
    );
  });
});
