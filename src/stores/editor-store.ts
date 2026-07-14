import { create } from 'zustand';
import type { ResumeSection } from '@/types/resume';
import type { AIChangeFocusRequest, AIFieldChange, AIHistoryEntry, ResumeSnapshot } from '@/types/editor';
import { MAX_UNDO_STACK } from '@/lib/constants';
import { getResumeSectionsFingerprint, mergeAIChanges } from '@/lib/resume/diff-ai-changes';
import { applyAIChanges, type ApplyAIChangesOptions, type RestoreResult } from '@/lib/resume/apply-ai-change';
import { AI_HISTORY_LIMIT, aiHistoryRepository, type AIHistoryScope } from '@/lib/editor/ai-history';
import { useResumeStore } from '@/stores/resume-store';

let aiHistoryGeneration = 0;

/** Stable synchronous fingerprint shared by history producers and page head checks. */
export function getSectionsFingerprint(sections: ResumeSection[]): string {
  return getResumeSectionsFingerprint(sections);
}

function emptyRestore(sections = useResumeStore.getState().sections): RestoreResult {
  return { sections, restored: 0, skipped: [], conflicts: [] };
}

function isCurrentHistoryOperation(generation: number, scope: AIHistoryScope): boolean {
  const currentScope = useEditorStore.getState().aiHistoryScope;
  return generation === aiHistoryGeneration
    && currentScope?.resumeId === scope.resumeId
    && currentScope.userId === scope.userId;
}

function isCurrentHistoryScope(scope: AIHistoryScope): boolean {
  const currentScope = useEditorStore.getState().aiHistoryScope;
  return currentScope?.resumeId === scope.resumeId && currentScope.userId === scope.userId;
}

interface EditorStore {
  selectedSectionId: string | null;
  selectedItemId: string | null;
  isDragging: boolean;
  showAiChat: boolean;
  showThemeEditor: boolean;
  zoom: number;
  undoStack: ResumeSnapshot[];
  redoStack: ResumeSnapshot[];
  pendingAiMessage: string | null;
  mobileActiveTab: "edit" | "preview";
  aiChangeResumeId: string | null;
  aiChanges: AIFieldChange[];
  aiChangeFocusRequest: AIChangeFocusRequest | null;
  aiHistoryScope: AIHistoryScope | null;
  aiHistoryEntries: AIHistoryEntry[];
  aiHistoryCursor: string | null;
  aiHistoryStale: boolean;
  aiHistoryError: string | null;

  selectSection: (id: string | null) => void;
  selectItem: (id: string | null) => void;
  setDragging: (isDragging: boolean) => void;
  toggleAiChat: () => void;
  setShowAiChat: (show: boolean) => void;
  toggleThemeEditor: () => void;
  setZoom: (zoom: number) => void;
  pushSnapshot: (sections: ResumeSection[]) => void;
  undo: () => ResumeSnapshot | null;
  redo: () => ResumeSnapshot | null;
  setPendingAiMessage: (message: string | null) => void;
  setMobileActiveTab: (tab: "edit" | "preview") => void;
  mergeAiChanges: (resumeId: string, changes: AIFieldChange[]) => void;
  clearAiChangePath: (sectionId: string, fieldPath: string) => void;
  clearAiSectionChanges: (sectionId: string) => void;
  clearAllAiChanges: () => void;
  requestAiChangeFocus: (change: AIFieldChange) => void;
  loadAIHistory: (resumeId: string, userId: string, head: { revision: number; contentFingerprint: string }) => Promise<void>;
  appendAIHistory: (entry: AIHistoryEntry) => Promise<void>;
  canUndoAIHistory: () => boolean;
  canRedoAIHistory: () => boolean;
  undoAIHistory: () => Promise<RestoreResult>;
  redoAIHistory: () => Promise<RestoreResult>;
  applyAIHistoryEntry: (entryId: string, direction?: 'undo' | 'redo') => Promise<RestoreResult>;
  restoreAiChanges: (options: Extract<ApplyAIChangesOptions, { scope: 'change' | 'section' }>) => RestoreResult;
  clearAIHistory: () => Promise<void>;
  closeAIHistoryScope: (resumeId?: string, userId?: string) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  selectedSectionId: null,
  selectedItemId: null,
  isDragging: false,
  showAiChat: false,
  showThemeEditor: false,
  zoom: 100,
  undoStack: [],
  redoStack: [],
  pendingAiMessage: null,
  mobileActiveTab: "edit",
  aiChangeResumeId: null,
  aiChanges: [],
  aiChangeFocusRequest: null,
  aiHistoryScope: null,
  aiHistoryEntries: [],
  aiHistoryCursor: null,
  aiHistoryStale: false,
  aiHistoryError: null,

