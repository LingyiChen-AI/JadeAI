// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types/resume';
import { EditableResumeProvider, EditableResumeValue } from '@/components/preview/editable-resume-context';
import { useExportWorkbench } from './use-export-workbench';

function resume(revision = 2): Resume {
  return {
    id: 'resume-1', userId: 'user-1', title: 'Resume', template: 'classic', revision,
    templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    themeConfig: { primaryColor: '#111', accentColor: '#2563eb', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 1.5, sectionSpacing: 6, margin: { top: 12, right: 12, bottom: 12, left: 12 } },
    isDefault: false, language: 'en', sections: [{
      id: 'summary-1', resumeId: 'resume-1', type: 'summary', title: 'Summary', sortOrder: 0,
      visible: true, content: { text: 'Original' }, createdAt: new Date(), updatedAt: new Date(),
    }], createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('useExportWorkbench', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('loads an isolated draft and protects dirty browser exits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'Edited' }));
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(result.current.draft?.sections[0].content).toEqual({ text: 'Edited' });
    expect(result.current.isDirty).toBe(true);
    expect(event.defaultPrevented).toBe(true);

    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.historyBackRequested).toBe(true);
  });

  it('saves the complete draft before requesting the selected export and resets the dirty baseline', async () => {
    const saved = resume(3);
    (saved.sections[0].content as { text: string }).text = 'Edited';
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(['pdf']), { status: 200, headers: { 'Content-Disposition': 'attachment; filename="resume.pdf"' } }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'Edited' }));
    await act(async () => { await result.current.saveAndExport(); });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/resume/resume-1',
      '/api/resume/resume-1',
      '/api/resume/resume-1/export?format=pdf&expectedRevision=3',
    ]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({
      expectedRevision: 2,
      sections: [{ content: { text: 'Edited' } }],
    });
    expect(result.current.transactionState.status).toBe('success');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft?.revision).toBe(3);
  });

  it('exports an unchanged draft when a legal no-op PUT keeps the baseline revision', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(['pdf']), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    await act(async () => { await result.current.saveAndExport(); });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/resume/resume-1',
      '/api/resume/resume-1',
      '/api/resume/resume-1/export?format=pdf&expectedRevision=2',
    ]);
    expect(result.current.transactionState.status).toBe('success');
  });

  it('does not export after save failure', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'failed' }), { status: 500 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    await act(async () => { await result.current.saveAndExport(); });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.transactionState.status).toBe('save_failed');
  });

  it('uses the synchronously committed blur value and freezes mutations while saving', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve; }))
      .mockResolvedValueOnce(new Response(new Blob(['pdf']), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'Blurred' }));
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.saveAndExport(); });
    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'Too late' }));
    const saved = resume(3);
    (saved.sections[0].content as { text: string }).text = 'Blurred';
    resolveSave?.(new Response(JSON.stringify(saved), { status: 200 }));
    await act(async () => { await operation; });

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).sections[0].content.text).toBe('Blurred');
    expect(result.current.draft?.sections[0].content).toEqual({ text: 'Blurred' });
  });

  it('commits the focused inline editor before the primary save click builds its PUT', async () => {
    const saved = resume(3);
    (saved.sections[0].content as { text: string }).text = 'Committed on blur';
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(['pdf']), { status: 200 }));

    function Harness() {
      const workbench = useExportWorkbench('resume-1');
      if (!workbench.draft) return null;
      const value = String((workbench.draft.sections[0].content as { text: string }).text);
      return (
        <EditableResumeProvider value={{
          enabled: true,
          updateField: (source, next) => workbench.updateField({ ...source, value: next }),
        }}>
          <EditableResumeValue
            source={{ sectionId: 'summary-1', fieldPath: ['text'], kind: 'rich-text', label: 'Summary' }}
            value={value}
          />
          <button type="button" onClick={async () => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            await Promise.resolve();
            await workbench.primaryAction();
          }}>Save</button>
        </EditableResumeProvider>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Summary' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), { target: { value: 'Committed on blur' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).sections[0].content.text)
      .toBe('Committed on blur');
  });

  it('saves again after an export failure when the draft was edited, but retries directly when clean', async () => {
    const saved3 = resume(3);
    const saved4 = resume(4);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved3), { status: 200 }))
      .mockResolvedValueOnce(new Response('failed', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(saved4), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(['pdf']), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());
    await act(async () => { await result.current.primaryAction(); });
    expect(result.current.transactionState.status).toBe('saved_export_failed');

    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'After failure' }));
    await act(async () => { await result.current.primaryAction(); });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/resume/resume-1', '/api/resume/resume-1',
      '/api/resume/resume-1/export?format=pdf&expectedRevision=3',
      '/api/resume/resume-1',
      '/api/resume/resume-1/export?format=pdf&expectedRevision=4',
    ]);
  });

  it('retries export without another PUT when a failed saved revision remains clean', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(resume(3)), { status: 200 }))
      .mockResolvedValueOnce(new Response('failed', { status: 500 }))
      .mockResolvedValueOnce(new Response(new Blob(['pdf']), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    await act(async () => { await result.current.primaryAction(); });
    await act(async () => { await result.current.primaryAction(); });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/resume/resume-1',
      '/api/resume/resume-1',
      '/api/resume/resume-1/export?format=pdf&expectedRevision=3',
      '/api/resume/resume-1/export?format=pdf&expectedRevision=3',
    ]);
  });

  it.each([
    ['wrong id', { ...resume(3), id: 'other' }],
    ['regressed revision', resume(1)],
    ['invalid sections', { ...resume(3), sections: null }],
  ])('stops export for an invalid save response: %s', async (_label, invalidSaved) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(invalidSaved), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    await act(async () => { await result.current.saveAndExport(); });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.transactionState.status).toBe('save_failed');
  });

  it('isolates a changed resume id immediately and refuses to save the old draft', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...resume(), id: 'resume-2' }), { status: 200 }));
    const { result, rerender } = renderHook(({ id }) => useExportWorkbench(id), { initialProps: { id: 'resume-1' } });
    await waitFor(() => expect(result.current.draft?.id).toBe('resume-1'));

    rerender({ id: 'resume-2' });
    expect(result.current.draft).toBeNull();
    await waitFor(() => expect(result.current.draft?.id).toBe('resume-2'));
  });

  it('aborts an old save when the resume id changes and never exports that response', async () => {
    let resolveOldSave: ((response: Response) => void) | undefined;
    let oldSaveSignal: AbortSignal | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockImplementationOnce((_url, init) => {
        oldSaveSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => { resolveOldSave = resolve; });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...resume(), id: 'resume-2' }), { status: 200 }));
    const { result, rerender } = renderHook(({ id }) => useExportWorkbench(id), { initialProps: { id: 'resume-1' } });
    await waitFor(() => expect(result.current.draft?.id).toBe('resume-1'));
    let oldOperation!: Promise<unknown>;
    act(() => { oldOperation = result.current.saveAndExport(); });

    rerender({ id: 'resume-2' });
    await waitFor(() => expect(oldSaveSignal?.aborted).toBe(true));
    resolveOldSave?.(new Response(JSON.stringify(resume(3)), { status: 200 }));
    await oldOperation;
    await waitFor(() => expect(result.current.draft?.id).toBe('resume-2'));

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('aborts in-flight work and does not download after unmount', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve; }));
    const { result, unmount } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.saveAndExport(); });
    unmount();
    resolveSave?.(new Response(JSON.stringify(resume(3)), { status: 200 }));
    await operation;

    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('keeps the save controller active through deferred JSON parsing and stops after unmount', async () => {
    let resolveBody: ((saved: Resume) => void) | undefined;
    let saveSignal: AbortSignal | undefined;
    const deferredBody = new Promise<Resume>((resolve) => { resolveBody = resolve; });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockImplementationOnce((_url, init) => {
        saveSignal = init?.signal ?? undefined;
        return Promise.resolve({ ok: true, status: 200, json: () => deferredBody } as Response);
      });
    const { result, unmount } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.saveAndExport(); });
    await waitFor(() => expect(saveSignal).toBeDefined());

    unmount();
    expect(saveSignal?.aborted).toBe(true);
    resolveBody?.(resume(3));
    await operation;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('keeps the export controller active through deferred blob parsing and stops after unmount', async () => {
    let resolveBlob: ((blob: Blob) => void) | undefined;
    let exportSignal: AbortSignal | undefined;
    const deferredBlob = new Promise<Blob>((resolve) => { resolveBlob = resolve; });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockImplementationOnce((_url, init) => {
        exportSignal = init?.signal ?? undefined;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          blob: () => deferredBlob,
        } as Response);
      });
    const { result, unmount } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.saveAndExport(); });
    await waitFor(() => expect(exportSignal).toBeDefined());

    unmount();
    expect(exportSignal?.aborted).toBe(true);
    resolveBlob?.(new Blob(['pdf']));
    await operation;

    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('stops an old save after deferred JSON parsing when the resume id changes', async () => {
    let resolveBody: ((saved: Resume) => void) | undefined;
    const deferredBody = new Promise<Resume>((resolve) => { resolveBody = resolve; });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => deferredBody } as Response)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...resume(), id: 'resume-2' }), { status: 200 }));
    const { result, rerender } = renderHook(({ id }) => useExportWorkbench(id), { initialProps: { id: 'resume-1' } });
    await waitFor(() => expect(result.current.draft?.id).toBe('resume-1'));
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.saveAndExport(); });
    rerender({ id: 'resume-2' });
    resolveBody?.(resume(3));
    await operation;
    await waitFor(() => expect(result.current.draft?.id).toBe('resume-2'));

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('adds one same-URL sentinel while dirty and removes it when clean', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(resume()), { status: 200 }));
    const { result } = renderHook(() => useExportWorkbench('resume-1'));
    await waitFor(() => expect(result.current.draft).not.toBeNull());

    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'Edited' }));
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => result.current.updateField({ sectionId: 'summary-1', fieldPath: ['text'], value: 'Original' }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/');
  });
});
