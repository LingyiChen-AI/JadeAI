import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Next's value for `process.env.NEXT_PHASE` while `next build` is running. */
const PRODUCTION_BUILD_PHASE = 'phase-production-build';

export const DEFAULT_DATABASE_PATH = './data/jade.db';

/**
 * Resolve the SQLite file the singleton in `./index.ts` connects to.
 *
 * A production build must never open the application database. `next build`
 * collects page data in several worker processes at once, and each one imports
 * the route modules — which means each one constructs the adapter and runs
 * migrations. Pointed at a single shared file they race: on a fresh checkout
 * every worker tries to create the same tables and the build dies with
 * `SqliteError: database is locked` (SQLITE_BUSY). It is a race, so it passes
 * on a machine where the file already exists and fails on clean CI — which is
 * exactly how it surfaced, green on three branch builds and red on the release
 * tag.
 *
 * A busy timeout would not fix it. Both workers read an empty
 * `__drizzle_migrations` table BEFORE opening their write transaction, so
 * making them queue just turns "database is locked" into "table users already
 * exists". The workers must not share a database at all.
 *
 * So the build gets a private throwaway file, keyed on the process id. The
 * build has no use for real data — it imports route modules to read their
 * config, not to query — and giving it an empty database of its own keeps any
 * incidental query working instead of failing on a missing table.
 *
 * The phase check comes before SQLITE_PATH deliberately: "a build never touches
 * the real database" should hold even when someone has that variable exported
 * in their shell, where it would otherwise reintroduce the race.
 */
// `Record<string, string | undefined>`, not NodeJS.ProcessEnv: this project
// augments ProcessEnv with a required NODE_ENV, so an object literal holding
// only the keys under test will not satisfy it. Same signature as the sibling
// resolveMigrationsDir for the same reason.
export function resolveDatabasePath(
  env: Record<string, string | undefined>,
  pid: number,
): string {
  if (isProductionBuild(env)) {
    return join(tmpdir(), `jade-build-${pid}.db`);
  }
  return env.SQLITE_PATH || DEFAULT_DATABASE_PATH;
}

/** True while `next build` is running, in the parent and its page-data workers. */
export function isProductionBuild(env: Record<string, string | undefined>): boolean {
  return env.NEXT_PHASE === PRODUCTION_BUILD_PHASE;
}
