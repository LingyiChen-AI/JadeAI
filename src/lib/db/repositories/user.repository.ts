import { eq } from 'drizzle-orm';
import { db } from '../index';
import { users, resumes } from '../schema';
import { resumeRepository } from './resume.repository';
import { createSampleResume } from '../sample-resume';
import { LOCAL_USER_ID, LOCAL_USER_NAME } from '../../auth/local-user';

export const userRepository = {
  async findById(id: string) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || null;
  },

  async findByEmail(email: string) {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] || null;
  },

  async findByFingerprint(fingerprint: string) {
    const result = await db.select().from(users).where(eq(users.fingerprint, fingerprint)).limit(1);
    return result[0] || null;
  },

  async upsertByFingerprint(fingerprint: string) {
    const existing = await this.findByFingerprint(fingerprint);
    if (existing) return existing;

    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      fingerprint,
      authType: 'fingerprint',
      name: 'Anonymous User',
    });

    // Clone demo user's resumes, or create a sample if seed hasn't run
    const demoUser = await this.findByFingerprint('demo-fingerprint');
    if (demoUser) {
      const demoResumes = await db.select().from(resumes).where(eq(resumes.userId, demoUser.id));
      for (const r of demoResumes) {
        await resumeRepository.duplicate(r.id, id, r.title);
      }
    } else {
      await createSampleResume(id);
    }

    return this.findById(id);
  },

  /**
   * Return the desktop client's single local user, creating it on first call.
   *
   * Idempotent and cheap (one indexed lookup on the hot path), so it is safe to
   * call from resolveUser() on every request. Deliberately NOT called from
   * SQLiteAdapter.initialize(): this module imports `db` from '../index', so
   * having the adapter call back into it would close an import cycle during
   * module evaluation.
   */
  async ensureLocalUser() {
    const existing = await this.findById(LOCAL_USER_ID);
    if (existing) return existing;

    await db
      .insert(users)
      .values({
        id: LOCAL_USER_ID,
        authType: 'local',
        name: LOCAL_USER_NAME,
      })
      .onConflictDoNothing();

    const created = await this.findById(LOCAL_USER_ID);
    if (!created) {
      throw new Error(`Failed to create the local user (id=${LOCAL_USER_ID})`);
    }

    // First run: give the user something to look at instead of an empty dashboard.
    await createSampleResume(LOCAL_USER_ID);

    return created;
  },

  async create(data: { id?: string; email?: string; name?: string; avatarUrl?: string; authType: 'oauth' | 'fingerprint' | 'local'; fingerprint?: string }) {
    const id = data.id || crypto.randomUUID();
    await db.insert(users).values({ ...data, id });
    return this.findById(id);
  },

  async update(id: string, data: Partial<{ name: string; avatarUrl: string }>) {
    await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
    return this.findById(id);
  },

  async getSettings(id: string) {
    const result = await db.select({ settings: users.settings }).from(users).where(eq(users.id, id)).limit(1);
    return (result[0]?.settings || {}) as Record<string, unknown>;
  },

  async updateSettings(id: string, settings: Record<string, unknown>) {
    const current = await this.getSettings(id);
    const merged = { ...current, ...settings };
    await db.update(users).set({ settings: merged, updatedAt: new Date() }).where(eq(users.id, id));
    return merged;
  },
};
