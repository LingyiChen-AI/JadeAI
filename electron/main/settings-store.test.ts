import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as durableFileWrite from './durable-file-write';
import { DEFAULT_SETTINGS, normalizeSettings, SettingsStore } from './settings-store';

describe('normalizeSettings', () => {
  it('returns defaults for a missing file', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for a non-object payload', () => {
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a recognised locale and rejects an unknown one', () => {
    expect(normalizeSettings({ locale: 'en' }).locale).toBe('en');
    expect(normalizeSettings({ locale: 'fr' }).locale).toBe(DEFAULT_SETTINGS.locale);
    expect(normalizeSettings({ locale: 42 }).locale).toBe(DEFAULT_SETTINGS.locale);
  });

  // A window persisted from a since-disconnected monitor can be absurdly small
  // or huge; restoring it verbatim gives an unusable or offscreen window.
  it('clamps window size into a usable range', () => {
    expect(normalizeSettings({ window: { width: 10, height: 10 } }).window.width).toBe(940);
    expect(normalizeSettings({ window: { width: 10, height: 10 } }).window.height).toBe(600);
    expect(normalizeSettings({ window: { width: 1400, height: 900 } }).window).toMatchObject({
      width: 1400,
      height: 900,
    });
  });

  it('drops non-numeric window coordinates instead of restoring NaN', () => {
    const settings = normalizeSettings({ window: { x: 'left', y: null } });
    expect(settings.window.x).toBeUndefined();
    expect(settings.window.y).toBeUndefined();
  });

  it('keeps lastResumeId only when it is a string', () => {
    expect(normalizeSettings({ lastResumeId: 'abc' }).lastResumeId).toBe('abc');
    expect(normalizeSettings({ lastResumeId: 7 }).lastResumeId).toBeNull();
  });

  // serverPort is read off disk and handed straight to the OS to bind, so
  // anything unusable has to become null and let the caller allocate afresh —
  // a bad value here would surface as a startup failure, not a bad preference.
  it('keeps a usable serverPort and rejects anything unbindable', () => {
    expect(normalizeSettings({ serverPort: 41234 }).serverPort).toBe(41234);
    expect(normalizeSettings({}).serverPort).toBeNull();
    expect(normalizeSettings({ serverPort: 80 }).serverPort).toBeNull(); // privileged
    expect(normalizeSettings({ serverPort: 70000 }).serverPort).toBeNull(); // out of range
    expect(normalizeSettings({ serverPort: 41234.5 }).serverPort).toBeNull(); // fractional
    expect(normalizeSettings({ serverPort: '41234' }).serverPort).toBeNull(); // string
    expect(normalizeSettings({ serverPort: Number.NaN }).serverPort).toBeNull();
  });

  it('clamps a legal-JSON-but-invalid-shape file read at construction time', () => {
    // readJsonWithBackup() only falls back on a parse failure; a well-formed
    // JSON document with out-of-range fields sails through it unchanged, so
    // the constructor's own normalizeSettings() call is what has to catch it.
    const result = normalizeSettings({ locale: 'fr', window: { width: 10 } });
    expect(result.locale).toBe(DEFAULT_SETTINGS.locale);
    expect(result.window.width).toBe(940);
    expect(result.window.height).toBe(DEFAULT_SETTINGS.window.height);
  });
});

