import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Streams a release installer to disk.
 *
 * Streaming rather than buffering is not an optimisation here: the installers
 * are ~250MB and holding one in memory to write it out afterwards would spike
 * the main process by a quarter of a gigabyte.
 */

export interface DownloadRequest {
  url: string;
  /** Filename from the GitHub asset; used verbatim in the target directory. */
  fileName: string;
  /** Size GitHub reports for the asset. See the size check in downloadFile. */
  expectedSize: number;
  directory: string;
}

export interface DownloadDeps {
  fetch: typeof fetch;
  onProgress: (fraction: number) => void;
}

/** Suffix for the in-progress file, so a partial download is never mistaken for a finished one. */
const PARTIAL_SUFFIX = '.part';

/**
 * Download to `<directory>/<fileName>`, returning the final path.
 *
 * Writes to a `.part` file and renames only once the bytes are all there. That
 * ordering matters more than usual for this particular payload: a truncated dmg
 * is exactly what macOS reports as "JadeAI 已损坏，无法打开", so a download
 * interrupted halfway must not be left sitting under the real name where
 * someone would open it and conclude the release is broken.
 *
 * The rename is within one directory, so it cannot fail with EXDEV.
 */
export async function downloadFile(
  request: DownloadRequest,
  deps: DownloadDeps,
): Promise<string> {
  const finalPath = join(request.directory, request.fileName);
  const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;

  // A previous attempt may have died mid-write. Resuming is not supported, so
  // the leftover is only in the way.
  await rm(partialPath, { force: true });

  const response = await deps.fetch(request.url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  if (response.body === null) {
    throw new Error('Download failed: response had no body');
  }

  // Prefer the header, fall back to the size from the API. Either can be
  // absent; progress then simply never advances, which beats dividing by zero.
  const declared = Number(response.headers.get('content-length'));
  const total = Number.isFinite(declared) && declared > 0 ? declared : request.expectedSize;

  let received = 0;
  let lastReported = -1;
  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (total <= 0) return;
    // Report at whole percents only: the progress bar is repainted by the OS,
    // and 250MB of chunk events would otherwise mean thousands of redundant IPC
    // round trips for a bar that cannot show the difference.
    const percent = Math.floor((received / total) * 100);
    if (percent !== lastReported) {
      lastReported = percent;
      deps.onProgress(received / total);
    }
  });

  try {
    await pipeline(source, createWriteStream(partialPath));
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }

  // A truncated file is the failure mode with the most confusing symptom, and a
  // stream that ends early does not itself error. Check the bytes landed.
  if (request.expectedSize > 0) {
    const { size } = await stat(partialPath);
    if (size !== request.expectedSize) {
      await rm(partialPath, { force: true });
      throw new Error(
        `Download incomplete: expected ${request.expectedSize} bytes, got ${size}`,
      );
    }
  }

  await rename(partialPath, finalPath);
  return finalPath;
}
