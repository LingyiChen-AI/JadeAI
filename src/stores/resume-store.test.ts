import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResumeStore } from './resume-store';
import type { Resume } from '@/types/resume';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';

const resume: Resume = {
  id: 'resume-1',
  revision: 0,
  userId: 'user-1',
  title: 'Test resume',
  template: 'classic',
  templateVersionId: null,
  templateSource: 'legacy',
  templateSnapshot: null,
  themeConfig: {
    primaryColor: '#000000',
    accentColor: '#ffffff',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineSpacing: 1,
    margin: { top: 1, right: 1, bottom: 1, left: 1 },
    sectionSpacing: 1,
  },
  isDefault: false,
  language: 'zh',
  sections: [{
    id: 'section-1',
    resumeId: 'resume-1',
    type: 'summary',
    title: 'Summary',
    sortOrder: 0,
    visible: true,
    content: { text: '' },
    createdAt: new Date(),
    updatedAt: new Date(),
  }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const otherResume: Resume = {
  ...resume,
  id: 'resume-2',
  userId: 'user-2',
  title: 'Other resume',
  sections: resume.sections.map((section) => ({ ...section, id: 'section-2', resumeId: 'resume-2' })),
};

function savedResume(text: string, revision = 1) {
  return {
    ...resume,
    revision,
    sections: resume.sections.map((section) => ({ ...section, content: { text } })),
  };
}

afterEach(() => {
  useResumeStore.getState().reset();
  vi.restoreAllMocks();
});

describe('resume save state', () => {
  it('replaces stale preview resolution for each pending binding choice', () => {
    const staleResolution: ResolvedTemplate = {
      kind: 'legacy-react', source: 'public', slug: 'modern', version: '1.0.0', degraded: false,
      capabilities: { supportedSections: ['summary'], paperSizes: ['a4'], supportsAvatar: true, atsCompatible: false, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'high-fidelity' },
    };
    useResumeStore.getState().setResume({ ...resume, resolvedTemplate: staleResolution });
    useResumeStore.getState().setTemplateBinding({ kind: 'legacy', templateSlug: 'minimal' });
    expect(useResumeStore.getState().currentResume?.resolvedTemplate).toBeUndefined();

    const localManifest = {
      schemaVersion: 1 as const, rendererKind: 'declarative-v1' as const,
      layout: { type: 'single-column' as const, sidebarPosition: 'left' as const, sidebarWidthPercent: 32, columnGapMm: 8 },
      typography: { fontFamily: 'noto-sans-sc' as const, baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
      colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
      spacing: { pageMarginMm: 12, sectionGapMm: 6 }, sectionSlots: [], sectionStyles: [],
      features: { showAvatar: false, showQrCodes: false, showPageNumbers: false, maxPages: 4 },
    };
    useResumeStore.getState().setTemplateBinding({ kind: 'local-snapshot', manifest: localManifest });
    expect(useResumeStore.getState().currentResume?.resolvedTemplate).toMatchObject({
      kind: 'declarative-v1', source: 'local-snapshot', manifest: localManifest,
    });
  });

  it('clears dirty state only after a successful response', async () => {
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'saved' });
    const fetchMock = vi.fn().mockResolvedValue(Response.json(savedResume('saved')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(useResumeStore.getState().save()).resolves.toBe(true);
    expect(useResumeStore.getState().isDirty).toBe(false);
    expect(useResumeStore.getState().currentResume?.revision).toBe(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ expectedRevision: 0 });
  });

  it('keeps dirty state when the API rejects the save', async () => {
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'not saved' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));

    await expect(useResumeStore.getState().save()).resolves.toBe(false);
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useResumeStore.getState().saveError).toBe('saveFailed');
  });

  it('replaces all sections as a dirty edit and keeps local history out of the save payload', async () => {
    useResumeStore.getState().setResume(resume);
    const sections = structuredClone(resume.sections);
    sections[0].content = { text: 'restored' };
    useResumeStore.getState().replaceSections(sections);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(useResumeStore.getState().save()).resolves.toBe(false);

    expect(useResumeStore.getState().isDirty).toBe(true);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({ expectedRevision: 0 });
    expect(payload.sections[0].content).toEqual({ text: 'restored' });
    expect(payload).not.toHaveProperty('aiHistoryEntries');
    expect(payload).not.toHaveProperty('aiHistoryCursor');
  });

  it('does not clear a newer edit when an older save completes', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveSave = resolve;
    })));
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'first' });
    const firstSave = useResumeStore.getState().save();
    useResumeStore.getState().updateSection('section-1', { text: 'second' });
    resolveSave?.(Response.json(savedResume('first')));

    await expect(firstSave).resolves.toBe(true);
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'second' });
    expect(useResumeStore.getState().currentResume?.revision).toBe(1);
  });

  it('does not let a successful save for resume A overwrite resume B at the same editVersion', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveSave = resolve; })));
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'A edit' });
    const savingA = useResumeStore.getState().save();
    useResumeStore.getState().setResume(otherResume);
    useResumeStore.getState().updateSection('section-2', { text: 'B edit' });
    resolveSave?.(Response.json(savedResume('A saved')));

    await expect(savingA).resolves.toBe(true);
    expect(useResumeStore.getState().currentResume?.id).toBe('resume-2');
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'B edit' });
    expect(useResumeStore.getState().isDirty).toBe(true);
  });

  it('does not let an older binding response overwrite a newer choice or concurrent section edit', async () => {
    const responses: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => responses.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    useResumeStore.getState().setResume(resume);

    useResumeStore.getState().setTemplateBinding({
      kind: 'public',
      templateSlug: 'modern',
      version: '1.0.0',
    });
    const firstSave = useResumeStore.getState().save();
    useResumeStore.getState().setTemplateBinding({ kind: 'legacy', templateSlug: 'minimal' });
    useResumeStore.getState().updateSection('section-1', { text: 'newer edit' });
    responses.shift()?.(Response.json({
      ...resume,
      revision: 1,
      template: 'modern',
      templateSource: 'public',
      templateVersionId: 'internal-modern-version',
      sections: resume.sections,
    }));

    await firstSave;
    expect(useResumeStore.getState().currentResume).toMatchObject({
      revision: 1,
      template: 'minimal',
      templateSource: 'legacy',
    });
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'newer edit' });

    const secondSave = useResumeStore.getState().save();
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
      expectedRevision: 1,
      binding: { kind: 'legacy', templateSlug: 'minimal' },
      sections: [expect.objectContaining({ content: { text: 'newer edit' } })],
    });
    responses.shift()?.(Response.json({
      ...resume,
      revision: 2,
      template: 'minimal',
      sections: [{ ...resume.sections[0], content: { text: 'newer edit' } }],
    }));
    await expect(secondSave).resolves.toBe(true);
    expect(useResumeStore.getState().pendingTemplateBinding).toBeNull();
  });

  it('does not let a late binding response from Resume A pollute Resume B', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveSave = resolve; })));
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().setTemplateBinding({ kind: 'legacy', templateSlug: 'modern' });
    const savingA = useResumeStore.getState().save();
    useResumeStore.getState().setResume(otherResume);
    useResumeStore.getState().setTemplateBinding({ kind: 'legacy', templateSlug: 'minimal' });
    resolveSave?.(Response.json({ ...resume, revision: 1, template: 'modern' }));

    await savingA;
    expect(useResumeStore.getState().currentResume).toMatchObject({
      id: 'resume-2',
      template: 'minimal',
    });
    expect(useResumeStore.getState().pendingTemplateBinding).toEqual({ kind: 'legacy', templateSlug: 'minimal' });
    expect(useResumeStore.getState().saveError).toBeNull();
  });

  it.each([
    ['failure', new Response('{}', { status: 500 })],
    ['conflict', Response.json({ error: 'revision_conflict', currentRevision: 2 }, { status: 409 })],
  ])('does not let a late A %s pollute resume B save state', async (_label, response) => {
    let resolveSave: ((value: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveSave = resolve; })));
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'A edit' });
    const savingA = useResumeStore.getState().save();
    useResumeStore.getState().setResume(otherResume);
    resolveSave?.(response);

    await savingA;
    expect(useResumeStore.getState().currentResume?.id).toBe('resume-2');
    expect(useResumeStore.getState().saveError).toBeNull();
    expect(useResumeStore.getState().isSaving).toBe(false);
  });

  it('keeps the local draft and reports a revision conflict', async () => {
    useResumeStore.getState().setResume(resume);
    useResumeStore.getState().updateSection('section-1', { text: 'local draft' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: 'revision_conflict', currentRevision: 1 },
      { status: 409 },
    )));

    await expect(useResumeStore.getState().save()).resolves.toBe(false);
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useResumeStore.getState().saveError).toBe('saveConflict');
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'local draft' });
  });

  it('does not confuse editVersion with revision when handling a newer server conflict', async () => {
    useResumeStore.getState().setResume({ ...resume, revision: 5 });
    useResumeStore.getState().updateSection('section-1', { text: 'local revision 5 draft' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
      { error: 'revision_conflict', currentRevision: 6 },
      { status: 409 },
    )));

    await expect(useResumeStore.getState().save()).resolves.toBe(false);
    expect(useResumeStore.getState().currentResume?.revision).toBe(5);
    expect(useResumeStore.getState().editVersion).toBe(1);
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useResumeStore.getState().saveError).toBe('saveConflict');
  });

  it('treats a 409 as stale only after local state has reached the reported server revision', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveSave = resolve;
    })));
    useResumeStore.getState().setResume({ ...resume, revision: 5 });
    useResumeStore.getState().updateSection('section-1', { text: 'pending revision 5 edit' });
    const pendingSave = useResumeStore.getState().save();
    useResumeStore.setState((state) => ({
      currentResume: state.currentResume ? { ...state.currentResume, revision: 6 } : null,
    }));
    resolveSave?.(Response.json(
      { error: 'revision_conflict', currentRevision: 6 },
      { status: 409 },
    ));

    await expect(pendingSave).resolves.toBe(true);
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useResumeStore.getState().saveError).toBeNull();
  });

  it('blocks local mutations while AI editing is active and releases by resume id', () => {
    useResumeStore.getState().setResume(resume);
    expect(useResumeStore.getState().beginAiEditing('resume-1')).toBe(true);
    useResumeStore.getState().updateSection('section-1', { text: 'blocked' });
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: '' });

    useResumeStore.getState().endAiEditing('other-resume');
    expect(useResumeStore.getState().aiEditingResumeId).toBe('resume-1');
    useResumeStore.getState().endAiEditing('resume-1');
    useResumeStore.getState().updateSection('section-1', { text: 'allowed' });
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'allowed' });
  });
});
