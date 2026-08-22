import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useResumeStore } from './resume-store';
import { useSettingsStore } from './settings-store';

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
