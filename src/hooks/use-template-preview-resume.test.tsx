// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';

import {
  TEMPLATE_PREVIEW_FIXTURE,
  useTemplatePreviewResume,
} from './use-template-preview-resume';
import type {
  DeepReadonly,
  ResumePreviewInput,
  TemplatePreviewResumeOption,
} from './use-template-preview-resume';

function response(body: unknown, ok = true): Response {
  return { ok, json: vi.fn(async () => body) } as unknown as Response;
}

function detail(title: string, sectionTitle = 'Profile') {
  return {
    id: 'server-only',
    userId: 'private-user',
    title,
    language: 'en',
    sections: [
      {
        id: 'private-section',
        resumeId: 'server-only',
        type: 'summary',
        title: sectionTitle,
        sortOrder: 0,
        visible: true,
        content: { text: `${title} summary`, _private: 'drop me' },
        createdAt: '2026-07-18T00:00:00.000Z',
      },
    ],
    template: 'classic',
  };
}

describe('useTemplatePreviewResume', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('jade_fingerprint', 'preview-fingerprint');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('selects the first resume and loads its normalized detail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([
        { id: 'resume-a', title: 'Resume A' },
        { id: 'resume-b', title: 'Resume B' },
      ]))
      .mockResolvedValueOnce(response(detail('Resume A')));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.options).toEqual([
      { id: 'resume-a', title: 'Resume A' },
      { id: 'resume-b', title: 'Resume B' },
    ]);
    expect(result.current.selectedId).toBe('resume-a');
    expect(result.current.resume).toEqual({
      title: 'Resume A',
      language: 'en',
      sections: [{
        type: 'summary', title: 'Profile', sortOrder: 0, visible: true,
        content: { text: 'Resume A summary', _private: 'drop me' },
      }],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/resume', expect.objectContaining({
      headers: { 'x-fingerprint': 'preview-fingerprint' },
      signal: expect.any(AbortSignal),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/resume/resume-a', expect.objectContaining({
      headers: { 'x-fingerprint': 'preview-fingerprint' },
      signal: expect.any(AbortSignal),
    }));
  });

  test('loads the explicitly selected resume detail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([
        { id: 'resume-a', title: 'Resume A' },
        { id: 'resume-b', title: 'Resume B' },
      ]))
      .mockResolvedValueOnce(response(detail('Resume A')))
      .mockResolvedValueOnce(response(detail('Resume B', 'Experience')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.select('resume-b'));

    await waitFor(() => expect(result.current.resume.title).toBe('Resume B'));
    expect(result.current.status).toBe('ready');
    expect(result.current.selectedId).toBe('resume-b');
    expect(result.current.resume.sections[0]?.title).toBe('Experience');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/resume/resume-b', expect.any(Object));
  });

  test('does not overwrite a fixture selection when a delayed list arrives', async () => {
    let resolveList!: (value: Response) => void;
    const list = new Promise<Response>((resolve) => { resolveList = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(list);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());

    act(() => result.current.select('fixture'));
    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.options).toEqual([{ id: 'fixture', title: TEMPLATE_PREVIEW_FIXTURE.title }]);
    await act(async () => {
      resolveList(response([{ id: 'resume-a', title: 'Resume A' }]));
      await list;
    });

    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
    expect(result.current.options).toEqual([
      { id: 'resume-a', title: 'Resume A' },
      { id: 'fixture', title: TEMPLATE_PREVIEW_FIXTURE.title },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('does not overwrite a user selection when a delayed list arrives', async () => {
    let resolveList!: (value: Response) => void;
    const list = new Promise<Response>((resolve) => { resolveList = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(list)
      .mockResolvedValueOnce(response(detail('Resume B')))
      .mockResolvedValueOnce(response(detail('Resume A')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());

    act(() => result.current.select('resume-b'));
    await waitFor(() => expect(result.current.resume.title).toBe('Resume B'));
    await act(async () => {
      resolveList(response([
        { id: 'resume-a', title: 'Resume A' },
        { id: 'resume-b', title: 'Resume B' },
      ]));
      await list;
    });

    expect(result.current.selectedId).toBe('resume-b');
    expect(result.current.resume.title).toBe('Resume B');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('uses the fixed fixture when the resume list is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.options).toEqual([{ id: 'fixture', title: TEMPLATE_PREVIEW_FIXTURE.title }]);
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
  });

  test('enters fallback without throwing when list JSON parsing rejects', async () => {
    const invalidResponse = {
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('invalid list JSON')),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(invalidResponse));
    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
  });

  test('enters fallback without throwing when detail JSON parsing rejects', async () => {
    const invalidResponse = {
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('invalid detail JSON')),
    } as unknown as Response;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ id: 'resume-a', title: 'Resume A' }]))
      .mockResolvedValueOnce(invalidResponse);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
  });

  test('switches a ready preview to the fixture without another detail request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ id: 'resume-a', title: 'Resume A' }]))
      .mockResolvedValueOnce(response(detail('Resume A')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => result.current.select('fixture'));

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
    expect(result.current.options).toEqual([
      { id: 'resume-a', title: 'Resume A' },
      { id: 'fixture', title: TEMPLATE_PREVIEW_FIXTURE.title },
    ]);
    act(() => result.current.select('fixture'));
    expect(result.current.options.filter((option) => option.id === 'fixture')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('exposes preview options and resume data as deeply readonly state', () => {
    const { result, unmount } = renderHook(() => useTemplatePreviewResume());

    expectTypeOf(result.current.options).toEqualTypeOf<DeepReadonly<TemplatePreviewResumeOption[]>>();
    expectTypeOf(result.current.resume).toEqualTypeOf<DeepReadonly<ResumePreviewInput>>();
    unmount();
  });

  test.each([
    ['list HTTP failure', vi.fn().mockResolvedValue(response({}, false))],
    ['list rejection', vi.fn().mockRejectedValue(new Error('network'))],
    ['malformed list', vi.fn().mockResolvedValue(response([{ id: 4, title: null }]))],
    ['detail HTTP failure', vi.fn()
      .mockResolvedValueOnce(response([{ id: 'resume-a', title: 'Resume A' }]))
      .mockResolvedValueOnce(response({}, false))],
    ['malformed detail', vi.fn()
      .mockResolvedValueOnce(response([{ id: 'resume-a', title: 'Resume A' }]))
      .mockResolvedValueOnce(response({ title: 'Broken', language: 'en', sections: 'nope' }))],
  ])('enters fallback without throwing on %s', async (_name, fetchMock) => {
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
  });

  test('deep-clones and freezes accepted resume detail content', async () => {
    const body = detail('Resume A');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ id: 'resume-a', title: 'Resume A' }]))
      .mockResolvedValueOnce(response(body));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const stateContent = result.current.resume.sections[0]?.content as { text: string };
    expect(stateContent).not.toBe(body.sections[0].content);
    expect(Object.isFrozen(stateContent)).toBe(true);
    body.sections[0].content.text = 'changed through response reference';
    expect(stateContent.text).toBe('Resume A summary');
    expect(() => { stateContent.text = 'changed through consumer'; }).toThrow();
    expect(stateContent.text).toBe('Resume A summary');
  });

  test.each([
    ['too many options', Array.from({ length: 1_001 }, (_, index) => ({ id: `resume-${index}`, title: `Resume ${index}` }))],
    ['duplicate option ids', [{ id: 'resume-a', title: 'A' }, { id: 'resume-a', title: 'Again' }]],
    ['the reserved fixture id', [{ id: 'fixture', title: 'Reserved' }, { id: 'resume-a', title: 'Resume A' }]],
    ['an overlong option title', [{ id: 'resume-a', title: 'x'.repeat(501) }]],
  ])('rejects a resume list containing %s', async (_name, body) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response(detail('Unexpected')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.options).toEqual([{ id: 'fixture', title: TEMPLATE_PREVIEW_FIXTURE.title }]);
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const deeplyNestedContent = (() => {
    let value: unknown = 'leaf';
    for (let depth = 0; depth < 10; depth += 1) value = { next: value };
    return value;
  })();
  const excessiveNodeContent = {
    items: Array.from({ length: 500 }, (_, index) => ({
      a: index, b: index, c: index, d: index, e: index, f: index, g: index, h: index,
    })),
  };
  const excessiveByteContent = {
    items: Array.from({ length: 500 }, () => 'x'.repeat(5_000)),
  };

  test.each([
    ['an overlong string', { ...detail('Resume A'), sections: [{ ...detail('Resume A').sections[0], content: { text: 'x'.repeat(20_001) } }] }],
    ['too many sections', { ...detail('Resume A'), sections: Array.from({ length: 257 }, (_, index) => ({ ...detail('Resume A').sections[0], sortOrder: index })) }],
    ['an oversized content array', { ...detail('Resume A'), sections: [{ ...detail('Resume A').sections[0], content: { items: Array.from({ length: 501 }, () => null) } }] }],
    ['content nested too deeply', { ...detail('Resume A'), sections: [{ ...detail('Resume A').sections[0], content: deeplyNestedContent }] }],
    ['too many content nodes', { ...detail('Resume A'), sections: [{ ...detail('Resume A').sections[0], content: excessiveNodeContent }] }],
    ['too many response bytes', { ...detail('Resume A'), sections: [{ ...detail('Resume A').sections[0], content: excessiveByteContent }] }],
  ])('rejects resume detail with %s', async (_name, body) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ id: 'resume-a', title: 'Resume A' }]))
      .mockResolvedValueOnce(response(body));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());

    await waitFor(() => expect(result.current.status).toBe('fallback'));
    expect(result.current.selectedId).toBe('fixture');
    expect(result.current.resume).toBe(TEMPLATE_PREVIEW_FIXTURE);
  });

  test('deep-freezes the fixture and never exposes it to mutation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
    const { result } = renderHook(() => useTemplatePreviewResume());
    await waitFor(() => expect(result.current.status).toBe('fallback'));

    expect(Object.isFrozen(TEMPLATE_PREVIEW_FIXTURE)).toBe(true);
    expect(Object.isFrozen(TEMPLATE_PREVIEW_FIXTURE.sections)).toBe(true);
    expect(Object.isFrozen(TEMPLATE_PREVIEW_FIXTURE.sections[0]?.content)).toBe(true);
    expect(() => {
      (result.current.resume.sections[0] as { title: string }).title = 'Mutated';
    }).toThrow();
    expect(TEMPLATE_PREVIEW_FIXTURE.sections[0]?.title).toBe('Jade Template');
  });

  test('does not let a stale detail response overwrite a newer selection', async () => {
    let resolveFirstDetail!: (value: Response) => void;
    const firstDetail = new Promise<Response>((resolve) => { resolveFirstDetail = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([
        { id: 'resume-a', title: 'Resume A' },
        { id: 'resume-b', title: 'Resume B' },
      ]))
      .mockReturnValueOnce(firstDetail)
      .mockResolvedValueOnce(response(detail('Resume B')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTemplatePreviewResume());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstSignal = (fetchMock.mock.calls[1]?.[1] as RequestInit).signal as AbortSignal;

    act(() => result.current.select('resume-b'));
    await waitFor(() => expect(result.current.resume.title).toBe('Resume B'));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      resolveFirstDetail(response(detail('Resume A')));
      await firstDetail;
    });

    expect(result.current.selectedId).toBe('resume-b');
    expect(result.current.resume.title).toBe('Resume B');
    expect(result.current.status).toBe('ready');
  });

  test('aborts an in-flight request on unmount', async () => {
    let resolveList!: (value: Response) => void;
    const list = new Promise<Response>((resolve) => { resolveList = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(list);
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useTemplatePreviewResume());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;

    await act(async () => {
      unmount();
      expect(signal.aborted).toBe(true);
      resolveList(response([]));
      await list;
    });
  });
});
