import { isProductionBuild } from './database-path';

export type DatabaseKind = 'postgresql' | 'sqlite';

/**
 * Decide which database engine this process talks to.
 *
 * Two cases override `DB_TYPE` rather than trusting it:
 *
 * **Desktop.** The client keeps everything on the user's machine; a stray
 * `DB_TYPE=postgresql` in the environment it inherits must not send a person's
 * resumes to a server. The desktop shell sets `SQLITE_PATH` itself, so this is
 * about refusing an engine, not choosing a file.
 *
 * **Production build.** `next build` imports every route module to read its
 * config, which constructs the adapter. Against PostgreSQL that means the build
 * opens a connection to — and runs migrations against — whatever `DATABASE_URL`
 * points at, which in CI is usually nothing and in a careless setup is
 * production. It is the same reason the build gets a throwaway SQLite file (see
 * resolveDatabasePath): a build must not touch a real database.
 */
export function resolveDatabaseKind(env: Record<string, string | undefined>): DatabaseKind {
  if (env.JADE_RUNTIME === 'desktop') return 'sqlite';
  if (isProductionBuild(env)) return 'sqlite';
  return env.DB_TYPE === 'postgresql' ? 'postgresql' : 'sqlite';
}

/**
 * Vercel's filesystem is read-only, so SQLite cannot work there at runtime.
 *
 * Exempt during the build: the build deliberately uses a throwaway SQLite file
 * in tmpdir even for PostgreSQL deployments, and without this exemption every
 * Vercel build would fail on a guard meant for runtime.
 */
export function rejectsSqliteOnVercel(env: Record<string, string | undefined>): boolean {
  if (env.JADE_RUNTIME === 'desktop') return false;
  if (isProductionBuild(env)) return false;
  return Boolean(env.VERCEL) && resolveDatabaseKind(env) === 'sqlite';
}
