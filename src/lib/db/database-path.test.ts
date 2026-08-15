import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_PATH, resolveDatabasePath } from './database-path';

const BUILD = { NEXT_PHASE: 'phase-production-build' };

describe('resolveDatabasePath', () => {
  it('uses the repo default when nothing is configured', () => {
    expect(resolveDatabasePath({}, 1)).toBe(DEFAULT_DATABASE_PATH);
  });

  it('honours SQLITE_PATH at runtime — this is how the desktop app points at userData', () => {
    const env = { SQLITE_PATH: '/Users/me/Library/App/jade.db' };
    expect(resolveDatabasePath(env, 1)).toBe('/Users/me/Library/App/jade.db');
  });

  it('falls back to the default when SQLITE_PATH is set but empty', () => {
    const env = { SQLITE_PATH: '' };
    expect(resolveDatabasePath(env, 1)).toBe(DEFAULT_DATABASE_PATH);
  });

  // The bug this exists for: several `next build` workers importing the module
  // at once and racing each other's migrations on one shared file.
  it('gives each build process its own file, so concurrent workers cannot race', () => {
    const first = resolveDatabasePath(BUILD, 111);
    const second = resolveDatabasePath(BUILD, 222);
    expect(first).not.toBe(second);
    expect(first).toBe(join(tmpdir(), 'jade-build-111.db'));
    expect(first).not.toContain('data/jade.db');
  });

  // "A build never opens the real database" has to hold even for someone with
  // SQLITE_PATH exported in their shell — otherwise the race comes straight
  // back, and only for them.
  it('ignores SQLITE_PATH during a build', () => {
    const env = { ...BUILD, SQLITE_PATH: '/real/jade.db' };
    expect(resolveDatabasePath(env, 333)).toBe(join(tmpdir(), 'jade-build-333.db'));
  });

  // Only the production build phase diverts. `next dev` sets its own phase and
  // must keep using the real database.
  it('does not divert for other Next phases', () => {
    const env = { NEXT_PHASE: 'phase-development-server' };
    expect(resolveDatabasePath(env, 1)).toBe(DEFAULT_DATABASE_PATH);
  });
});
