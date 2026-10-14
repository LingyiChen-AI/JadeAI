export const MAX_CONCURRENT_RESUME_PDFS = 2;

export class PdfRenderBusyError extends Error {
  constructor() { super('PDF renderer is busy. Retry shortly.'); }
}

// One bound per Node process, including route bundles and development reloads.
const state = globalThis as typeof globalThis & { __jadeResumePdfActive?: number };

export async function withResumePdfSlot<T>(render: () => Promise<T>): Promise<T> {
  const active = state.__jadeResumePdfActive ?? 0;
  if (active >= MAX_CONCURRENT_RESUME_PDFS) throw new PdfRenderBusyError();
  state.__jadeResumePdfActive = active + 1;
  try { return await render(); }
  finally { state.__jadeResumePdfActive = (state.__jadeResumePdfActive ?? 1) - 1; }
}
