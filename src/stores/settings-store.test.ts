/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from 'vitest';

async function hydrateWithModel(aiModel: string) {
  vi.resetModules();
  localStorage.clear();
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ aiProvider: 'openai', aiModel }),
  });
  vi.stubGlobal('fetch', fetchMock);

  const { useSettingsStore } = await import('./settings-store');
  await vi.waitFor(() => expect(useSettingsStore.getState()._hydrated).toBe(true));

  return { fetchMock, useSettingsStore };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('settings model hydration', () => {
  test.each(['gpt-5.5', 'claude-custom'])(
    'preserves persisted model %s without migration writeback',
    async (persistedModel) => {
      const { fetchMock, useSettingsStore } = await hydrateWithModel(persistedModel);

      expect(useSettingsStore.getState().aiModel).toBe(persistedModel);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    },
  );
});
