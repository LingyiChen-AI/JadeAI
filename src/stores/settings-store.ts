import { create } from 'zustand';
import {
  AIProvider,
  getDefaultBaseURL,
  getDefaultModel,
} from '@/lib/ai/provider';

interface SettingsStore {
  // AI settings
  aiProvider: AIProvider;
  aiApiKey: string; // stored locally only, never sent to server
  aiBaseURL: string;
  aiModel: string;
  // Editor settings
  autoSave: boolean;
  autoSaveInterval: number; // in milliseconds

  // Hydration state
  _hydrated: boolean;
  _syncing: boolean;

  // Actions
  setAIProvider: (provider: AIProvider) => void;
  setAIApiKey: (key: string) => void;
  setAIBaseURL: (url: string) => void;
  setAIModel: (model: string) => void;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  hydrate: () => void;
}

const API_KEY_STORAGE_KEY = 'jade_api_key';
const PROVIDER_CONFIGS_KEY = 'jade_provider_configs';

interface ProviderConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

interface PersistedProviderConfigs {
  version: number;
  configs: Partial<Record<AIProvider, ProviderConfig>>;
}

function migrateLegacyConfigs(raw: unknown): PersistedProviderConfigs {
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'version' in raw
  ) {
    return raw as PersistedProviderConfigs;
  }

  // Legacy shape was Record<AIProvider, ProviderConfig>
  const legacy = (raw ?? {}) as Partial<Record<AIProvider, ProviderConfig>>;
  return { version: 1, configs: legacy };
}

function loadProviderConfigs(): PersistedProviderConfigs {
  if (typeof window === 'undefined') return { version: 1, configs: {} };
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const migrated = migrateLegacyConfigs(parsed);
    saveProviderConfigs(migrated);
    return migrated;
  } catch {
    return { version: 1, configs: {} };
  }
}

function saveProviderConfigs(configs: PersistedProviderConfigs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROVIDER_CONFIGS_KEY, JSON.stringify(configs));
  } catch {
    /* ignore */
  }
}

function getFingerprint(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jade_fingerprint');
}

function getHeaders(): Record<string, string> {
  const fp = getFingerprint();
  return {
    'Content-Type': 'application/json',
    ...(fp ? { 'x-fingerprint': fp } : {}),
  };
}

// Sync settings to server (debounced)
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function syncToServer(state: SettingsStore) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await fetch('/api/user/settings', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          aiProvider: state.aiProvider,
          aiBaseURL: state.aiBaseURL,
          aiModel: state.aiModel,
          autoSave: state.autoSave,
          autoSaveInterval: state.autoSaveInterval,
        }),
      });
    } catch {
      // silently fail, local state is still correct
    }
  }, 500);
}

function syncProviderConfig(state: SettingsStore) {
  const persisted = loadProviderConfigs();
  persisted.configs[state.aiProvider] = {
    baseURL: state.aiBaseURL,
    model: state.aiModel,
    apiKey: state.aiApiKey,
  };
  saveProviderConfigs(persisted);
}

function saveApiKeyLocally(key: string) {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function loadApiKeyLocally(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function getAIHeaders(): Record<string, string> {
  const { aiProvider, aiApiKey, aiBaseURL, aiModel } = useSettingsStore.getState();
  const headers: Record<string, string> = {};
  if (aiProvider) headers['x-provider'] = aiProvider;
  if (aiApiKey) headers['x-api-key'] = aiApiKey;
  if (aiBaseURL) headers['x-base-url'] = aiBaseURL;
  if (aiModel) headers['x-model'] = aiModel;
  return headers;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseURL: getDefaultBaseURL('openai'),
  aiModel: getDefaultModel('openai'),
  autoSave: true,
  autoSaveInterval: 500,
  _hydrated: false,
  _syncing: false,

  setAIProvider: (provider) => {
    const { aiProvider: prev, aiBaseURL, aiModel, aiApiKey } = get();

    // Save current provider's config before switching
    const persisted = loadProviderConfigs();
    persisted.configs[prev] = { baseURL: aiBaseURL, model: aiModel, apiKey: aiApiKey };
    saveProviderConfigs(persisted);

    // Restore target provider's cached config, or use defaults
    const cached = persisted.configs[provider];
    const restored = cached ?? {
      baseURL: getDefaultBaseURL(provider),
      model: getDefaultModel(provider),
      apiKey: loadApiKeyLocally(),
    };

    set({
      aiProvider: provider,
      aiBaseURL: restored.baseURL,
      aiModel: restored.model,
      aiApiKey: restored.apiKey,
    });
    saveApiKeyLocally(restored.apiKey);
    syncToServer(get());
  },

  setAIApiKey: (key) => {
    set({ aiApiKey: key });
    saveApiKeyLocally(key);
    syncProviderConfig(get());
  },

  setAIBaseURL: (url) => {
    set({ aiBaseURL: url });
    syncToServer(get());
    syncProviderConfig(get());
  },

  setAIModel: (model) => {
    set({ aiModel: model });
    syncToServer(get());
    syncProviderConfig(get());
  },

  setAutoSave: (enabled) => {
    set({ autoSave: enabled });
    syncToServer(get());
  },

  setAutoSaveInterval: (interval) => {
    set({ autoSaveInterval: interval });
    syncToServer(get());
  },

  hydrate: async () => {
    if (get()._hydrated) return;

    // Trigger migration of legacy provider configs before anything else
    loadProviderConfigs();

    // Load API key from localStorage immediately
    const apiKey = loadApiKeyLocally();
    set({ aiApiKey: apiKey });

    // Load other settings from server
    try {
      const res = await fetch('/api/user/settings', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        // Backward compat: map legacy 'custom' provider to 'openai'
        const provider = (data.aiProvider === 'custom' || data.aiProvider === 'azure') ? 'openai' : data.aiProvider;
        set({
          ...(provider && { aiProvider: provider }),
          ...(data.aiBaseURL && { aiBaseURL: data.aiBaseURL }),
          ...(data.aiModel && { aiModel: data.aiModel }),
          ...(typeof data.autoSave === 'boolean' && { autoSave: data.autoSave }),
          ...(typeof data.autoSaveInterval === 'number' && { autoSaveInterval: data.autoSaveInterval }),
          _hydrated: true,
        });
        // Seed provider config cache with hydrated values
        syncProviderConfig(get());
        return;
      }
    } catch {
      /* fall through */
    }

    set({ _hydrated: true });
  },
}));

// Auto-hydrate on client side so settings are ready before any component uses them
if (typeof window !== 'undefined') {
  useSettingsStore.getState().hydrate();
}
