import { MAX_PDF_SNAPSHOT_BYTES } from './snapshot-schema';

export class PdfRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Enforce the byte limit even for chunked requests or dishonest Content-Length. */
export async function readPdfSnapshotRequest(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new PdfRequestError('PDF snapshots require application/json', 415);
  }
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_PDF_SNAPSHOT_BYTES) throw new PdfRequestError('PDF snapshot exceeds 2 MiB', 413);
  if (!request.body) throw new PdfRequestError('PDF snapshot body is required', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfRequestError('PDF snapshot upload timed out', 408)), 10_000);
    onAbort = () => reject(request.signal.reason);
    request.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PDF_SNAPSHOT_BYTES) throw new PdfRequestError('PDF snapshot exceeds 2 MiB', 413);
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    if (onAbort) request.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new PdfRequestError('Invalid JSON in PDF snapshot', 400); }
}
