import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useResumeStore } from './resume-store';
import { useSettingsStore } from './settings-store';
import { createPdfSnapshot } from '@/lib/pdf/snapshot';
import { pdfSnapshotRequestSchema } from '@/lib/pdf/snapshot-schema';
import { pdfResumeFixture } from '@/lib/pdf/resume-pdf.fixtures';
import type { Resume } from '@/types/resume';

const RESUME = {
  id: 'r1',
  title: '原标题',
  template: 'modern',
  themeConfig: {},
  sections: [],
} as never;

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe('resume-store 保存', () => {
  beforeEach(() => {
    useResumeStore.getState().reset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    useResumeStore.getState().reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps layout edits exportable after loading a serialized legacy theme', () => {
    const resume = pdfResumeFixture();
    delete (resume.sections[0].content as Record<string, unknown>).avatar;
    useResumeStore.getState().setResume({ ...resume, themeConfig: '{}' } as unknown as Resume);
    const current = useResumeStore.getState().currentResume!;
    expect(current.themeConfig).toEqual({});
    // Reproduce the theme editor's spread-based update after reading the record.
    const edited = { ...current, themeConfig: { ...current.themeConfig, lineSpacing: 1.6, sectionSpacing: 18 } };
    expect(pdfSnapshotRequestSchema.safeParse({
      format: 'pdf', layout: 'a4', resume: createPdfSnapshot(edited),
    }).success).toBe(true);
    expect(resume.themeConfig).toBeNull();
  });

  describe('flushSave', () => {
    it('不等防抖，立刻把改动写回', async () => {
      vi.useFakeTimers();
      useResumeStore.getState().setResume(RESUME);
      useResumeStore.getState().setTitle('新标题');
      expect(fetch).not.toHaveBeenCalled(); // 防抖还没到

      await useResumeStore.getState().flushSave();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(bodyOf((fetch as never as ReturnType<typeof vi.fn>).mock.calls[0]).title).toBe('新标题');
      expect(useResumeStore.getState().isDirty).toBe(false);
    });

    it('把待触发的防抖取消掉，不留下第二次重复保存', async () => {
      vi.useFakeTimers();
      useResumeStore.getState().setResume(RESUME);
      useResumeStore.getState().setTitle('新标题');

      await useResumeStore.getState().flushSave();
      vi.runAllTimers();
      await Promise.resolve();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(useResumeStore.getState()._saveTimeout).toBeNull();
    });

    it('关掉自动保存也照样写回——AI 读的是库里那份，不写就永远看不到改动', async () => {
      useSettingsStore.setState({ autoSave: false, _hydrated: true });
      try {
        useResumeStore.getState().setResume(RESUME);
        useResumeStore.getState().setTitle('新标题');
        expect(useResumeStore.getState()._saveTimeout).toBeNull(); // 自动保存确实没排期

        await useResumeStore.getState().flushSave();

        expect(fetch).toHaveBeenCalledTimes(1);
      } finally {
        useSettingsStore.setState({ autoSave: true, _hydrated: false });
      }
    });

    it('没有未保存的改动就不发请求', async () => {
      useResumeStore.getState().setResume(RESUME);
      await useResumeStore.getState().flushSave();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('没打开简历时是空操作', async () => {
      await expect(useResumeStore.getState().flushSave()).resolves.toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('save 串行化', () => {
    it('keeps failed changes dirty and rejects manual saves on HTTP errors', async () => {
      useSettingsStore.setState({ autoSave: false, _hydrated: true });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500,
          json: async () => ({ error: 'STAGE2_SAVE_FAILURE' }) }));
        useResumeStore.getState().setResume(RESUME);
        useResumeStore.getState().setTitle('Unsaved');
        await expect(useResumeStore.getState().flushSave()).rejects.toThrow('STAGE2_SAVE_FAILURE');
        expect(useResumeStore.getState()).toMatchObject({ isDirty: true, isSaving: false, _savePromise: null });
        vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
        await useResumeStore.getState().flushSave();
        expect(useResumeStore.getState().isDirty).toBe(false);
      } finally { log.mockRestore(); useSettingsStore.setState({ autoSave: true, _hydrated: false }); }
    });

    it('does not silently swallow network failures during export saves', async () => {
      useSettingsStore.setState({ autoSave: false, _hydrated: true });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable'));
        useResumeStore.getState().setResume(RESUME);
        useResumeStore.getState().setTitle('Unsaved');
        await expect(useResumeStore.getState().flushSave()).rejects.toThrow('Network unavailable');
        expect(useResumeStore.getState().isDirty).toBe(true);
      } finally { log.mockRestore(); useSettingsStore.setState({ autoSave: true, _hydrated: false }); }
    });

    it('handles autosave rejection without an unhandled promise and preserves dirty state', async () => {
      vi.useFakeTimers();
      useSettingsStore.setState({ autoSave: true, _hydrated: true, autoSaveInterval: 100 });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
        useResumeStore.getState().setResume(RESUME);
        useResumeStore.getState().setTitle('Unsaved');
        await vi.advanceTimersByTimeAsync(100);
        expect(useResumeStore.getState()).toMatchObject({ isDirty: true, isSaving: false });
      } finally { log.mockRestore(); useSettingsStore.setState({ autoSave: true, _hydrated: false }); }
    });

    it('前一次还在飞的时候，后一次要等它落地——否则旧内容可能后到、盖掉新的', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = () => r();
      });
      const fetchMock = vi.fn().mockImplementation(async () => {
        await gate;
        return { ok: true };
      });
      vi.stubGlobal('fetch', fetchMock);

      useResumeStore.getState().setResume(RESUME);
      useResumeStore.getState().setTitle('第一版');
      const first = useResumeStore.getState().save();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      useResumeStore.getState().setTitle('第二版');
      const second = useResumeStore.getState().save();
      await Promise.resolve();
      // 第一次没落地之前，第二次不许发出去
      expect(fetchMock).toHaveBeenCalledTimes(1);

      release();
      await Promise.all([first, second]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bodyOf(fetchMock.mock.calls[0]).title).toBe('第一版');
      expect(bodyOf(fetchMock.mock.calls[1]).title).toBe('第二版');
    });

    it('保存期间敲的字不会被当成已保存', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = () => r();
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          await gate;
          return { ok: true };
        }),
      );

      useResumeStore.getState().setResume(RESUME);
      useResumeStore.getState().setTitle('第一版');
      const saving = useResumeStore.getState().save();
      await Promise.resolve();

      useResumeStore.getState().setTitle('保存期间又改了');
      release();
      await saving;

      expect(useResumeStore.getState().isDirty).toBe(true);
    });
  });
});
