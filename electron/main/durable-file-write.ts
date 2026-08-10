import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

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
  const tmpPath = `${finalPath}.tmp`;
  backupExisting(finalPath);
  try {
    const handle = await open(tmpPath, 'w');
    try {
      await handle.writeFile(payload, 'utf-8');
      // fsync BEFORE rename. A rename that lands first can expose a zero-length file.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, finalPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  await syncDirectory(dirname(finalPath));
}

/** Synchronous variant, for the quit path where there is no time to await. */
export function writeFileDurableSync(finalPath: string, payload: string): void {
  const tmpPath = `${finalPath}.tmp`;
  backupExisting(finalPath);
  try {
    const fd = openSync(tmpPath, 'w');
    try {
      writeFileSync(fd, payload, 'utf-8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, finalPath);
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
