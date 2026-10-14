import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_EXPORT_TIMEOUT_MS, PdfExportError, requestResumePdf } from './request-resume-pdf';
import { createPdfSnapshot } from './snapshot';
import { pdfResumeFixture } from './resume-pdf.fixtures';
import { PDF_LAYOUTS } from './layout';

function pdf() {
  return new Response('%PDF-fixture', { headers: { 'Content-Type': 'application/pdf' } });
}

describe('explicit snapshot PDF export requests', () => {
  const snapshot = createPdfSnapshot(pdfResumeFixture());
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => pdf());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it.each(PDF_LAYOUTS)('posts the current snapshot for %s without changing it', async layout => {
    const before = structuredClone(snapshot);
    const blob = await requestResumePdf('resume/fixture', snapshot, layout, { fingerprint: 'fixture-owner' });
    expect(await blob.text()).toBe('%PDF-fixture');
    expect(snapshot).toEqual(before);
    expect(fetchMock).toHaveBeenCalledWith('/api/resume/resume%2Ffixture/export', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-fingerprint': 'fixture-owner' },
      body: JSON.stringify({ format: 'pdf', layout, resume: snapshot }),
    }));
  });

  it.each([
    [400, 'pdfInvalidSnapshot'], [413, 'pdfTooLarge'],
    [401, 'pdfAccessDenied'], [403, 'pdfAccessDenied'], [404, 'pdfAccessDenied'],
    [429, 'pdfBusy'], [408, 'pdfTimeout'], [504, 'pdfTimeout'], [500, 'pdfRenderFailed'],
  ])('preserves actionable details for HTTP %i', async (status, code) => {
    fetchMock.mockResolvedValueOnce(Response.json({
      error: 'Fixture export failure', issues: [{ path: 'resume.themeConfig.fontFamily', message: 'Invalid font' }],
    }, { status: status as number }));
    await expect(requestResumePdf('fixture', snapshot, 'a4')).rejects.toMatchObject({
      code, message: 'Fixture export failure', fields: ['resume.themeConfig.fontFamily'],
    });
  });

  it.each([
    new Response('login', { headers: { 'Content-Type': 'text/html' } }),
    new Response('', { headers: { 'Content-Type': 'application/pdf' } }),
  ])('rejects an invalid PDF response', async response => {
    fetchMock.mockResolvedValueOnce(response);
    await expect(requestResumePdf('fixture', snapshot, 'a4')).rejects.toMatchObject({ code: 'pdfInvalidResponse' });
  });

  it('handles non-JSON server failures and missing validation details', async () => {
    fetchMock.mockResolvedValueOnce(new Response('proxy failure', { status: 502 }));
    await expect(requestResumePdf('fixture', snapshot, 'a4')).rejects.toMatchObject({
      code: 'pdfRenderFailed', message: 'PDF export failed (502)', fields: [],
    });
  });

  it('distinguishes a connection failure from a render failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(requestResumePdf('fixture', snapshot, 'a4')).rejects.toMatchObject({ code: 'pdfNetworkError' });
  });

  it('does not start an export that has already been cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(requestResumePdf('fixture', snapshot, 'a4', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels obsolete downloads even if the transport ignores AbortSignal', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const controller = new AbortController();
    const pending = expect(requestResumePdf('fixture', snapshot, 'a4', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await pending;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('bounds the entire response read and permits a new export after timeout', async () => {
    vi.useFakeTimers();
    const response = pdf();
    vi.spyOn(response, 'blob').mockReturnValueOnce(new Promise(() => {}));
    fetchMock.mockResolvedValueOnce(response);
    const pending = expect(requestResumePdf('fixture', snapshot, 'continuous'))
      .rejects.toBeInstanceOf(PdfExportError);
    await vi.advanceTimersByTimeAsync(PDF_EXPORT_TIMEOUT_MS);
    await pending;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await expect(requestResumePdf('fixture', snapshot, 'continuous')).resolves.toBeInstanceOf(Blob);
    expect(vi.getTimerCount()).toBe(0);
  });
});
