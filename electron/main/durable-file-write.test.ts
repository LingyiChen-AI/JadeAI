import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonWithBackup, writeFileDurable, writeFileDurableSync } from './durable-file-write';

let dir: string;
let target: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jade-durable-'));
  target = join(dir, 'state.json');
});

// Temp paths are now unique per call (`${finalPath}.${pid}.${uuid}.tmp`), so
// checking for the literal `${target}.tmp` would always trivially pass.
// Scan the directory instead.
function tmpFilesRemaining(): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.tmp'));
}

afterEach(() => {
  chmodSync(dir, 0o700);
  rmSync(dir, { recursive: true, force: true });
});

describe('writeFileDurable', () => {
  it('writes the payload and leaves no temp file behind', async () => {
    await writeFileDurable(target, '{"a":1}');
    expect(readFileSync(target, 'utf-8')).toBe('{"a":1}');
    expect(tmpFilesRemaining()).toHaveLength(0);
  });

  it('keeps the previous contents in a .bak sidecar', async () => {
    await writeFileDurable(target, '{"gen":1}');
    await writeFileDurable(target, '{"gen":2}');
    expect(readFileSync(target, 'utf-8')).toBe('{"gen":2}');
    expect(readFileSync(`${target}.bak`, 'utf-8')).toBe('{"gen":1}');
  });

  // The failure mode this whole module exists to prevent: a write that dies
  // partway must not damage what was already on disk.
  it('leaves the existing file intact when the write cannot start', async () => {
    writeFileSync(target, '{"gen":1}');
    chmodSync(dir, 0o500); // read + execute only: no new files may be created
    await expect(writeFileDurable(target, '{"gen":2}')).rejects.toThrow();
    chmodSync(dir, 0o700);
    expect(readFileSync(target, 'utf-8')).toBe('{"gen":1}');
    expect(tmpFilesRemaining()).toHaveLength(0);
  });

  // Induces a failure AFTER the temp file exists — something the chmod fixture
  // above cannot do, because it blocks creating the temp file at all. Without
  // this case the catch block's temp-file cleanup is untested: deleting it
  // changes nothing observable.
  it('removes the temp file when the rename fails', async () => {
    // A directory sitting at the target path makes rename() fail with EISDIR
    // while the temp write itself succeeds.
    mkdirSync(target);
    await expect(writeFileDurable(target, '{"gen":2}')).rejects.toThrow();
    expect(tmpFilesRemaining()).toHaveLength(0);
  });

  // Overlapping writes must never leave a torn file. Before unique temp paths,
  // both writers shared one inode and the loser's bytes landed in the file the
  // winner had already renamed into place.
  it('never leaves torn content when two writes overlap', async () => {
    const results = await Promise.allSettled([
      writeFileDurable(target, JSON.stringify({ gen: 1 })),
      writeFileDurable(target, JSON.stringify({ gen: 2 })),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const parsed = JSON.parse(readFileSync(target, 'utf-8'));
    expect([1, 2]).toContain(parsed.gen);
    expect(tmpFilesRemaining()).toHaveLength(0);
  });
});

describe('writeFileDurableSync', () => {
  it('writes the payload synchronously', () => {
    writeFileDurableSync(target, '{"sync":true}');
    expect(readFileSync(target, 'utf-8')).toBe('{"sync":true}');
    expect(tmpFilesRemaining()).toHaveLength(0);
  });
});

describe('readJsonWithBackup', () => {
  it('returns the fallback when nothing exists', () => {
    expect(readJsonWithBackup(target, { fallback: true })).toEqual({ fallback: true });
  });

  it('reads the main file when it is valid', () => {
    writeFileSync(target, '{"from":"main"}');
    expect(readJsonWithBackup(target, {})).toEqual({ from: 'main' });
  });

  it('falls back to the .bak sidecar when the main file is corrupt', () => {
    writeFileSync(target, '{ this is not json');
    writeFileSync(`${target}.bak`, '{"from":"backup"}');
    expect(readJsonWithBackup(target, {})).toEqual({ from: 'backup' });
  });

  it('returns the fallback when both files are corrupt', () => {
    writeFileSync(target, 'garbage');
    writeFileSync(`${target}.bak`, 'also garbage');
    expect(readJsonWithBackup(target, { fallback: true })).toEqual({ fallback: true });
  });
});
