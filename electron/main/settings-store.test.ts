import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jade-settings-'));
    file = join(dir, 'jade-settings.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts from defaults when the file does not exist', () => {
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('recovers to defaults from a corrupt file instead of throwing', () => {
    writeFileSync(file, '{ not json');
    expect(() => new SettingsStore(file)).not.toThrow();
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps a well-formed but out-of-range file at construction time', () => {
    // readJsonWithBackup() parses this fine and hands it straight back — it
    // only falls back to `fallback` on a parse failure. Only the
    // constructor's own normalizeSettings() call catches an invalid shape
    // like this, so this has to go through a real file, not a raw object.
    writeFileSync(file, JSON.stringify({ locale: 'fr', window: { width: 10 } }));
    const settings = new SettingsStore(file).get();
    expect(settings.locale).toBe(DEFAULT_SETTINGS.locale);
    expect(settings.window.width).toBe(940);
  });

  it('normalizes a patch rather than trusting it', () => {
    const store = new SettingsStore(file);
    // A renderer could send anything across IPC; patch() must not store it raw.
    const result = store.patch({ locale: 'fr' } as never);
    expect(result.locale).toBe(DEFAULT_SETTINGS.locale);
  });

  it('persists a patch to disk', async () => {
    const store = new SettingsStore(file);
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
    const store = new SettingsStore(file);
    store.patch({ locale: 'en' });
    store.flushSync();
    expect(JSON.parse(readFileSync(file, 'utf-8')).locale).toBe('en');
  });

  it('round-trips through a fresh store', async () => {
    const first = new SettingsStore(file);
    first.patch({ locale: 'en', lastResumeId: 'r-9' });
    first.flushSync();
    expect(new SettingsStore(file).get()).toMatchObject({ locale: 'en', lastResumeId: 'r-9' });
  });
});
