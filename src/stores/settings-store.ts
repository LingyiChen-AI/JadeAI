import { create } from 'zustand';
import { DEFAULT_AI_MODEL, FIXED_AI_BASE_URL } from '@/lib/ai/config';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

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
const LEGACY_DEFAULT_MODELS = new Set(['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.0-flash']);

interface ProviderConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

const PROVIDER_DEFAULTS: Record<AIProvider, ProviderConfig> = {
  openai: { baseURL: FIXED_AI_BASE_URL, model: DEFAULT_AI_MODEL, apiKey: '' },
  anthropic: { baseURL: FIXED_AI_BASE_URL, model: DEFAULT_AI_MODEL, apiKey: '' },
  gemini: { baseURL: FIXED_AI_BASE_URL, model: DEFAULT_AI_MODEL, apiKey: '' },
};

function normalizeModel(model?: string | null): string {
  const trimmed = model?.trim();
  if (!trimmed || LEGACY_DEFAULT_MODELS.has(trimmed)) return DEFAULT_AI_MODEL;
  return trimmed;
}

function loadProviderConfigs(): Partial<Record<AIProvider, ProviderConfig>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProviderConfigs(configs: Partial<Record<AIProvider, ProviderConfig>>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PROVIDER_CONFIGS_KEY, JSON.stringify(configs)); } catch { /* ignore */ }
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
          aiBaseURL: FIXED_AI_BASE_URL,
          aiModel: normalizeModel(state.aiModel),
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
  const configs = loadProviderConfigs();
  configs[state.aiProvider] = {
    baseURL: FIXED_AI_BASE_URL,
    model: normalizeModel(state.aiModel),
    apiKey: state.aiApiKey,
  };
  saveProviderConfigs(configs);
}

function saveApiKeyLocally(key: string) {
  if (typeof window === 'undefined') return;
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch { /* ignore */ }
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
  const { aiProvider, aiApiKey, aiModel } = useSettingsStore.getState();
  const headers: Record<string, string> = {};
  if (aiProvider) headers['x-provider'] = aiProvider;
  if (aiApiKey) headers['x-api-key'] = aiApiKey;
  headers['x-base-url'] = FIXED_AI_BASE_URL;
  headers['x-model'] = normalizeModel(aiModel);
  return headers;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseURL: FIXED_AI_BASE_URL,
  aiModel: DEFAULT_AI_MODEL,
  autoSave: true,
  autoSaveInterval: 500,
  _hydrated: false,
  _syncing: false,

  setAIProvider: (provider) => {
    const { aiProvider: prev, aiModel, aiApiKey } = get();

    // Save current provider's config before switching
    const configs = loadProviderConfigs();
    configs[prev] = { baseURL: FIXED_AI_BASE_URL, model: normalizeModel(aiModel), apiKey: aiApiKey };
    saveProviderConfigs(configs);

    // Restore target provider's cached config, or use defaults
    const cached = configs[provider];
    const defaults = PROVIDER_DEFAULTS[provider];
    const restored = cached || defaults;

    set({
      aiProvider: provider,
      aiBaseURL: FIXED_AI_BASE_URL,
      aiModel: normalizeModel(restored.model),
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

  setAIBaseURL: () => {
    set({ aiBaseURL: FIXED_AI_BASE_URL });
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
          aiBaseURL: FIXED_AI_BASE_URL,
          aiModel: normalizeModel(data.aiModel),
          ...(typeof data.autoSave === 'boolean' && { autoSave: data.autoSave }),
          ...(typeof data.autoSaveInterval === 'number' && { autoSaveInterval: data.autoSaveInterval }),
          _hydrated: true,
        });
        // Seed provider config cache with hydrated values
        syncProviderConfig(get());
        return;
      }
    } catch { /* fall through */ }

    set({ aiBaseURL: FIXED_AI_BASE_URL, aiModel: normalizeModel(get().aiModel), _hydrated: true });
  },
}));

// Auto-hydrate on client side so settings are ready before any component uses them
if (typeof window !== 'undefined') {
  useSettingsStore.getState().hydrate();
}
