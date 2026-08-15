import { SQLiteAdapter } from './adapters/sqlite';
import { PostgreSQLAdapter } from './adapters/postgresql';
import { rejectsSqliteOnVercel, resolveDatabaseKind } from './database-kind';
import { resolveDatabasePath } from './database-path';
import type { DatabaseAdapter } from './adapter';

function createAdapter(): DatabaseAdapter {
  if (resolveDatabaseKind(process.env) === 'postgresql') {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DB_TYPE=postgresql requires DATABASE_URL to be set');
    }
    return new PostgreSQLAdapter(url);
  }

  if (rejectsSqliteOnVercel(process.env)) {
    throw new Error(
      'SQLite is not supported on Vercel (read-only filesystem). ' +
        'Set DB_TYPE=postgresql and DATABASE_URL in your Vercel environment variables.',
    );
  }

  // Not `process.env.SQLITE_PATH || './data/jade.db'`: `next build`'s page-data
  // workers all import this module at once, and sharing one file makes them race
  // each other's migrations. See resolveDatabasePath.
  return new SQLiteAdapter(resolveDatabasePath(process.env, process.pid));
}

const adapter: DatabaseAdapter = createAdapter();

/**
 * Await this before any DB operation: it ensures first-run data exists.
 *
 * Deliberately has no `.catch()`. A migration failure throws synchronously from
 * the adapter constructor above, which surfaces as a module-load error — the
 * loud failure we want. initialize() itself only ever swallows seed failures,
 * which are survivable, so this promise does not reject in practice. Do not
 * "fix" that by attaching a catch here: it would re-hide the load error.
 */
export const dbReady = adapter.initialize();

export const db = adapter.db;
export { adapter };
