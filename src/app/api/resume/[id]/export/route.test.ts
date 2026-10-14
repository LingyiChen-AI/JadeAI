import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { resolveUser } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { renderResumePdf } from '@/lib/pdf/render-resume-pdf';
import { generateHtml } from './builders';
import { pdfResumeFixture } from '@/lib/pdf/resume-pdf.fixtures';
import { createPdfSnapshot } from '@/lib/pdf/snapshot';
import { PdfRenderBusyError } from '@/lib/pdf/render-limit';
import type { Resume } from '@/types/resume';

vi.mock('@/lib/auth/helpers', () => ({ resolveUser: vi.fn(), getUserIdFromRequest: () => 'fixture' }));
vi.mock('@/lib/db/repositories/resume.repository', () => ({ resumeRepository: { findById: vi.fn() } }));
vi.mock('@/lib/pdf/render-resume-pdf', () => ({ renderResumePdf: vi.fn() }));
vi.mock('./builders', () => ({ generateHtml: vi.fn().mockResolvedValue('<html>print</html>') }));
vi.mock('./docx', () => ({ generateDocxBuffer: vi.fn() }));

function request(query: string) {
  return GET(new NextRequest(`http://localhost/api/resume/pdf-fixture/export?${query}`), {
    params: Promise.resolve({ id: 'pdf-fixture' }),
  });
}

describe('GET resume export layouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({ id: 'pdf-fixture-user' } as Awaited<ReturnType<typeof resolveUser>>);
    vi.mocked(resumeRepository.findById).mockResolvedValue(pdfResumeFixture());
    vi.mocked(renderResumePdf).mockResolvedValue(Buffer.from('%PDF-fixture'));
  });

  it.each([
    ['format=pdf', 'a4'], ['format=pdf&fitOnePage=true', 'fit-one-page'],
    ['format=pdf&layout=a4', 'a4'], ['format=pdf&layout=fit-one-page', 'fit-one-page'],
    ['format=pdf&layout=continuous', 'continuous'],
  ])('returns PDF for %s', async (query, layout) => {
    const response = await request(query);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;.*\.pdf"$/);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('%PDF-fixture');
    expect(renderResumePdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'pdf-fixture' }), layout);
  });

  it.each(['layout=invalid', 'layout=a4&fitOnePage=true', 'layout=continuous&fitOnePage=false'])('returns 400 for %s', async query => {
    const response = await request(`format=pdf&${query}`);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(renderResumePdf).not.toHaveBeenCalled();
  });

  it('preserves forPrint=true HTML fallback', async () => {
    const response = await request('format=html&forPrint=true');
    expect(response.status).toBe(200);
    expect(generateHtml).toHaveBeenCalledWith(expect.any(Object), true);
    expect(renderResumePdf).not.toHaveBeenCalled();
  });

  it('checks ownership before rendering', async () => {
    vi.mocked(resumeRepository.findById).mockResolvedValue({ ...pdfResumeFixture(), userId: 'another-user' });
    expect((await request('format=pdf&layout=continuous')).status).toBe(403);
    expect(renderResumePdf).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    vi.mocked(resolveUser).mockResolvedValue(null);
    expect((await request('format=pdf&layout=continuous')).status).toBe(401);
    expect(renderResumePdf).not.toHaveBeenCalled();
  });
});

function snapshotRequest(body?: unknown, headers: HeadersInit = { 'Content-Type': 'application/json' }) {
  return POST(new NextRequest('http://localhost/api/resume/pdf-fixture/export', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id: 'pdf-fixture' }) });
}
function snapshotBody() {
  const resume = pdfResumeFixture();
  delete (resume.sections[0].content as Record<string, unknown>).avatar;
  return { format: 'pdf', layout: 'a4', resume: createPdfSnapshot(resume as unknown as Resume) };
}

describe('POST current resume PDF snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({ id: 'pdf-fixture-user' } as Awaited<ReturnType<typeof resolveUser>>);
    vi.mocked(resumeRepository.findById).mockResolvedValue(pdfResumeFixture());
    vi.mocked(renderResumePdf).mockResolvedValue(Buffer.from('%PDF-snapshot'));
  });

  it.each(['a4', 'fit-one-page', 'continuous'])('renders unsaved data with trusted ownership and no writes: %s', async layout => {
    const body = snapshotBody();
    body.layout = layout;
    body.resume.title = 'UNSAVED_TITLE';
    body.resume.template = 'neon';
    body.resume.sections[2].content = { text: 'UNSAVED_CONTENT Promise<T> 与 List<String>' };
    const stored = structuredClone(await resumeRepository.findById('pdf-fixture'));
    const response = await snapshotRequest(body);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="UNSAVED_TITLE.pdf"');
    expect(await response.text()).toBe('%PDF-snapshot');
    const [resume, receivedLayout, signal] = vi.mocked(renderResumePdf).mock.calls[0];
    expect(resume).toMatchObject({ id: 'pdf-fixture', userId: 'pdf-fixture-user', title: 'UNSAVED_TITLE', template: 'neon' });
    expect(resume.sections[2].content).toEqual({ text: 'UNSAVED_CONTENT Promise<T> 与 List<String>' });
    expect(receivedLayout).toBe(layout);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(await resumeRepository.findById('pdf-fixture')).toEqual(stored);
    // The mocked repository provides read methods only. Any write would fail this test.
  });

  it.each([401, 403, 404])('checks auth/ownership before even parsing the body: %i', async status => {
    if (status === 401) vi.mocked(resolveUser).mockResolvedValue(null);
    if (status === 403) vi.mocked(resumeRepository.findById).mockResolvedValue({ ...pdfResumeFixture(), userId: 'other' });
    if (status === 404) vi.mocked(resumeRepository.findById).mockResolvedValue(undefined);
    const response = await snapshotRequest('invalid json');
    expect(response.status).toBe(status);
    expect(renderResumePdf).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{'], ['unknown mode', { ...snapshotBody(), layout: 'wrong' }],
    ['wrong format', { ...snapshotBody(), format: 'html' }],
    ['client userId', { ...snapshotBody(), resume: { ...snapshotBody().resume, userId: 'other' } }],
    ['arbitrary HTML', { ...snapshotBody(), html: '<div/>' }],
    ['missing fields', { format: 'pdf', resume: {} }],
  ])('returns 400 without rendering for %s', async (_label, body) => {
    const response = await snapshotRequest(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(renderResumePdf).not.toHaveBeenCalled();
  });

  it('returns 415 for a non-JSON body', async () => {
    expect((await snapshotRequest(snapshotBody(), { 'Content-Type': 'text/plain' })).status).toBe(415);
  });

  it('returns 413 for an oversized body before rendering', async () => {
    expect((await snapshotRequest(' '.repeat(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect(renderResumePdf).not.toHaveBeenCalled();
  });

  it('returns 429 and Retry-After when Chromium capacity is full', async () => {
    vi.mocked(renderResumePdf).mockRejectedValueOnce(new PdfRenderBusyError());
    const response = await snapshotRequest(snapshotBody());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
  });

  it('surfaces a render failure and permits retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.mocked(renderResumePdf).mockRejectedValueOnce(new Error('Chromium unavailable'));
      const response = await snapshotRequest(snapshotBody());
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Chromium unavailable' });
      expect((await snapshotRequest(snapshotBody())).status).toBe(200);
    } finally { log.mockRestore(); }
  });
});
