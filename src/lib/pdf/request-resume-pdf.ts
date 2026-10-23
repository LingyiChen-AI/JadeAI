import type { PdfLayout } from './layout';
import type { ResumePdfSnapshot } from './snapshot';

export const PDF_EXPORT_TIMEOUT_MS = 60_000;

type PdfExportErrorCode = 'pdfInvalidSnapshot' | 'pdfTooLarge' | 'pdfAccessDenied' |
  'pdfBusy' | 'pdfTimeout' | 'pdfRenderFailed' | 'pdfInvalidResponse' | 'pdfNetworkError';

export class PdfExportError extends Error {
  constructor(
    public readonly code: PdfExportErrorCode,
    message: string,
    public readonly fields: string[] = [],
  ) { super(message); }
}

/** Called only by an explicit export action. No preview requests or PDF cache. */
export async function requestResumePdf(
  resumeId: string,
  snapshot: ResumePdfSnapshot,
  layout: PdfLayout,
  { signal, fingerprint }: { signal?: AbortSignal; fingerprint?: string | null } = {},
): Promise<Blob> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new PdfExportError('pdfTimeout', 'PDF export timed out')), PDF_EXPORT_TIMEOUT_MS);
  let rejectAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  const operation = async () => {
    const response = await fetch(`/api/resume/${encodeURIComponent(resumeId)}/export`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}) },
      body: JSON.stringify({ format: 'pdf', layout, resume: snapshot }),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error : `PDF export failed (${response.status})`;
      const fields = body && typeof body === 'object' && 'issues' in body && Array.isArray(body.issues)
        ? body.issues.flatMap((issue: unknown) => issue && typeof issue === 'object' && 'path' in issue && typeof issue.path === 'string' ? [issue.path] : [])
        : [];
      const code: PdfExportErrorCode = response.status === 400 ? 'pdfInvalidSnapshot'
        : response.status === 413 ? 'pdfTooLarge'
        : [401, 403, 404].includes(response.status) ? 'pdfAccessDenied'
        : response.status === 429 ? 'pdfBusy'
        : [408, 504].includes(response.status) ? 'pdfTimeout' : 'pdfRenderFailed';
      throw new PdfExportError(code, detail, fields);
    }
    if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') {
      throw new PdfExportError('pdfInvalidResponse', 'Unexpected PDF response type');
    }
    const blob = await response.blob();
    if (!blob.size) throw new PdfExportError('pdfInvalidResponse', 'Empty PDF response');
    return blob;
  };
  try {
    return await Promise.race([operation(), cancelled]);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof PdfExportError) throw error;
    throw new PdfExportError('pdfNetworkError', 'Unable to reach the PDF export endpoint');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}
