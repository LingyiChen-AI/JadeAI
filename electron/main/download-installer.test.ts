import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from './download-installer';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jade-download-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A fetch stand-in whose body streams `payload` in small chunks. */
function respondWith(payload: string, init: { ok?: boolean; status?: number; length?: string | null } = {}) {
  const bytes = Buffer.from(payload);
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length'
          ? init.length === undefined
            ? String(bytes.length)
            : init.length
          : null,
    },
    body: Readable.toWeb(Readable.from([bytes.subarray(0, 3), bytes.subarray(3)])),
  });
}

const request = (overrides = {}) => ({
  url: 'https://example.test/JadeAI-1.0.0-mac-arm64.dmg',
  fileName: 'JadeAI-1.0.0-mac-arm64.dmg',
  expectedSize: 10,
  directory: dir,
  ...overrides,
});

describe('downloadFile', () => {
  it('writes the payload and returns the final path', async () => {
    const path = await downloadFile(request(), {
      fetch: respondWith('0123456789') as never,
      onProgress: vi.fn(),
    });
    expect(path).toBe(join(dir, 'JadeAI-1.0.0-mac-arm64.dmg'));
    expect(readFileSync(path, 'utf-8')).toBe('0123456789');
  });

  it('reports progress as a fraction between 0 and 1', async () => {
    const onProgress = vi.fn();
    await downloadFile(request(), { fetch: respondWith('0123456789') as never, onProgress });
    const fractions = onProgress.mock.calls.map(([f]) => f);
    expect(fractions.length).toBeGreaterThan(0);
    expect(Math.min(...fractions)).toBeGreaterThan(0);
    expect(Math.max(...fractions)).toBeCloseTo(1, 5);
  });

  // The symptom of a truncated dmg is "JadeAI 已损坏，无法打开" — the exact
  // message a broken signature produces. Leaving a short file under the real
  // name would send someone chasing the wrong bug.
  it('rejects and leaves nothing behind when fewer bytes arrive than promised', async () => {
    await expect(
      downloadFile(request({ expectedSize: 999 }), {
        fetch: respondWith('0123456789') as never,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/incomplete/i);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('never leaves a partial file under the real name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => '10' },
      body: Readable.toWeb(
        new Readable({
          read() {
            this.push(Buffer.from('012'));
            this.destroy(new Error('connection reset'));
          },
        }),
      ),
    });
    await expect(
      downloadFile(request(), { fetch: fetchImpl as never, onProgress: vi.fn() }),
    ).rejects.toThrow();
    expect(existsSync(join(dir, 'JadeAI-1.0.0-mac-arm64.dmg'))).toBe(false);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('throws on a non-ok response without creating a file', async () => {
    await expect(
      downloadFile(request(), {
        fetch: respondWith('', { ok: false, status: 404 }) as never,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/404/);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  // A .part left by a previous crashed attempt must not be appended to or
  // mistaken for progress.
  it('discards a leftover partial file from an earlier attempt', async () => {
    writeFileSync(join(dir, 'JadeAI-1.0.0-mac-arm64.dmg.part'), 'stale garbage');
    const path = await downloadFile(request(), {
      fetch: respondWith('0123456789') as never,
      onProgress: vi.fn(),
    });
    expect(readFileSync(path, 'utf-8')).toBe('0123456789');
    expect(readdirSync(dir)).toEqual(['JadeAI-1.0.0-mac-arm64.dmg']);
  });

  // GitHub's CDN does not always send content-length; the API size is the
  // fallback, and progress must not divide by zero or report NaN.
  it('falls back to the API size when content-length is absent', async () => {
    const onProgress = vi.fn();
    await downloadFile(request(), {
      fetch: respondWith('0123456789', { length: null }) as never,
      onProgress,
    });
    const fractions = onProgress.mock.calls.map(([f]) => f);
    expect(fractions.every((f) => Number.isFinite(f))).toBe(true);
    expect(Math.max(...fractions)).toBeCloseTo(1, 5);
  });
});
