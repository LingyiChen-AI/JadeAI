import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../schema';
import { resolveMigrationsDir } from '../migrations-dir';
import type { DatabaseAdapter } from '../adapter';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class SQLiteAdapter implements DatabaseAdapter {
  db;
  private sqlite: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new Database(path);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.db = drizzle(this.sqlite, { schema });

    // Deliberately NOT wrapped in try/catch. A database with no tables is
    // harder to diagnose than an app that refuses to start: the old code
    // swallowed this and the symptom surfaced later as "no such table".
    migrate(this.db, {
      migrationsFolder: resolveMigrationsDir(process.env, process.cwd()),
    });
  }

  async initialize(): Promise<void> {
    // Nothing to do yet — first-run data is handled per-mode in a later task.
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }
}
