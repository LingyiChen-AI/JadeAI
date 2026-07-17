import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types/resume';
import { cleanupEditorSession } from './use-editor';
import { useResumeStore } from '@/stores/resume-store';

const resume = {
  id: 'resume-1', revision: 0, userId: 'user-1', title: 'Resume', template: 'classic',
  templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
  themeConfig: {
    primaryColor: '#000000', accentColor: '#ffffff', fontFamily: 'sans', fontSize: 'medium',
    lineSpacing: 1, margin: { top: 1, right: 1, bottom: 1, left: 1 }, sectionSpacing: 1,
  },
  isDefault: false, language: 'en', sections: [{
    id: 'section-1', resumeId: 'resume-1', type: 'summary', title: 'Summary', sortOrder: 0,
    visible: true, content: { text: '' }, createdAt: new Date(0), updatedAt: new Date(0),
  }], createdAt: new Date(0), updatedAt: new Date(0),
} satisfies Resume;

afterEach(() => {
  useResumeStore.getState().reset();
  vi.restoreAllMocks();
});

describe('cleanupEditorSession', () => {
  it('keeps a dirty resume until its save succeeds', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveSave = resolve; })));
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'dirty' });

    const cleanup = cleanupEditorSession('resume-1');
    expect(useResumeStore.getState().currentResume?.id).toBe('resume-1');
    expect(useResumeStore.getState().isDirty).toBe(true);
    resolveSave?.(Response.json({ ...resume, revision: 1, sections: [{ ...resume.sections[0], content: { text: 'dirty' } }] }));
    await cleanup;

    expect(useResumeStore.getState().currentResume).toBeNull();
  });

  it('does not let completion of resume A cleanup reset newly loaded resume B', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveSave = resolve; })));
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'dirty A' });
    const cleanup = cleanupEditorSession('resume-1');
    useResumeStore.getState().setResume({ ...resume, id: 'resume-2', title: 'Resume B' });
    resolveSave?.(Response.json({ ...resume, revision: 1 }));
    await cleanup;

    expect(useResumeStore.getState().currentResume?.id).toBe('resume-2');
  });
});
