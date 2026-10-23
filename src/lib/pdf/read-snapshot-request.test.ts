import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPdfSnapshotRequest } from './read-snapshot-request';
import { MAX_PDF_SNAPSHOT_BYTES } from './snapshot-schema';

describe('bounded snapshot request body', () => {
  afterEach(() => vi.useRealTimers());
  it('reads JSON with charset', async () => {
    expect(await readPdfSnapshotRequest(new Request('http://localhost', {
      method: 'POST', body: '{"format":"pdf"}', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }))).toEqual({ format: 'pdf' });
  });
  it.each([
    [{ 'Content-Type': 'text/html' }, '{}', 415],
    [{ 'Content-Type': 'application/json' }, '{', 400],
    [{ 'Content-Type': 'application/json', 'Content-Length': String(MAX_PDF_SNAPSHOT_BYTES + 1) }, '{}', 413],
    [{ 'Content-Type': 'application/json', 'Content-Length': '1' }, ' '.repeat(MAX_PDF_SNAPSHOT_BYTES + 1), 413],
  ])('rejects invalid or oversized bodies', async (headers, body, status) => {
    await expect(readPdfSnapshotRequest(new Request('http://localhost', {
      method: 'POST', headers: headers as HeadersInit, body: body as string,
    }))).rejects.toMatchObject({ status });
  });
  it('cancels a stalled chunked upload after its deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const request = new Request('http://localhost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream({ cancel }), duplex: 'half',
    } as RequestInit);
    const result = expect(readPdfSnapshotRequest(request)).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a pending body read when the client disconnects', async () => {
    const controller = new AbortController();
    const request = new Request('http://localhost', {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream(), duplex: 'half',
    } as RequestInit);
    const result = expect(readPdfSnapshotRequest(request)).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await result;
  });
});
