import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  opendirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

/**
 * Concurrency contract: this module does NOT serialize overlapping writes to
 * the same `finalPath`. Each call gets its own uniquely-named temp file (see
 * `tempPathFor`), so overlapping writers never share an inode. The worst case
 * degrades to an ordinary last-rename-wins lost update: `finalPath` always
 * ends up holding one writer's complete payload, but callers cannot predict
 * which one. Callers that need "the last call wins with the newest data"
 * (e.g. a SettingsStore that serializes its own async writes and does a
 * final flushSync on quit) get that for free; callers that need strict
 * ordering must serialize themselves before calling in.
 */

/**
 * Unique per call, not a fixed `${finalPath}.tmp`: two overlapping writes to
 * the same target would otherwise open the SAME inode (no O_EXCL), and the
 * slower one's bytes land in the file the faster one already renamed into
 * place — producing exactly the torn/incorrect content this module exists to
 * prevent. With unique names the worst case degrades to an ordinary
 * last-rename-wins lost update, where finalPath always holds one writer's
 * complete payload.
 */
function tempPathFor(finalPath: string): string {
  return `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
}

// Windows file locks are closer to mandatory than POSIX's advisory locks: a
// virus scanner, backup agent, or Explorer's indexer holding a transient
// handle can make a rename that would always succeed on macOS/Linux fail
// with EBUSY/EPERM. Retry briefly, Windows only — elsewhere a rename failure
// is real and should surface immediately, not be delayed ~185ms for nothing.
const RENAME_RETRY_DELAYS_MS = [10, 25, 50, 100];

function isTransientRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EBUSY' || code === 'EPERM';
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function renameWithRetry(tmpPath: string, finalPath: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tmpPath, finalPath);
      return;
    } catch (error) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (process.platform !== 'win32' || delay === undefined || !isTransientRenameError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function renameWithRetrySync(tmpPath: string, finalPath: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(tmpPath, finalPath);
      return;
    } catch (error) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (process.platform !== 'win32' || delay === undefined || !isTransientRenameError(error)) {
        throw error;
      }
      sleepSync(delay);
    }
  }
}

/**
 * fsync a directory so a rename inside it is durable.
 *
 * Best-effort by design: Windows cannot open a directory for fsync and some
 * filesystems reject it. The file fsync is the load-bearing part; this only
 * closes the "rename recorded but not persisted" window where the OS allows it.
 */
async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch {
    // Expected on Windows and on filesystems without directory fsync.
  } finally {
    await handle?.close().catch(() => {});
  }
}

function syncDirectorySync(directory: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(directory, 'r');
    fsyncSync(fd);
  } catch {
    // Same platform caveats as syncDirectory.
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // The fsync already happened or the open failed; nothing actionable.
      }
    }
  }
}

function backupExisting(finalPath: string): void {
  if (!existsSync(finalPath)) return;
  try {
    copyFileSync(finalPath, `${finalPath}.bak`);
  } catch {
    // A missing backup is survivable; failing the write over it is not.
  }
}

/** Write `payload` durably: temp file → fsync → rename → fsync directory. */
export async function writeFileDurable(finalPath: string, payload: string): Promise<void> {
  const tmpPath = tempPathFor(finalPath);
  // Synchronous by design even on the async path: the settings file is tiny,
  // so the event-loop stall is negligible, and fs.promises.copyFile would
  // just introduce a different failure interleaving for no real benefit.
  backupExisting(finalPath);
  try {
    const handle = await open(tmpPath, 'w');
    try {
      await handle.writeFile(payload, 'utf-8');
      // fsync BEFORE rename. A rename that lands first can expose a zero-length file.
      await handle.sync();
    } finally {
      // Never let a close failure supersede a real write/sync error — the
      // latter is the one a postmortem needs. (finally always overrides the
      // try's error in JS, so this must be swallowed explicitly.)
      await handle.close().catch(() => {});
    }
    await renameWithRetry(tmpPath, finalPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  await syncDirectory(dirname(finalPath));
}

/** Synchronous variant, for the quit path where there is no time to await. */
export function writeFileDurableSync(finalPath: string, payload: string): void {
  const tmpPath = tempPathFor(finalPath);
  backupExisting(finalPath);
  try {
    const fd = openSync(tmpPath, 'w');
    try {
      writeFileSync(fd, payload, 'utf-8');
      fsyncSync(fd);
    } finally {
      // Same rationale as the async path: don't let a close failure hide the
      // real write/sync error.
      try {
        closeSync(fd);
      } catch {
        // Intentionally swallowed.
      }
    }
    renameWithRetrySync(tmpPath, finalPath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
  syncDirectorySync(dirname(finalPath));
}

function tryParse<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** Read JSON, falling back to the `.bak` sidecar and then to `fallback`. */
export function readJsonWithBackup<T>(finalPath: string, fallback: T): T {
  return tryParse<T>(finalPath) ?? tryParse<T>(`${finalPath}.bak`) ?? fallback;
}

/**
 * Hard cap on entries examined per sweep. The directory being scanned is the
 * Electron userData dir, which Chromium also fills with its own caches, and a
 * sweep must never turn into an unbounded stall at startup.
 */
export const TEMP_SWEEP_MAX_ENTRIES = 1024;

/**
 * Only reap temp files older than this. The cutoff is the whole reason this is
 * safe: a temp file belonging to a LIVE writer — another app instance, or an
 * in-flight async write in this one — is indistinguishable from an orphan by
 * name alone, and deleting it would corrupt exactly the write this module
 * exists to protect. Real writes here take single-digit milliseconds, so
 * anything this old is genuinely abandoned.
 */
export const TEMP_SWEEP_STALE_MS = 5 * 60 * 1000;

/**
 * Delete abandoned `tempPathFor()` files left beside `finalPath`.
 *
 * `writeFileDurable` removes its own temp on failure, so orphans come from the
 * one path it cannot cover: the process dying between `open` and `rename`
 * (SIGKILL, a crash, a power cut). Nothing else ever cleans them up, so they
 * accumulate for the life of the installation.
 *
 * Streams the directory with a bounded cursor rather than `readdirSync`, which
 * would materialise the entire listing — worst in precisely the situation this
 * cleans up, a directory that has accumulated thousands of orphans.
 *
 * Best-effort throughout: this runs to tidy up, and must never be the reason a
 * launch fails.
 */
export function sweepStaleDurableWriteTemps(finalPath: string, now: number = Date.now()): void {
  const directory = dirname(finalPath);
  // Anchored on the target's own basename so a sweep for one file can never
  // reach another's temps. `.bak` does not match: it lacks the `.tmp` suffix.
  const prefix = `${basename(finalPath)}.`;
  const cutoff = now - TEMP_SWEEP_STALE_MS;

  let cursor: ReturnType<typeof opendirSync> | undefined;
  try {
    cursor = opendirSync(directory, { bufferSize: 32 });
    for (let scanned = 0; scanned < TEMP_SWEEP_MAX_ENTRIES; scanned += 1) {
      const entry = cursor.readSync();
      if (entry === null) break;
      if (!entry.name.startsWith(prefix) || !entry.name.endsWith('.tmp')) continue;
      const entryPath = join(directory, entry.name);
      try {
        if (statSync(entryPath).mtimeMs < cutoff) {
          unlinkSync(entryPath);
        }
      } catch {
        // Raced with another sweep, or not ours to delete. Skip it.
      }
    }
  } catch {
    // Unreadable directory, or a filesystem without opendir. Nothing to do.
  } finally {
    try {
      cursor?.closeSync();
    } catch {
      // Already closed by the failing readSync.
    }
  }
}
