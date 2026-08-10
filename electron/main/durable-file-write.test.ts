import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonWithBackup, writeFileDurable, writeFileDurableSync } from './durable-file-write';

let dir: string;
let target: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jade-durable-'));
  target = join(dir, 'state.json');
});

afterEach(() => {
  chmodSync(dir, 0o700);
  rmSync(dir, { recursive: true, force: true });
});

describe('writeFileDurable', () => {
  it('writes the payload and leaves no temp file behind', async () => {
    await writeFileDurable(target, '{"a":1}');
    expect(readFileSync(target, 'utf-8')).toBe('{"a":1}');
    expect(existsSync(`${target}.tmp`)).toBe(false);
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
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });
});

describe('writeFileDurableSync', () => {
  it('writes the payload synchronously', () => {
    writeFileDurableSync(target, '{"sync":true}');
    expect(readFileSync(target, 'utf-8')).toBe('{"sync":true}');
    expect(existsSync(`${target}.tmp`)).toBe(false);
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
