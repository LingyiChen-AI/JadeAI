import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureLocalUser = vi.fn();
const upsertByFingerprint = vi.fn();

vi.mock('@/lib/db', () => ({ db: {}, dbReady: Promise.resolve(), adapter: null }));
vi.mock('@/lib/db/repositories/user.repository', () => ({
  userRepository: { ensureLocalUser, upsertByFingerprint, findById: vi.fn(), findByEmail: vi.fn() },
}));
vi.mock('./config', () => ({ auth: vi.fn() }));

const LOCAL_USER = { id: 'local', authType: 'local' as const };

describe('resolveUser in desktop mode', () => {
  beforeEach(() => {
    vi.resetModules();
    ensureLocalUser.mockReset().mockResolvedValue(LOCAL_USER);
    upsertByFingerprint.mockReset();
  });

  async function loadWithDesktop(desktop: boolean) {
    vi.doMock('@/lib/config', () => ({
      config: { auth: { enabled: false }, runtime: { desktop }, i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] } },
    }));
    return import('./helpers');
  }

  it('returns the local user and ignores the fingerprint entirely', async () => {
    const { resolveUser } = await loadWithDesktop(true);
    expect(await resolveUser('whatever-fingerprint')).toEqual(LOCAL_USER);
    expect(upsertByFingerprint).not.toHaveBeenCalled();
  });

  // This is the property that lets the 20+ client call sites keep sending
  // x-fingerprint unchanged: two different fingerprints must not fork identity.
  it('returns the same user for a missing and for an arbitrary fingerprint', async () => {
    const { resolveUser } = await loadWithDesktop(true);
    expect(await resolveUser(null)).toEqual(await resolveUser('abc123'));
    expect(ensureLocalUser).toHaveBeenCalledTimes(2);
  });

  it('still uses the fingerprint path when not in desktop mode', async () => {
    upsertByFingerprint.mockResolvedValue({ id: 'fp-user', authType: 'fingerprint' });
    const { resolveUser } = await loadWithDesktop(false);
    expect(await resolveUser('abc123')).toEqual({ id: 'fp-user', authType: 'fingerprint' });
    expect(ensureLocalUser).not.toHaveBeenCalled();
  });

  // Pins the branch ORDER, not just the branch: the desktop check sits ahead of
  // config.auth.enabled on purpose, so "desktop has exactly one user" cannot be
  // defeated by an env-var combination. Without this case, moving the desktop
  // branch below the auth branch passes the whole suite.
  it('desktop still wins even if auth is (misconfigured to be) enabled', async () => {
    vi.doMock('@/lib/config', () => ({
      config: { auth: { enabled: true }, runtime: { desktop: true }, i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] } },
    }));
    const { resolveUser } = await import('./helpers');
    expect(await resolveUser('whatever-fingerprint')).toEqual(LOCAL_USER);
  });
});
