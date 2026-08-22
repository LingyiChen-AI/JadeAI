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
  _saveTimeout: ReturnType<typeof setTimeout> | null;
  /** 正在飞的那次 PUT。用来串行化，避免两次保存乱序落库 */
  _savePromise: Promise<void> | null;

  setResume: (resume: Resume) => void;
  updateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  updateSectionTitle: (sectionId: string, title: string) => void;
  addSection: (section: ResumeSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (sections: ResumeSection[]) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  setTemplate: (template: string) => void;
  setTitle: (title: string) => void;
  save: () => Promise<void>;
  flushSave: () => Promise<void>;
  _scheduleSave: () => void;
  reset: () => void;
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  currentResume: null,
  sections: [],
  isDirty: false,
  isSaving: false,
  _saveTimeout: null,
  _savePromise: null,

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
      _saveTimeout: null,
    });
  },

  updateSection: (sectionId, content) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, content: { ...s.content, ...content } as SectionContent } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  updateSectionTitle: (sectionId, title) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  addSection: (section) => {
    set((state) => {
      const sections = [...state.sections, section];
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  removeSection: (sectionId) => {
    set((state) => {
      const sections = state.sections.filter((s) => s.id !== sectionId);
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  reorderSections: (sections) => {
    set((state) => ({
      sections,
      currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  toggleSectionVisibility: (sectionId) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  setTemplate: (template) => {
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, template }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  setTitle: (title) => {
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, title }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  save: async () => {
    // 已经有一次在飞就先等它落地。两次 PUT 并行的话，先发的那次可能后到，
    // 于是旧内容盖掉新内容——防抖保存和 flushSave 撞在一起时正好会这样。
    const inFlight = get()._savePromise;
    if (inFlight) await inFlight;

    const { currentResume, sections, isDirty } = get();
    if (!currentResume || !isDirty) return;

    const request = (async () => {
      const fingerprint = typeof window !== 'undefined'
        ? localStorage.getItem('jade_fingerprint')
        : null;

      await fetch(`/api/resume/${currentResume.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({
          title: currentResume.title,
          template: currentResume.template,
          themeConfig: currentResume.themeConfig,
          sections: sections.map((s, i) => ({
            id: s.id,
            type: s.type,
            title: s.title,
            sortOrder: i,
            visible: s.visible,
            content: s.content,
          })),
        }),
      });
    })();

    set({ isSaving: true, _savePromise: request });
    try {
      await request;
      // 只有这期间没再改过才清 dirty。每个 setter 都会换掉 sections /
      // currentResume 的引用，比引用就够了。无条件清的话，保存期间敲的字
      // 会被当成「已保存」——下次 flushSave 直接跳过，AI 还是读到旧的。
      const after = get();
      if (after.sections === sections && after.currentResume === currentResume) {
        set({ isDirty: false });
      }
    } catch (error) {
      console.error('Failed to save resume:', error);
    } finally {
      set({ isSaving: false, _savePromise: null });
    }
  },

  /**
   * 立刻把未保存的改动写回服务端，等写完再返回。
   *
   * 所有 AI 功能（对话、JD 匹配、求职信、语法检查、翻译、模拟面试）在服务端都是
   * 拿 resumeId 回库里读简历的，客户端不上传正文。所以只要防抖保存还没触发，
   * AI 看到的就是上一版——间隔最长能调到 5 秒，关掉自动保存更是永远不会写。
   * 这就是 issue #96：手动改完立刻问 AI，AI 在旧简历上改。
   *
   * 不看 autoSave 开关：用户主动把简历交给 AI 处理，本身就意味着要用当前这一版。
   */
  flushSave: async () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      set({ _saveTimeout: null });
    }
    await get().save();
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
      _saveTimeout: null,
      _savePromise: null,
    });
  },
}));
