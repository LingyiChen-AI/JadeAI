import { SQLiteAdapter } from './adapters/sqlite';
import type { DatabaseAdapter } from './adapter';

const adapter: DatabaseAdapter = new SQLiteAdapter(
  process.env.SQLITE_PATH || './data/jade.db',
);

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
