import { SQLiteAdapter } from './adapters/sqlite';
import type { DatabaseAdapter } from './adapter';

const adapter: DatabaseAdapter = new SQLiteAdapter(
  process.env.SQLITE_PATH || './data/jade.db',
);

// Initialize (ensure first-run data) — must complete before first query.
const _initPromise = adapter.initialize();

/** Await this before any DB operation. */
export const dbReady = _initPromise;

export const db = adapter.db;
export { adapter };
