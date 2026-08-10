import { describe, expect, it, vi } from 'vitest';

// `src/lib/db/index.ts` opens a real SQLite file at import time, so every test
// that touches a repository must replace it. The factory is async so it can
// build a throwaway database before the module graph resolves.
vi.mock('../index', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../schema');

  const dir = mkdtempSync(join(tmpdir(), 'jade-local-user-'));
  const sqlite = new Database(join(dir, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: 'drizzle/migrations' });

  return { db, dbReady: Promise.resolve(), adapter: null };
});

// vi.mock is hoisted above imports, but the mock factory itself is async and
// dynamic `import()` calls inside it are not hoisted with it — so top-level
// `await import(...)` here (this repo's vitest supports top-level await in
// test modules) is what guarantees the mock is fully installed before
// `./user.repository` (which does `import { db } from '../index'`) resolves.
const { userRepository } = await import('./user.repository');
const { LOCAL_USER_ID } = await import('../../auth/local-user');

describe('userRepository.ensureLocalUser', () => {
  it('creates the local user on first call', async () => {
    const user = await userRepository.ensureLocalUser();
    expect(user.id).toBe(LOCAL_USER_ID);
    expect(user.authType).toBe('local');
  });

  it('is idempotent — a second call returns the same row, not a duplicate', async () => {
    const first = await userRepository.ensureLocalUser();
    const second = await userRepository.ensureLocalUser();
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toEqual(first.createdAt);
  });

  it('gives the freshly created local user a starter resume', async () => {
    await userRepository.ensureLocalUser();
    const { db } = await import('../index');
    const { resumes } = await import('../schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
    expect(rows.length).toBeGreaterThan(0);
  });
});
