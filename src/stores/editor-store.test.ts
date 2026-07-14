import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIFieldChange, AIHistoryEntry } from '@/types/editor';
import type { Resume } from '@/types/resume';
import { useResumeStore } from './resume-store';

const historyMocks = vi.hoisted(() => ({
  append: vi.fn(),
  list: vi.fn(),
  getCursor: vi.fn(),
  setCursor: vi.fn(),
  truncateRedo: vi.fn(),
  clear: vi.fn(),
  markStale: vi.fn(),
  isStale: vi.fn(),
}));

vi.mock('@/lib/editor/ai-history', () => ({
  AI_HISTORY_LIMIT: 20,
  aiHistoryRepository: historyMocks,
}));
import { getSectionsFingerprint, useEditorStore } from './editor-store';

function change(overrides: Partial<AIFieldChange> = {}): AIFieldChange {
  return {
    id: 'resume-1:section-1:content.text',
    resumeId: 'resume-1',
    sectionId: 'section-1',
    sectionTitle: 'Summary',
    fieldPath: 'content.text',
    kind: 'field-updated',
    beforeRawValue: 'Before',
    afterRawValue: 'After',
    beforeDisplayValue: 'Before',
    afterDisplayValue: 'After',
    beforeValue: 'Before',
    afterValue: 'After',
    source: 'chat-tool',
    createdAt: 1,
    ...overrides,
  };
}

const resume: Resume = {
  id: 'resume-1', revision: 3, userId: 'user-1', title: 'Resume', template: 'classic',
  themeConfig: {
    primaryColor: '#000000', accentColor: '#ffffff', fontFamily: 'sans', fontSize: 'medium',
    lineSpacing: 1, margin: { top: 1, right: 1, bottom: 1, left: 1 }, sectionSpacing: 1,
  }, isDefault: false, language: 'en',
  sections: [{
    id: 'section-1', resumeId: 'resume-1', type: 'summary', title: 'Summary',
    sortOrder: 0, visible: true, content: { text: 'After' },
    createdAt: new Date(0), updatedAt: new Date(0),
  }],
  createdAt: new Date(0), updatedAt: new Date(0),
};

function historyEntry(id: string, before: string, after: string, overrides: Partial<AIHistoryEntry> = {}): AIHistoryEntry {
  const beforeSections = structuredClone(resume.sections);
  const afterSections = structuredClone(resume.sections);
  beforeSections[0].content = { text: before };
  afterSections[0].content = { text: after };
  return {
    id, resumeId: 'resume-1', userId: 'user-1', beforeSections, afterSections,
    changes: [change({
      id: `${id}:change`, beforeRawValue: before, afterRawValue: after,
      beforeDisplayValue: before, afterDisplayValue: after,
      beforeValue: before, afterValue: after,
    })],
    source: 'chat-tool', createdAt: Number(id.at(-1)) || 1,
    serverRevision: 3, contentFingerprint: 'head-fingerprint', ...overrides,
  };
}

