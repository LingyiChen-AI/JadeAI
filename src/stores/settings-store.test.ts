import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDefaultBaseURL, getDefaultModel } from '@/lib/ai/provider';

describe('settings store', () => {
  let storage: Record<string, string> = {};
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    storage = {};
    fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock;

    // Simulate a browser environment so localStorage code paths run.
    // @ts-expect-error — assigning window in a Node test environment.
    globalThis.window = globalThis;
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
      },
      writable: true,
      configurable: true,
    });

    // Reset module state to defaults before each test.
    const { useSettingsStore } = await import('./settings-store');
    useSettingsStore.setState({
      aiProvider: 'openai',
      aiApiKey: '',
      aiBaseURL: getDefaultBaseURL('openai'),
      aiModel: getDefaultModel('openai'),
      autoSave: true,
      autoSaveInterval: 500,
      _hydrated: false,
      _syncing: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the API key from localStorage on hydrate', async () => {
    storage['jade_api_key'] = 'secret-key';

    const { useSettingsStore } = await import('./settings-store');
    await useSettingsStore.getState().hydrate();

    expect(useSettingsStore.getState().aiApiKey).toBe('secret-key');
  });

  it('migrates legacy provider configs and restores per-provider model', async () => {
    storage['jade_api_key'] = 'anthropic-key';
    storage['jade_provider_configs'] = JSON.stringify({
      anthropic: {
        baseURL: 'https://custom.anthropic.com',
        model: 'claude-legacy',
        apiKey: 'anthropic-key',
      },
    });

    const { useSettingsStore } = await import('./settings-store');
    useSettingsStore.getState().setAIProvider('anthropic');

    const state = useSettingsStore.getState();
    expect(state.aiProvider).toBe('anthropic');
    expect(state.aiModel).toBe('claude-legacy');
    expect(state.aiBaseURL).toBe('https://custom.anthropic.com');

    // Migration should have versioned the persisted shape.
    const persisted = JSON.parse(storage['jade_provider_configs']);
    expect(persisted.version).toBe(1);
    expect(persisted.configs.anthropic.model).toBe('claude-legacy');
  });

  it('falls back to defaults when no cached config exists', async () => {
    storage['jade_api_key'] = 'gemini-key';

    const { useSettingsStore } = await import('./settings-store');
    useSettingsStore.getState().setAIProvider('gemini');

    const state = useSettingsStore.getState();
    expect(state.aiProvider).toBe('gemini');
    expect(state.aiModel).toBe(getDefaultModel('gemini'));
    expect(state.aiBaseURL).toBe(getDefaultBaseURL('gemini'));
  });

  it('persists a manually entered model per provider', async () => {
    storage['jade_api_key'] = 'openai-key';

    const { useSettingsStore } = await import('./settings-store');
    const store = useSettingsStore.getState();

    store.setAIModel('my-custom-model');
    store.setAIProvider('anthropic');
    store.setAIProvider('openai');

    expect(useSettingsStore.getState().aiModel).toBe('my-custom-model');
  });
});