  selectSection: (id) => set({ selectedSectionId: id, selectedItemId: null }),
  selectItem: (id) => set({ selectedItemId: id }),
  setDragging: (isDragging) => set({ isDragging }),
  toggleAiChat: () => set((s) => ({ showAiChat: !s.showAiChat })),
  setShowAiChat: (show) => set({ showAiChat: show }),
  toggleThemeEditor: () => set((s) => ({ showThemeEditor: !s.showThemeEditor })),
  setZoom: (zoom) => set({ zoom }),

  pushSnapshot: (sections) => {
    set((state) => ({
      undoStack: [
        ...state.undoStack.slice(-MAX_UNDO_STACK + 1),
        { sections, timestamp: Date.now() },
      ],
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;
    const snapshot = undoStack[undoStack.length - 1];
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, snapshot],
    }));
    return snapshot;
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const snapshot = redoStack[redoStack.length - 1];
    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, snapshot],
    }));
    return snapshot;
  },

  setPendingAiMessage: (message) => set({ pendingAiMessage: message }),
  setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),
  mergeAiChanges: (resumeId, changes) => {
    if (changes.length === 0 || changes.some((change) => change.resumeId !== resumeId)) return;
    set((state) => ({
      aiChangeResumeId: resumeId,
      aiChanges: state.aiChangeResumeId && state.aiChangeResumeId !== resumeId
        ? changes
        : mergeAIChanges(state.aiChanges, changes),
    }));
  },
  clearAiChangePath: (sectionId, fieldPath) => set((state) => ({
    aiChanges: state.aiChanges.filter((change) => {
      if (change.sectionId !== sectionId) return true;
      if (change.fieldPath === fieldPath || change.fieldPath.startsWith(`${fieldPath}.`)) return false;
      return !(change.kind === 'item-added' && fieldPath.startsWith(`${change.fieldPath}.`));
    }),
  })),
  clearAiSectionChanges: (sectionId) => set((state) => ({
    aiChanges: state.aiChanges.filter((change) => change.sectionId !== sectionId),
  })),
  clearAllAiChanges: () => set({ aiChangeResumeId: null, aiChanges: [] }),
  requestAiChangeFocus: (change) => set((state) => ({
    aiChangeFocusRequest: {
      requestId: (state.aiChangeFocusRequest?.requestId ?? 0) + 1,
      resumeId: change.resumeId,
      sectionId: change.sectionId,
      fieldPath: change.fieldPath,
      changeId: change.id,
    },
  })),

  loadAIHistory: async (resumeId, userId, head) => {
    const generation = ++aiHistoryGeneration;
    const scope = { resumeId, userId };
    set({ aiHistoryScope: scope, aiHistoryEntries: [], aiHistoryCursor: null, aiHistoryStale: false, aiHistoryError: null });
    try {
      const [entries, cursor, repositoryStale] = await Promise.all([
        aiHistoryRepository.list(scope),
        aiHistoryRepository.getCursor(scope),
        aiHistoryRepository.isStale(scope),
      ]);
      const currentScope = get().aiHistoryScope;
      if (generation !== aiHistoryGeneration || currentScope?.resumeId !== resumeId || currentScope.userId !== userId) return;
      const cursorEntry = cursor ? entries.find((entry) => entry.id === cursor) : null;
      const invalidCursor = cursor !== null && !cursorEntry;
      const baseline = cursorEntry ?? entries[0];
      const expectedFingerprint = cursorEntry?.contentFingerprint
        ?? (entries[0] ? getSectionsFingerprint(entries[0].beforeSections) : null);
      const stale = repositoryStale || invalidCursor || !!baseline && (
        head.revision < baseline.serverRevision || head.contentFingerprint !== expectedFingerprint
      );
      set({ aiHistoryEntries: entries, aiHistoryCursor: cursor, aiHistoryStale: stale, aiHistoryError: null });
      if (stale && !repositoryStale) await aiHistoryRepository.markStale(scope);
    } catch (error) {
      if (generation !== aiHistoryGeneration) return;
      set({ aiHistoryError: error instanceof Error ? error.message : 'AI history failed to load' });
    }
  },

  appendAIHistory: async (entry) => {
    const scope = get().aiHistoryScope;
    if (!scope || scope.resumeId !== entry.resumeId || scope.userId !== entry.userId) return;
    const generation = aiHistoryGeneration;
    try {
      const cursor = get().aiHistoryCursor;
      const entries = get().aiHistoryEntries;
      if (cursor) {
        const index = entries.findIndex((item) => item.id === cursor);
        if (index >= 0 && index < entries.length - 1) {
          await aiHistoryRepository.truncateRedo(scope, cursor);
          if (!isCurrentHistoryOperation(generation, scope)) return;
          set({ aiHistoryEntries: entries.slice(0, index + 1) });
        }
      } else if (entries.length > 0) {
        await aiHistoryRepository.clear(scope);
        if (!isCurrentHistoryOperation(generation, scope)) return;
        set({ aiHistoryEntries: [] });
      }
      await aiHistoryRepository.append(entry);
      if (!isCurrentHistoryOperation(generation, scope)) return;
      set((state) => ({
        aiHistoryEntries: [...state.aiHistoryEntries.filter((item) => item.id !== entry.id), entry]
          .slice(-AI_HISTORY_LIMIT),
        aiHistoryCursor: entry.id,
        aiHistoryStale: false,
        aiHistoryError: null,
      }));
    } catch (error) {
      if (isCurrentHistoryOperation(generation, scope)) {
        set({ aiHistoryError: error instanceof Error ? error.message : 'AI history failed to save' });
      }
    }
  },

  canUndoAIHistory: () => {
    const state = get();
    return !state.aiHistoryStale && !!state.aiHistoryCursor
      && state.aiHistoryEntries.some((entry) => entry.id === state.aiHistoryCursor);
  },

  canRedoAIHistory: () => {
    const state = get();
    if (state.aiHistoryStale || state.aiHistoryEntries.length === 0) return false;
    const index = state.aiHistoryCursor
      ? state.aiHistoryEntries.findIndex((entry) => entry.id === state.aiHistoryCursor)
      : -1;
    return index < state.aiHistoryEntries.length - 1;
  },

  applyAIHistoryEntry: async (entryId, direction = 'undo') => {
    const state = get();
    if (state.aiHistoryStale) return emptyRestore();
    const index = state.aiHistoryEntries.findIndex((entry) => entry.id === entryId);
    const entry = index >= 0 ? state.aiHistoryEntries[index] : null;
    if (!entry || !state.aiHistoryScope) return emptyRestore();
    const generation = aiHistoryGeneration;
    const resumeState = useResumeStore.getState();
    if (resumeState.currentResume?.id !== state.aiHistoryScope.resumeId) return emptyRestore();
    const current = resumeState.sections;
    const result = direction === 'undo'
      ? applyAIChanges(current, entry.changes, {
        scope: 'snapshot', beforeSections: entry.beforeSections, afterSections: entry.afterSections,
      })
      : applyAIChanges(current, entry.changes, {
        scope: 'snapshot', beforeSections: entry.afterSections, afterSections: entry.beforeSections,
      });
    if (result.restored === 0 || result.conflicts.length > 0) return result;
    const nextCursor = direction === 'undo' ? state.aiHistoryEntries[index - 1]?.id ?? null : entry.id;
    try {
      await aiHistoryRepository.setCursor(state.aiHistoryScope, nextCursor);
      const latestResume = useResumeStore.getState();
      const currentScope = isCurrentHistoryScope(state.aiHistoryScope);
      const operationStillCurrent = isCurrentHistoryOperation(generation, state.aiHistoryScope);
      const canCompensate = operationStillCurrent
        && get().aiHistoryCursor === state.aiHistoryCursor;
      if (!operationStillCurrent
        || latestResume.currentResume?.id !== state.aiHistoryScope.resumeId
        || latestResume.sections !== current) {
        if (canCompensate) {
          try {
            await aiHistoryRepository.setCursor(state.aiHistoryScope, state.aiHistoryCursor);
          } catch (compensationError) {
            if (isCurrentHistoryOperation(generation, state.aiHistoryScope)) {
              set({
                aiHistoryStale: true,
                aiHistoryError: compensationError instanceof Error
                  ? `AI history cursor uncertain: ${compensationError.message}`
                  : 'AI history cursor uncertain',
              });
            }
          }
        } else if (currentScope) {
          set({ aiHistoryStale: true, aiHistoryError: 'AI history cursor uncertain' });
        }
        return emptyRestore(latestResume.sections);
      }
      get().pushSnapshot(current);
      latestResume.replaceSections(result.sections);
      set({ aiHistoryCursor: nextCursor, aiHistoryError: null });
      return result;
    } catch (error) {
      if (isCurrentHistoryOperation(generation, state.aiHistoryScope)) {
        set({ aiHistoryError: error instanceof Error ? error.message : 'AI history cursor failed to save' });
      }
      return emptyRestore();
    }
  },

  undoAIHistory: async () => {
    const state = get();
    if (!state.canUndoAIHistory()) return emptyRestore();
    return state.applyAIHistoryEntry(state.aiHistoryCursor as string, 'undo');
  },

  redoAIHistory: async () => {
    const state = get();
    if (!state.canRedoAIHistory()) return emptyRestore();
    const index = state.aiHistoryCursor
      ? state.aiHistoryEntries.findIndex((entry) => entry.id === state.aiHistoryCursor) + 1
      : 0;
    return state.applyAIHistoryEntry(state.aiHistoryEntries[index].id, 'redo');
  },

  restoreAiChanges: (options) => {
    const state = get();
    const current = useResumeStore.getState().sections;
    const result = applyAIChanges(current, state.aiChanges, options);
    if (result.restored === 0) return result;
    get().pushSnapshot(current);
    useResumeStore.getState().replaceSections(result.sections);
    const unresolved = new Set([...result.skipped, ...result.conflicts].map((item) => item.id));
    const selected = state.aiChanges.filter((item) => (
      options.scope === 'section' ? item.sectionId === options.sectionId : item.id === options.changeId
    ));
    const restoredIds = new Set(selected.filter((item) => !unresolved.has(item.id)).map((item) => item.id));
    set({ aiChanges: state.aiChanges.filter((item) => !restoredIds.has(item.id)) });
    return result;
  },

  clearAIHistory: async () => {
    const scope = get().aiHistoryScope;
    if (!scope) return;
    const generation = aiHistoryGeneration;
    try {
      await aiHistoryRepository.clear(scope);
      if (!isCurrentHistoryOperation(generation, scope)) return;
      set({ aiHistoryEntries: [], aiHistoryCursor: null, aiHistoryStale: false, aiHistoryError: null });
    } catch (error) {
      if (isCurrentHistoryOperation(generation, scope)) {
        set({ aiHistoryError: error instanceof Error ? error.message : 'AI history failed to clear' });
      }
    }
  },

  closeAIHistoryScope: (resumeId, userId) => {
    const scope = get().aiHistoryScope;
    if (scope && ((resumeId !== undefined && scope.resumeId !== resumeId)
      || (userId !== undefined && scope.userId !== userId))) return;
    aiHistoryGeneration += 1;
    set({ aiHistoryScope: null, aiHistoryEntries: [], aiHistoryCursor: null, aiHistoryStale: false, aiHistoryError: null });
  },

  reset: () =>
    set(() => {
      aiHistoryGeneration += 1;
      return {
      selectedSectionId: null,
      selectedItemId: null,
      isDragging: false,
      showAiChat: false,
      showThemeEditor: false,
      zoom: 100,
      undoStack: [],
      redoStack: [],
      pendingAiMessage: null,
      mobileActiveTab: "edit",
      aiChangeResumeId: null,
      aiChanges: [],
      aiChangeFocusRequest: null,
      aiHistoryScope: null,
      aiHistoryEntries: [],
      aiHistoryCursor: null,
      aiHistoryStale: false,
      aiHistoryError: null,
      };
    }),
}));