describe('editor store AI changes', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useResumeStore.getState().reset();
    vi.clearAllMocks();
    historyMocks.list.mockResolvedValue([]);
    historyMocks.getCursor.mockResolvedValue(null);
    historyMocks.isStale.mockResolvedValue(false);
    historyMocks.append.mockResolvedValue(undefined);
    historyMocks.setCursor.mockResolvedValue(undefined);
    historyMocks.truncateRedo.mockResolvedValue(undefined);
    historyMocks.clear.mockResolvedValue(undefined);
    historyMocks.markStale.mockResolvedValue(undefined);
  });

  it('keeps head fingerprints stable across server-managed timestamp updates', () => {
    const savedSections = resume.sections.map((section) => ({ ...section, updatedAt: new Date(10) }));

    expect(getSectionsFingerprint(savedSections)).toBe(getSectionsFingerprint(resume.sections));
  });

  it('merges repeated field changes and keeps the first before value', () => {
    const store = useEditorStore.getState();
    store.mergeAiChanges('resume-1', [change()]);
    store.mergeAiChanges('resume-1', [change({ beforeValue: 'After', afterValue: 'Latest' })]);

    expect(useEditorStore.getState().aiChanges[0]).toMatchObject({
      beforeValue: 'Before',
      afterValue: 'Latest',
    });
  });

  it('replaces stale changes when another resume becomes active', () => {
    const store = useEditorStore.getState();
    store.mergeAiChanges('resume-1', [change()]);
    store.mergeAiChanges('resume-2', [change({
      id: 'resume-2:section-2:content.text',
      resumeId: 'resume-2',
      sectionId: 'section-2',
    })]);

    expect(useEditorStore.getState().aiChangeResumeId).toBe('resume-2');
    expect(useEditorStore.getState().aiChanges).toHaveLength(1);
    expect(useEditorStore.getState().aiChanges[0].resumeId).toBe('resume-2');
  });

  it('rejects a mixed-resume incoming batch', () => {
    useEditorStore.getState().mergeAiChanges('resume-1', [
      change(),
      change({ id: 'wrong', resumeId: 'resume-2' }),
    ]);
    expect(useEditorStore.getState().aiChanges).toEqual([]);
  });

  it('clears a field and its enclosing item-added marker', () => {
    useEditorStore.getState().mergeAiChanges('resume-1', [
      change({
        id: 'item',
        fieldPath: 'content.items.item-1',
        kind: 'item-added',
        itemId: 'item-1',
      }),
      change({ id: 'other', fieldPath: 'content.other' }),
    ]);

    useEditorStore.getState().clearAiChangePath('section-1', 'content.items.item-1.company');
    expect(useEditorStore.getState().aiChanges.map((item) => item.id)).toEqual(['other']);
  });

  it('clears section, all changes and reset state idempotently', () => {
    useEditorStore.getState().mergeAiChanges('resume-1', [change()]);
    useEditorStore.getState().clearAiSectionChanges('section-1');
    expect(useEditorStore.getState().aiChanges).toEqual([]);

    useEditorStore.getState().clearAllAiChanges();
    useEditorStore.getState().clearAllAiChanges();
    expect(useEditorStore.getState().aiChangeResumeId).toBeNull();

    useEditorStore.getState().mergeAiChanges('resume-1', [change()]);
    useEditorStore.getState().reset();
    expect(useEditorStore.getState().aiChanges).toEqual([]);
  });

  it('creates a repeatable focus request for the selected AI change', () => {
    const selected = change();
    useEditorStore.getState().requestAiChangeFocus(selected);
    const first = useEditorStore.getState().aiChangeFocusRequest;
    useEditorStore.getState().requestAiChangeFocus(selected);
    const second = useEditorStore.getState().aiChangeFocusRequest;

    expect(first).toMatchObject({
      resumeId: selected.resumeId,
      sectionId: selected.sectionId,
      fieldPath: selected.fieldPath,
      changeId: selected.id,
    });
    expect(second?.requestId).toBe((first?.requestId ?? 0) + 1);
  });
});