/** Poll for a predicate instead of a fixed sleep, so CI jitter can't flake it. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('SettingsStore', () => {
  let dir: string;
  let file: string;
  // patch() is fire-and-forget: its durable write can still be in flight
  // when a test ends. Track every store a test constructs and join all of
  // them before afterEach removes `dir` — otherwise a write still queued
  // behind flushSync() can create a fresh uniquely-named .tmp file inside a
  // directory that's mid-rmSync, which throws ENOTEMPTY intermittently
  // (this is exactly the same "outlives its caller" hazard mutation C's
  // dropped .catch() exposed as an unhandled rejection).
  let stores: SettingsStore[];

  function createStore(path: string): SettingsStore {
    const store = new SettingsStore(path);
    stores.push(store);
    return store;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jade-settings-'));
    file = join(dir, 'jade-settings.json');
    stores = [];
  });

  afterEach(async () => {
    await Promise.all(stores.map((store) => store.whenIdle()));
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts from defaults when the file does not exist', () => {
    expect(createStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('recovers to defaults from a corrupt file instead of throwing', () => {
    writeFileSync(file, '{ not json');
    expect(() => createStore(file)).not.toThrow();
    expect(createStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps a well-formed but out-of-range file at construction time', () => {
    // readJsonWithBackup() parses this fine and hands it straight back — it
    // only falls back to `fallback` on a parse failure. Only the
    // constructor's own normalizeSettings() call catches an invalid shape
    // like this, so this has to go through a real file, not a raw object.
    writeFileSync(file, JSON.stringify({ locale: 'fr', window: { width: 10 } }));
    const settings = createStore(file).get();
    expect(settings.locale).toBe(DEFAULT_SETTINGS.locale);
    expect(settings.window.width).toBe(940);
  });

  it('normalizes a patch rather than trusting it', () => {
    const store = createStore(file);
    // A renderer could send anything across IPC; patch() must not store it raw.
    const result = store.patch({ locale: 'fr' } as never);
    expect(result.locale).toBe(DEFAULT_SETTINGS.locale);
  });

  it('persists a patch to disk', async () => {
    const store = createStore(file);
    store.patch({ lastResumeId: 'resume-1' });
    // patch() is fire-and-forget; poll for the async durable write to land
    // rather than betting on a fixed delay being long enough.
    await waitFor(() => {
      try {
        return JSON.parse(readFileSync(file, 'utf-8')).lastResumeId === 'resume-1';
      } catch {
        return false;
      }
    });
    expect(JSON.parse(readFileSync(file, 'utf-8')).lastResumeId).toBe('resume-1');
  });

  it('flushSync writes the current state immediately', () => {
    const store = createStore(file);
    store.patch({ locale: 'en' });
    store.flushSync();
    expect(JSON.parse(readFileSync(file, 'utf-8')).locale).toBe('en');
  });

  it('round-trips through a fresh store', async () => {
    const first = createStore(file);
    first.patch({ locale: 'en', lastResumeId: 'r-9' });
    first.flushSync();
    await first.whenIdle();
    expect(createStore(file).get()).toMatchObject({ locale: 'en', lastResumeId: 'r-9' });
  });

  it('does not let a queued write roll back the final flush', async () => {
    const store = createStore(file);
    store.patch({ lastResumeId: 'older' }); // queued, not yet on disk
    store.patch({ lastResumeId: 'newer' }); // queued behind it
    store.flushSync(); // publishes 'newer' synchronously, seals the store
    await store.whenIdle(); // let the queued writes drain (and be skipped)
    expect(JSON.parse(readFileSync(file, 'utf-8')).lastResumeId).toBe('newer');
  });

  // Content alone can't prove the guard fired: writeChain is strictly FIFO,
  // so even with the seal check removed, write('older') then write('newer')
  // still run in that order and 'newer' — the same value flushSync() already
  // wrote — lands last. Final content converges either way. What actually
  // distinguishes "queued writes are skipped after sealing" from "they still
  // run and happen to agree with the flush" is whether writeFileDurable gets
  // invoked again at all once sealed — so assert on the call count, not the
  // resulting bytes.
  it('never calls the durable writer again once flushSync has sealed the store', async () => {
    const store = createStore(file);
    const writeSpy = vi.spyOn(durableFileWrite, 'writeFileDurable');

    store.patch({ lastResumeId: 'older' }); // queued, not yet started
    store.patch({ lastResumeId: 'newer' }); // queued behind it, not yet started
    store.flushSync(); // seals before either queued write's .then() runs
    await store.whenIdle();

    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  // whenIdle() makes this cheap to cover now: if patch()'s .catch() were
  // dropped, writeChain would become a rejected promise and this await would
  // throw, failing the test — which is exactly how mutation C (dropping the
  // .catch) was previously observed to surface only as a Vitest "Unhandled
  // Rejection" warning rather than a failing assertion.
  it('does not produce an unhandled rejection when a durable write fails', async () => {
    const store = createStore(file);
    const writeSpy = vi
      .spyOn(durableFileWrite, 'writeFileDurable')
      .mockRejectedValueOnce(new Error('disk full'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.patch({ lastResumeId: 'x' });
    await expect(store.whenIdle()).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[settings] durable write failed:',
      expect.any(Error),
    );

    writeSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
