import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const { db } = await import('../index');
const { users, resumes } = await import('../schema');
const { eq } = await import('drizzle-orm');

// The mocked db above is a module-level singleton: the factory only runs once
// per file, so all `it` blocks share the same temp SQLite file. Without this
// reset, only the first test to run would ever see an empty `users` table —
// every later test would find the local user already present and silently
// take the early-return branch instead of the one its name describes.
beforeEach(async () => {
  await db.delete(resumes);
  await db.delete(users);
});

describe('userRepository.ensureLocalUser', () => {
  it('creates the local user on first call', async () => {
    const user = await userRepository.ensureLocalUser();
    expect(user.id).toBe(LOCAL_USER_ID);
    expect(user.authType).toBe('local');
  });

  it('is idempotent — a second call reuses the row instead of inserting again', async () => {
    const first = await userRepository.ensureLocalUser();
    const second = await userRepository.ensureLocalUser();
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toEqual(first.createdAt);

    const rows = await db.select().from(users).where(eq(users.id, LOCAL_USER_ID));
    expect(rows).toHaveLength(1);
  });

  it('gives the local user exactly one starter resume, even across repeated calls', async () => {
    await userRepository.ensureLocalUser();
    // Mimics resolveUser() calling this on every request in desktop mode —
    // a later call must not reseed a second sample resume.
    await userRepository.ensureLocalUser();

    const rows = await db.select().from(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
    expect(rows).toHaveLength(1);
  });

  // The sequential test above passes even when concurrent callers each seed a
  // resume. First launch really does race: settings-store hydrates at module
  // import while the dashboard effect fetches resumes, and both hit
  // resolveUser() -> ensureLocalUser() before the row exists.
  it('does not duplicate the starter resume when called concurrently', async () => {
    await Promise.all([
      userRepository.ensureLocalUser(),
      userRepository.ensureLocalUser(),
      userRepository.ensureLocalUser(),
    ]);

    const userRows = await db.select().from(users).where(eq(users.id, LOCAL_USER_ID));
    expect(userRows).toHaveLength(1);

    const resumeRows = await db.select().from(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
    expect(resumeRows).toHaveLength(1);
  });
});
