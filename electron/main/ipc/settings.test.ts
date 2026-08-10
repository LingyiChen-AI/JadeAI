import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
  shell: { openPath: vi.fn().mockResolvedValue('') },
}));

vi.mock('../data-path', () => ({
  getCanonicalUserDataPath: () => '/tmp/jade-userdata',
}));

const { registerSettingsIpc } = await import('./settings');
const { shell } = await import('electron');
const { getCanonicalUserDataPath } = await import('../data-path');

const FAKE_SETTINGS = { version: 1, locale: 'zh', window: {}, lastResumeId: null };

function makeFakeStore() {
  return {
    get: vi.fn(() => FAKE_SETTINGS),
    patch: vi.fn((patch: unknown) => ({ ...FAKE_SETTINGS, ...(patch as object) })),
  };
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

describe('registerSettingsIpc', () => {
  it('jade:settings:get returns store.get()', () => {
    const store = makeFakeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSettingsIpc(store as any);

    const handler = handlers.get('jade:settings:get');
    expect(handler).toBeDefined();
    expect(handler!()).toBe(FAKE_SETTINGS);
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('jade:settings:patch with a valid object calls store.patch() and returns its result', () => {
    const store = makeFakeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSettingsIpc(store as any);

    const handler = handlers.get('jade:settings:patch');
    expect(handler).toBeDefined();
    const patch = { locale: 'en' };
    const result = handler!({}, patch);

    expect(store.patch).toHaveBeenCalledWith(patch);
    expect(result).toEqual({ ...FAKE_SETTINGS, ...patch });
  });

  // The trust boundary: the renderer can send anything over IPC. A
  // non-object patch must be rejected here, in the main process, rather than
  // handed to store.patch() — the renderer side of this boundary is not
  // trustworthy even though it happens to be our own code.
  it.each([null, 'string', 42, undefined])(
    'jade:settings:patch rejects non-object patch %p without calling store.patch()',
    (badPatch) => {
      const store = makeFakeStore();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerSettingsIpc(store as any);

      const handler = handlers.get('jade:settings:patch');
      const result = handler!({}, badPatch);

      expect(store.patch).not.toHaveBeenCalled();
      expect(result).toBe(FAKE_SETTINGS);
      expect(store.get).toHaveBeenCalled();
    }
  );

  // An array passes `typeof x === 'object' && x !== null` and is forwarded to
  // store.patch() unfiltered. This is NOT a hole: SettingsStore.patch() runs
  // normalizeSettings() on the merged result, and normalizeSettings() treats
  // anything that isn't a plain record (arrays included) as invalid input and
  // falls back to defaults — already covered by Task 6's
  // `normalizeSettings([1,2,3])` test. Asserting the forwarding behavior here
  // (rather than adding a redundant array-rejecting check) documents that this
  // is deliberate, not an oversight.
  it('forwards an array patch to store.patch() (normalizeSettings handles it downstream)', () => {
    const store = makeFakeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSettingsIpc(store as any);

    const handler = handlers.get('jade:settings:patch');
    const arrayPatch = [1, 2, 3];
    handler!({}, arrayPatch);

    expect(store.patch).toHaveBeenCalledWith(arrayPatch);
  });

  it('jade:shell:open-data-dir opens the canonical user data path', async () => {
    const store = makeFakeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerSettingsIpc(store as any);

    const handler = handlers.get('jade:shell:open-data-dir');
    expect(handler).toBeDefined();
    await handler!();

    expect(shell.openPath).toHaveBeenCalledWith(getCanonicalUserDataPath());
    expect(shell.openPath).toHaveBeenCalledWith('/tmp/jade-userdata');
  });
});
