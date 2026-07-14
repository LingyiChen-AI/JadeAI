import { PostgreSQLAdapter } from './adapters/postgresql';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. JadeAI supports PostgreSQL only.');
}
const adapter = new PostgreSQLAdapter(connectionString);

// Initialize (migrate + seed) — must complete before first query.
// Store the promise so consumers can await it if needed.
const isBuildPhase =
  process.env.JADEAI_SKIP_DB_INIT === '1' ||
  process.env.NEXT_PHASE === 'phase-production-build';
const _initPromise = isBuildPhase
  ? Promise.resolve()
  : adapter.initialize().catch((e) =>
      console.error('[DB] Initialize failed:', e)
    );

/** Await this before any DB operation to ensure tables exist */
export const dbReady = _initPromise;

export const db = adapter.db;
export { adapter };
