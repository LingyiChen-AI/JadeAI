import { create } from 'zustand';
import type { Resume, ResumeSection, SectionContent } from '@/types/resume';
import { AUTOSAVE_DELAY } from '@/lib/constants';
import { useSettingsStore } from '@/stores/settings-store';
import { normalizeSectionContent } from '@/lib/resume/normalize-content';

interface ResumeStore {
  currentResume: Resume | null;
  sections: ResumeSection[];
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  editVersion: number;
  aiEditingResumeId: string | null;
  _saveTimeout: ReturnType<typeof setTimeout> | null;

  setResume: (resume: Resume) => void;
  updateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  replaceSections: (sections: ResumeSection[]) => void;
  updateSectionTitle: (sectionId: string, title: string) => void;
  addSection: (section: ResumeSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (sections: ResumeSection[]) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  setTemplate: (template: string) => void;
  setTitle: (title: string) => void;
  save: () => Promise<boolean>;
  beginAiEditing: (resumeId: string) => boolean;
  endAiEditing: (resumeId: string) => void;
  _scheduleSave: () => void;
  reset: () => void;
}

let saveInFlight: Promise<boolean> | null = null;
let saveInFlightResumeId: string | null = null;

export const useResumeStore = create<ResumeStore>((set, get) => ({
  currentResume: null,
  sections: [],
  isDirty: false,
  isSaving: false,
  saveError: null,
  editVersion: 0,
  aiEditingResumeId: null,
  _saveTimeout: null,

  setResume: (resume) => {
    // Cancel any pending autosave to prevent stale data overwriting server changes (e.g., from AI tool calls)
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    // Normalize section content into the shape the renderers expect. Beyond adding
    // missing item/category ids, this coerces list fields (highlights/technologies/
    // skills) back into arrays so a resume that the AI corrupted (issue #87) can be
    // opened and repaired instead of crashing the editor on render.
    const sections = (resume.sections || []).map((s) => ({
      ...s,
      content: normalizeSectionContent(s.type, s.content) as unknown as typeof s.content,
    }));

    set({
      currentResume: { ...resume, sections },
      sections,
      isDirty: false,
      isSaving: false,
      saveError: null,
      editVersion: 0,
      _saveTimeout: null,
    });
  },

  updateSection: (sectionId, content) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, content: { ...s.content, ...content } as SectionContent } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
        saveError: null,
        editVersion: state.editVersion + 1,
      };
    });
    get()._scheduleSave();
  },

  replaceSections: (sections) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    const normalizedSections = sections.map((section) => ({
      ...section,
      content: normalizeSectionContent(section.type, section.content) as unknown as typeof section.content,
    }));
    set((state) => ({
      sections: normalizedSections,
      currentResume: state.currentResume ? { ...state.currentResume, sections: normalizedSections } : null,
      isDirty: true,
      saveError: null,
      editVersion: state.editVersion + 1,
    }));
    get()._scheduleSave();
  },

  updateSectionTitle: (sectionId, title) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
        saveError: null,
        editVersion: state.editVersion + 1,
      };
    });
    get()._scheduleSave();
  },

  addSection: (section) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => {
      const sections = [...state.sections, section];
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
        saveError: null,
        editVersion: state.editVersion + 1,
      };
    });
    get()._scheduleSave();
  },

  removeSection: (sectionId) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => {
      const sections = state.sections.filter((s) => s.id !== sectionId);
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
        saveError: null,
        editVersion: state.editVersion + 1,
      };
    });
    get()._scheduleSave();
  },

  reorderSections: (sections) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => ({
      sections,
      currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
      isDirty: true,
      saveError: null,
      editVersion: state.editVersion + 1,
    }));
    get()._scheduleSave();
  },

  toggleSectionVisibility: (sectionId) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
        saveError: null,
        editVersion: state.editVersion + 1,
      };
    });
    get()._scheduleSave();
  },

  setTemplate: (template) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, template }
        : null,
      isDirty: true,
      saveError: null,
      editVersion: state.editVersion + 1,
    }));
    get()._scheduleSave();
  },

  setTitle: (title) => {
    if (get().aiEditingResumeId === get().currentResume?.id) return;
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, title }
        : null,
      isDirty: true,
      saveError: null,
      editVersion: state.editVersion + 1,
    }));
    get()._scheduleSave();
  },

  save: () => {
    const { currentResume, sections, isDirty, editVersion } = get();
    if (!currentResume || !isDirty) return Promise.resolve(true);
    if (saveInFlight && saveInFlightResumeId === currentResume.id) return saveInFlight;
    if (saveInFlight) return saveInFlight.then(() => get().save());

    const version = editVersion;
    const resumeId = currentResume.id;
    const expectedRevision = currentResume.revision;
    const payload = {
      title: currentResume.title,
      template: currentResume.template,
      themeConfig: currentResume.themeConfig,
      expectedRevision,
      sections: sections.map((s, i) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        sortOrder: i,
        visible: s.visible,
        content: s.content,
      })),
    };

    set({ isSaving: true, saveError: null });
    saveInFlightResumeId = resumeId;
    saveInFlight = (async () => {
      try {
        const fingerprint = typeof window !== 'undefined'
          ? localStorage.getItem('jade_fingerprint')
          : null;
        const response = await fetch(`/api/resume/${resumeId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          if (response.status === 409) {
            const conflict = await response.json().catch(() => ({}));
            const current = get();
            if (current.currentResume?.id !== resumeId) return false;
            const localRevision = current.currentResume?.revision;
            if (typeof conflict.currentRevision === 'number'
              && typeof localRevision === 'number'
              && localRevision >= conflict.currentRevision
              && localRevision > expectedRevision) {
              if (current.isDirty) current._scheduleSave();
              return true;
            }
            set({ saveError: 'saveConflict' });
            return false;
          }
          throw new Error(`Save failed with status ${response.status}`);
        }

        const savedResume = await response.json();
        const current = get();
        if (current.currentResume?.id !== resumeId) return true;
        if (current.editVersion === version) {
          current.setResume(savedResume);
          set({ isDirty: false });
        } else if (current.isDirty) {
          if (current.currentResume && typeof savedResume.revision === 'number') {
            set({ currentResume: { ...current.currentResume, revision: savedResume.revision } });
          }
          current._scheduleSave();
        }
        return true;
      } catch (error) {
        console.error('Failed to save resume:', error);
        if (get().currentResume?.id === resumeId) set({ saveError: 'saveFailed' });
        return false;
      } finally {
        if (get().currentResume?.id === resumeId) set({ isSaving: false });
        saveInFlight = null;
        saveInFlightResumeId = null;
      }
    })();

    return saveInFlight;
  },

  beginAiEditing: (resumeId) => {
    const state = get();
    if (state.aiEditingResumeId && state.aiEditingResumeId !== resumeId) return false;
    if (state.currentResume?.id !== resumeId) return false;
    set({ aiEditingResumeId: resumeId });
    return true;
  },

  endAiEditing: (resumeId) => {
    if (get().aiEditingResumeId === resumeId) set({ aiEditingResumeId: null });
  },

  _scheduleSave: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const { autoSave, autoSaveInterval, _hydrated } = useSettingsStore.getState();

    // If settings are hydrated and autoSave is off, only mark dirty, don't auto-save
    if (_hydrated && !autoSave) {
      set({ _saveTimeout: null });
      return;
    }

    const delay = _hydrated ? autoSaveInterval : AUTOSAVE_DELAY;
    const timeout = setTimeout(() => {
      set({ _saveTimeout: null });
      get().save();
    }, delay);

    set({ _saveTimeout: timeout });
  },

  reset: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);
    set({
      currentResume: null,
      sections: [],
      isDirty: false,
      isSaving: false,
      saveError: null,
      editVersion: 0,
      aiEditingResumeId: null,
      _saveTimeout: null,
    });
  },
}));
