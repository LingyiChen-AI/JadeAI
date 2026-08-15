import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readJsonWithBackup,
  sweepStaleDurableWriteTemps,
  TEMP_SWEEP_STALE_MS,
  writeFileDurable,
  writeFileDurableSync,
} from './durable-file-write';

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
  //
  // POSIX only. Windows does not enforce POSIX mode bits — chmod there toggles
  // the read-only attribute on files and does nothing for a directory — so this
  // fixture cannot make the write fail at all, and the assertion sees a write
  // that simply succeeded. Inducing the same failure on Windows would need a
  // different mechanism entirely (an exclusive lock on a temp path whose name
  // is a uuid we cannot predict), so the guarantee is genuinely unverified
  // there rather than merely unasserted.
  it.skipIf(process.platform === 'win32')(
    'leaves the existing file intact when the write cannot start',
    async () => {
      writeFileSync(target, '{"gen":1}');
      chmodSync(dir, 0o500); // read + execute only: no new files may be created
      await expect(writeFileDurable(target, '{"gen":2}')).rejects.toThrow();
      chmodSync(dir, 0o700);
      expect(readFileSync(target, 'utf-8')).toBe('{"gen":1}');
      expect(tmpFilesRemaining()).toHaveLength(0);
    },
  );

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

describe('sweepStaleDurableWriteTemps', () => {
  // Ages a file by rewriting its mtime, so the cutoff can be exercised without
  // the test sleeping for five minutes.
  function makeTemp(name: string, ageMs: number): string {
    const path = join(dir, name);
    writeFileSync(path, 'partial payload');
    const when = new Date(Date.now() - ageMs);
    utimesSync(path, when, when);
    return path;
  }

  it('deletes an abandoned temp older than the cutoff', () => {
    const orphan = makeTemp('state.json.999.abc.tmp', TEMP_SWEEP_STALE_MS + 60_000);
    sweepStaleDurableWriteTemps(target);
    expect(existsSync(orphan)).toBe(false);
  });

  // The cutoff is the entire safety argument: a fresh temp may belong to a live
  // writer (another app instance, or an in-flight async write here), and
  // deleting it mid-write would corrupt exactly what this module protects.
  it('leaves a fresh temp alone, because a live writer may own it', () => {
    const inFlight = makeTemp('state.json.999.abc.tmp', 1_000);
    sweepStaleDurableWriteTemps(target);
    expect(existsSync(inFlight)).toBe(true);
  });

  it('never touches the real file or its .bak sidecar', () => {
    writeFileSync(target, '{"real":true}');
    writeFileSync(`${target}.bak`, '{"backup":true}');
    const old = new Date(Date.now() - TEMP_SWEEP_STALE_MS * 10);
    utimesSync(target, old, old);
    utimesSync(`${target}.bak`, old, old);

    sweepStaleDurableWriteTemps(target);

    expect(existsSync(target)).toBe(true);
    expect(existsSync(`${target}.bak`)).toBe(true);
  });

  // The prefix is anchored on the target's basename, so a sweep for one file
  // cannot reap another's temps — this directory is the Electron userData dir,
  // shared with Chromium's own files and (soon) the secrets store.
  it('ignores stale temps belonging to a different target', () => {
    const other = makeTemp('secrets.bin.999.abc.tmp', TEMP_SWEEP_STALE_MS * 10);
    sweepStaleDurableWriteTemps(target);
    expect(existsSync(other)).toBe(true);
  });

  it('does not throw when the directory does not exist', () => {
    expect(() => sweepStaleDurableWriteTemps(join(dir, 'nope', 'state.json'))).not.toThrow();
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