describe('editor store AI history', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useResumeStore.getState().reset();
    vi.clearAllMocks();
    historyMocks.list.mockResolvedValue([]);
    historyMocks.getCursor.mockResolvedValue(null);
    historyMocks.isStale.mockResolvedValue(false);
    historyMocks.append.mockResolvedValue(undefined);
    historyMocks.setCursor.mockResolvedValue(undefined);
    historyMocks.truncateRedo.mockResolvedValue(undefined);
    historyMocks.clear.mockResolvedValue(undefined);
    historyMocks.markStale.mockResolvedValue(undefined);
  });

  it('loads the scoped history and exposes backward navigation at a matching head', async () => {
    const entries = [historyEntry('entry-1', 'Before', 'Middle'), historyEntry('entry-2', 'Middle', 'After')];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-2');

    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });

    expect(historyMocks.list).toHaveBeenCalledWith({ resumeId: 'resume-1', userId: 'user-1' });
    expect(useEditorStore.getState()).toMatchObject({
      aiHistoryEntries: entries,
      aiHistoryCursor: 'entry-2',
      aiHistoryStale: false,
      aiHistoryError: null,
    });
    expect(useEditorStore.getState().canUndoAIHistory()).toBe(true);
    expect(useEditorStore.getState().canRedoAIHistory()).toBe(false);
  });

  it.each([
    [{ revision: 2, contentFingerprint: 'head-fingerprint' }, 'revision'],
    [{ revision: 3, contentFingerprint: 'different' }, 'fingerprint'],
  ])('marks a mismatched chain head stale for %s', async (head) => {
    historyMocks.list.mockResolvedValue([historyEntry('entry-1', 'Before', 'After')]);
    historyMocks.getCursor.mockResolvedValue('entry-1');

    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', head);

    expect(historyMocks.markStale).toHaveBeenCalledWith({ resumeId: 'resume-1', userId: 'user-1' });
    expect(useEditorStore.getState().aiHistoryStale).toBe(true);
    expect(useEditorStore.getState().canUndoAIHistory()).toBe(false);
  });

  it('moves backward and forward through snapshots, marks the resume dirty, and records normal undo snapshots', async () => {
    const entries = [historyEntry('entry-1', 'Before', 'Middle'), historyEntry('entry-2', 'Middle', 'After')];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-2');
    useResumeStore.getState().setResume(resume);
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });

    await expect(useEditorStore.getState().undoAIHistory()).resolves.toMatchObject({ restored: 1 });
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'Middle' });
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().aiHistoryCursor).toBe('entry-1');
    expect(historyMocks.setCursor).toHaveBeenLastCalledWith(
      { resumeId: 'resume-1', userId: 'user-1' }, 'entry-1',
    );

    await expect(useEditorStore.getState().redoAIHistory()).resolves.toMatchObject({ restored: 1 });
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'After' });
    expect(useEditorStore.getState().aiHistoryCursor).toBe('entry-2');
    expect(useEditorStore.getState().undoStack).toHaveLength(2);
  });

  it('does not change the document or memory cursor when cursor persistence fails', async () => {
    const entries = [historyEntry('entry-1', 'Before', 'After')];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-1');
    useResumeStore.getState().setResume(resume);
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    historyMocks.setCursor.mockRejectedValueOnce(new Error('cursor write failed'));

    await expect(useEditorStore.getState().undoAIHistory()).resolves.toMatchObject({ restored: 0 });
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'After' });
    expect(useResumeStore.getState().isDirty).toBe(false);
    expect(useEditorStore.getState().aiHistoryCursor).toBe('entry-1');
    expect(useEditorStore.getState().aiHistoryError).toBe('cursor write failed');
  });

  it('truncates redo before appending a new AI version', async () => {
    const entries = [historyEntry('entry-1', 'Before', 'Middle'), historyEntry('entry-2', 'Middle', 'After')];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-1');
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    const branch = historyEntry('entry-3', 'Middle', 'Branch', { contentFingerprint: 'branch' });

    await useEditorStore.getState().appendAIHistory(branch);

    expect(historyMocks.truncateRedo).toHaveBeenCalledWith(
      { resumeId: 'resume-1', userId: 'user-1' }, 'entry-1',
    );
    expect(historyMocks.append).toHaveBeenCalledWith(branch);
    expect(useEditorStore.getState().aiHistoryEntries.map((entry) => entry.id)).toEqual(['entry-1', 'entry-3']);
    expect(useEditorStore.getState().aiHistoryCursor).toBe('entry-3');
  });

  it('keeps the in-memory scope aligned with the repository 20-entry limit', async () => {
    const entries = Array.from({ length: 20 }, (_, index) => historyEntry(
      `entry-${String(index + 1).padStart(2, '0')}`, `Before ${index}`, `After ${index}`,
    ));
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue(entries.at(-1)?.id ?? null);
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });

    await useEditorStore.getState().appendAIHistory(historyEntry('entry-21', 'Before 21', 'After 21'));

    expect(useEditorStore.getState().aiHistoryEntries).toHaveLength(20);
    expect(useEditorStore.getState().aiHistoryEntries[0].id).toBe('entry-02');
  });

  it('restores one current-page AI change through the resume store and normal undo stack', () => {
    useResumeStore.getState().setResume(resume);
    useEditorStore.getState().mergeAiChanges('resume-1', [change()]);

    const result = useEditorStore.getState().restoreAiChanges({ scope: 'change', changeId: change().id });

    expect(result.restored).toBe(1);
    expect(useResumeStore.getState().sections[0].content).toEqual({ text: 'Before' });
    expect(useResumeStore.getState().isDirty).toBe(true);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().aiChanges).toEqual([]);
  });

  it('ignores a late history load after its scope is closed', async () => {
    let resolveList: ((entries: AIHistoryEntry[]) => void) | undefined;
    historyMocks.list.mockImplementation(() => new Promise<AIHistoryEntry[]>((resolve) => { resolveList = resolve; }));
    const loading = useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    useEditorStore.getState().closeAIHistoryScope('resume-1', 'user-1');
    resolveList?.([historyEntry('entry-1', 'Before', 'After')]);
    await loading;

    expect(useEditorStore.getState().aiHistoryEntries).toEqual([]);
    expect(useEditorStore.getState().aiHistoryScope).toBeNull();
  });

  it('does not let a late append failure write an error into a newer scope', async () => {
    let rejectAppend: ((error: Error) => void) | undefined;
    historyMocks.append.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectAppend = reject; }));
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'unused',
    });
    const appending = useEditorStore.getState().appendAIHistory(historyEntry('entry-1', 'Before', 'After'));
    await useEditorStore.getState().loadAIHistory('resume-2', 'user-2', {
      revision: 1, contentFingerprint: 'unused',
    });
    rejectAppend?.(new Error('old scope append failed'));
    await appending;

    expect(useEditorStore.getState()).toMatchObject({
      aiHistoryScope: { resumeId: 'resume-2', userId: 'user-2' },
      aiHistoryEntries: [], aiHistoryError: null,
    });
  });

  it('does not let a late clear erase a newer scope from memory', async () => {
    let resolveClear: (() => void) | undefined;
    historyMocks.clear.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveClear = resolve; }));
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'unused',
    });
    const clearing = useEditorStore.getState().clearAIHistory();
    const nextEntry = historyEntry('entry-b', 'B before', 'B after', {
      resumeId: 'resume-2', userId: 'user-2', serverRevision: 1, contentFingerprint: 'b-head',
    });
    historyMocks.list.mockResolvedValueOnce([nextEntry]);
    historyMocks.getCursor.mockResolvedValueOnce('entry-b');
    await useEditorStore.getState().loadAIHistory('resume-2', 'user-2', {
      revision: 1, contentFingerprint: 'b-head',
    });
    resolveClear?.();
    await clearing;

    expect(useEditorStore.getState()).toMatchObject({
      aiHistoryScope: { resumeId: 'resume-2', userId: 'user-2' },
      aiHistoryEntries: [nextEntry], aiHistoryCursor: 'entry-b',
    });
  });

  it('does not let a late history apply change a newer scope or resume', async () => {
    const entries = [historyEntry('entry-1', 'Before', 'After')];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-1');
    useResumeStore.getState().setResume(resume);
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    let resolveCursor: (() => void) | undefined;
    historyMocks.setCursor.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveCursor = resolve; }));
    const applying = useEditorStore.getState().undoAIHistory();
    const nextResume = { ...resume, id: 'resume-2', userId: 'user-2', title: 'Resume B' };
    useResumeStore.getState().setResume(nextResume);
    const nextEntry = historyEntry('entry-b', 'B before', 'B after', {
      resumeId: 'resume-2', userId: 'user-2', serverRevision: 1, contentFingerprint: 'b-head',
    });
    historyMocks.list.mockResolvedValueOnce([nextEntry]);
    historyMocks.getCursor.mockResolvedValueOnce('entry-b');
    await useEditorStore.getState().loadAIHistory('resume-2', 'user-2', {
      revision: 1, contentFingerprint: 'b-head',
    });
    resolveCursor?.();
    await applying;

    expect(useResumeStore.getState().currentResume?.id).toBe('resume-2');
    expect(useResumeStore.getState().isDirty).toBe(false);
    expect(useEditorStore.getState()).toMatchObject({
      aiHistoryScope: { resumeId: 'resume-2', userId: 'user-2' }, aiHistoryCursor: 'entry-b',
    });
  });

  it('does not compensate an old cursor over a newer generation cursor in the same scope', async () => {
    const entries = [
      historyEntry('entry-1', 'Before', 'Middle'),
      historyEntry('entry-2', 'Middle', 'After'),
    ];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-2');
    useResumeStore.getState().setResume(resume);
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    let resolveOldCursor: (() => void) | undefined;
    historyMocks.setCursor.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveOldCursor = resolve; }));
    const oldUndo = useEditorStore.getState().undoAIHistory();

    historyMocks.getCursor.mockResolvedValueOnce('entry-1');
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    resolveOldCursor?.();
    await oldUndo;

    expect(historyMocks.setCursor).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().aiHistoryCursor).toBe('entry-1');
    expect(useEditorStore.getState().aiHistoryStale).toBe(true);
    expect(useEditorStore.getState().aiHistoryError).toContain('uncertain');
  });

  it('does not let a rejected old-scope compensation mark a newly loaded scope stale', async () => {
    const entries = [historyEntry('entry-1', 'Before', 'After')];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-1');
    useResumeStore.getState().setResume(resume);
    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 3, contentFingerprint: 'head-fingerprint',
    });
    let resolveInitial: (() => void) | undefined;
    let rejectCompensation: ((error: Error) => void) | undefined;
    let cursorWrites = 0;
    historyMocks.setCursor.mockImplementation(() => {
      cursorWrites += 1;
      if (cursorWrites === 1) return new Promise<void>((resolve) => { resolveInitial = resolve; });
      return new Promise<void>((_resolve, reject) => { rejectCompensation = reject; });
    });
    const oldUndo = useEditorStore.getState().undoAIHistory();
    useResumeStore.getState().updateSection('section-1', { text: 'concurrent edit' });
    resolveInitial?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(rejectCompensation).toBeDefined();

    historyMocks.list.mockResolvedValueOnce([]);
    historyMocks.getCursor.mockResolvedValueOnce(null);
    await useEditorStore.getState().loadAIHistory('resume-2', 'user-2', {
      revision: 1, contentFingerprint: 'unused',
    });
    rejectCompensation?.(new Error('old compensation failed'));
    await oldUndo;

    expect(useEditorStore.getState()).toMatchObject({
      aiHistoryScope: { resumeId: 'resume-2', userId: 'user-2' },
      aiHistoryStale: false, aiHistoryError: null,
    });
  });

  it('validates a refreshed head against the persisted cursor and allows redo after autosave revision advances', async () => {
    const entries = [
      historyEntry('entry-1', 'Before', 'Middle', { contentFingerprint: 'middle-head', serverRevision: 3 }),
      historyEntry('entry-2', 'Middle', 'After', { contentFingerprint: 'after-head', serverRevision: 3 }),
    ];
    historyMocks.list.mockResolvedValue(entries);
    historyMocks.getCursor.mockResolvedValue('entry-1');

    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 4, contentFingerprint: 'middle-head',
    });

    expect(useEditorStore.getState().aiHistoryStale).toBe(false);
    expect(useEditorStore.getState().canRedoAIHistory()).toBe(true);
  });

  it('uses the first before snapshot when a refreshed cursor is before all entries', async () => {
    const first = historyEntry('entry-1', 'Before', 'After', { serverRevision: 3 });
    historyMocks.list.mockResolvedValue([first]);
    historyMocks.getCursor.mockResolvedValue(null);

    await useEditorStore.getState().loadAIHistory('resume-1', 'user-1', {
      revision: 4, contentFingerprint: getSectionsFingerprint(first.beforeSections),
    });

    expect(useEditorStore.getState().aiHistoryStale).toBe(false);
    expect(useEditorStore.getState().canRedoAIHistory()).toBe(true);
  });
});
