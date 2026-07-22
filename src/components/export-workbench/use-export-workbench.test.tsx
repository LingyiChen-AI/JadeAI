// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types/resume';
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
      '/api/resume/resume-1/export?format=pdf',
    ]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({
      expectedRevision: 2,
      sections: [{ content: { text: 'Edited' } }],
    });
    expect(result.current.transactionState.status).toBe('success');
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draft?.revision).toBe(3);
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
});
