import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../schema';
import { resolveMigrationsDir } from '../migrations-dir';
import type { DatabaseAdapter } from '../adapter';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config';

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
    // Desktop has exactly one user, created lazily by resolveUser() →
    // userRepository.ensureLocalUser(). Seeding a demo-fingerprint user here
    // would leave a second, unreachable user row in every install.
    if (config.runtime.desktop) {
      return;
    }

    try {
      const row = this.sqlite.prepare('SELECT count(*) as count FROM users').get() as
        | { count: number }
        | undefined;
      if (row?.count === 0) {
        const { seedDemoUser } = await import('../seed-demo');
        await seedDemoUser(this.db);
        console.log('[DB] SQLite auto-seed complete');
      }
    } catch (e) {
      console.error('[DB] SQLite auto-seed failed:', e);
    }
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }
}
