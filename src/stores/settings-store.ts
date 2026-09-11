import { create } from 'zustand';

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'orcarouter'
  | 'orcarouter-oauth';

/** How the OrcaRouter key in hand was obtained. Downstream code ignores this. */
export type OrcaCredentialSource = 'api-key' | 'pkce';

/** The two OrcaRouter provider IDs, as first-class entries in the picker. */
export const ORCAROUTER_PROVIDERS: AIProvider[] = ['orcarouter', 'orcarouter-oauth'];

export function isOrcaProvider(provider: AIProvider): boolean {
  return ORCAROUTER_PROVIDERS.includes(provider);
}

/**
 * A stored OrcaRouter credential.
 *
 * This is the single shape both authentication choices produce: whether the key
 * was pasted by the user or minted by the PKCE exchange, everything downstream —
 * provider adapter, model discovery, inference — reads this and nothing else.
 */
export interface OrcaCredential {
  /** The API key. Never rendered, never logged, never sent to our server. */
  key: string;
  /** Which adapter produced it. Informational: status UI and error copy only. */
  source: OrcaCredentialSource;
  /** Monotonic per provider; bumped on every successful (re)authorization. */
  generation: number;
  /**
   * Set when the relay rejected this exact generation with 401/403. A durable
   * key grant has no refresh endpoint, so this is terminal until a new login.
   */
  needsReauth: boolean;
  /** Scope OrcaRouter reported as granted, for the PKCE path. */
  scope?: string;
}

interface ProviderConfig {
  baseURL: string;
  model: string;
  /** Persisted multimodal model, revalidated against the catalog on restore. */
  parseModel?: string;
  apiKey: string;
  source?: OrcaCredentialSource;
  generation?: number;
  needsReauth?: boolean;
  scope?: string;
}

interface SettingsStore {
  // AI settings
  aiProvider: AIProvider;
  aiApiKey: string; // stored locally only, never sent to server
  aiBaseURL: string;
  aiModel: string;
  /**
   * Separate model for surfaces that upload non-text input (resume parsing sends
   * page images). Kept apart from `aiModel` so a text-only default can never be
   * used for an image request, and vice versa.
   */
  aiParseModel: string;
  /** Which adapter produced `aiApiKey` for the active OrcaRouter provider. */
  aiCredentialSource: OrcaCredentialSource;
  /** Generation of the active credential, used for generation-safe 401 handling. */
  aiCredentialGeneration: number;
  /** True when the relay rejected the active credential; blocks further calls. */
  aiNeedsReauth: boolean;
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
  setAIParseModel: (model: string) => void;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  hydrate: () => void;

  // OrcaRouter credential seam
  /** Store an OrcaRouter credential from either authentication adapter. */
  saveOrcaCredential: (credential: {
    key: string;
    source: OrcaCredentialSource;
    scope?: string;
  }) => void;
  /** Clear the active OrcaRouter credential. */
  clearOrcaCredential: () => void;
  /**
   * Mark a specific credential generation as needing reauthentication.
   * Only the generation that produced the rejected request is affected.
   */
  markNeedsReauth: (generation: number) => void;
}

const API_KEY_STORAGE_KEY = 'jade_api_key';
const PROVIDER_CONFIGS_KEY = 'jade_provider_configs';

const PROVIDER_DEFAULTS: Record<AIProvider, ProviderConfig> = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: '' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', apiKey: '' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', apiKey: '' },
  // Both OrcaRouter entries share the same inference origin and model namespace;
  // only the way the key is obtained differs.
  orcarouter: { baseURL: 'https://api.orcarouter.ai/v1', model: 'orcarouter/auto', apiKey: '' },
  'orcarouter-oauth': { baseURL: 'https://api.orcarouter.ai/v1', model: 'orcarouter/auto', apiKey: '' },
};

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
  const configs = loadProviderConfigs();
  configs[state.aiProvider] = {
    baseURL: state.aiBaseURL,
    model: state.aiModel,
    ...(isOrcaProvider(state.aiProvider) && state.aiParseModel
      ? { parseModel: state.aiParseModel }
      : {}),
    apiKey: state.aiApiKey,
    ...(isOrcaProvider(state.aiProvider)
      ? {
          source: state.aiCredentialSource,
          generation: state.aiCredentialGeneration,
          needsReauth: state.aiNeedsReauth,
        }
      : {}),
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
  const { aiProvider, aiApiKey, aiBaseURL, aiModel, aiParseModel } =
    useSettingsStore.getState();
  const headers: Record<string, string> = {};
  if (aiProvider) headers['x-provider'] = aiProvider;
  if (aiApiKey) headers['x-api-key'] = aiApiKey;
  if (aiBaseURL) headers['x-base-url'] = aiBaseURL;
  if (aiModel) headers['x-model'] = aiModel;
  // Only OrcaRouter splits text and multimodal models; sending this for other
  // providers would be meaningless noise.
  if (aiParseModel && isOrcaProvider(aiProvider)) headers['x-parse-model'] = aiParseModel;
  return headers;
}

/**
 * Whether the active OrcaRouter credential may be used. A credential the relay
 * rejected must not be retried in a loop; the UI routes the user to re-auth.
 */
export function isActiveCredentialUsable(): boolean {
  const { aiProvider, aiApiKey, aiNeedsReauth } = useSettingsStore.getState();
  if (!isOrcaProvider(aiProvider)) return Boolean(aiApiKey);
  return Boolean(aiApiKey) && !aiNeedsReauth;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiProvider: 'openai',
  aiApiKey: '',
  aiBaseURL: 'https://api.openai.com/v1',
  aiModel: 'gpt-4o',
  aiParseModel: '',
  aiCredentialSource: 'api-key',
  aiCredentialGeneration: 0,
  aiNeedsReauth: false,
  autoSave: true,
  autoSaveInterval: 500,
  _hydrated: false,
  _syncing: false,

  setAIProvider: (provider) => {
    const { aiProvider: prev, aiBaseURL, aiModel, aiApiKey } = get();

    // Save current provider's config before switching
    const configs = loadProviderConfigs();
    configs[prev] = {
      baseURL: aiBaseURL,
      model: aiModel,
      ...(isOrcaProvider(prev) && get().aiParseModel
        ? { parseModel: get().aiParseModel }
        : {}),
      apiKey: aiApiKey,
      ...(isOrcaProvider(prev)
        ? {
            source: get().aiCredentialSource,
            generation: get().aiCredentialGeneration,
            needsReauth: get().aiNeedsReauth,
          }
        : {}),
    };
    saveProviderConfigs(configs);

    // Restore target provider's cached config, or use defaults
    const cached = configs[provider];
    const defaults = PROVIDER_DEFAULTS[provider];
    const restored = cached || defaults;

    set({
      aiProvider: provider,
      aiBaseURL: restored.baseURL,
      aiModel: restored.model,
      // Restored blind: the model selector revalidates it against the live
      // capability-filtered catalog and clears it if it no longer qualifies.
      aiParseModel: restored.parseModel ?? '',
      aiApiKey: restored.apiKey,
      aiCredentialSource: restored.source ?? 'api-key',
      aiCredentialGeneration: restored.generation ?? 0,
      aiNeedsReauth: restored.needsReauth ?? false,
    });
    saveApiKeyLocally(restored.apiKey);
    syncToServer(get());
  },

  setAIApiKey: (key) => {
    const state = get();
    // Typing into the key field is the manual API-key adapter: it takes
    // ownership of the credential and clears any prior failure verdict.
    set({
      aiApiKey: key,
      ...(isOrcaProvider(state.aiProvider)
        ? {
            aiCredentialSource: 'api-key' as OrcaCredentialSource,
            aiNeedsReauth: false,
            aiCredentialGeneration: state.aiCredentialGeneration + 1,
          }
        : {}),
    });
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

  setAIParseModel: (model) => {
    set({ aiParseModel: model });
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

  // --- OrcaRouter credential seam -----------------------------------------
  // Both authentication adapters funnel through here. Nothing downstream can
  // tell which one produced the key, which is the point.

  saveOrcaCredential: ({ key, source }) => {
    const state = get();
    // Keep the picker aligned with how the key was actually obtained, in the
    // same atomic update so no cached config round-trip can drop the new key.
    const provider = isOrcaProvider(state.aiProvider)
      ? source === 'pkce'
        ? ('orcarouter-oauth' as AIProvider)
        : ('orcarouter' as AIProvider)
      : state.aiProvider;
    set({
      aiProvider: provider,
      aiApiKey: key,
      aiCredentialSource: source,
      aiCredentialGeneration: state.aiCredentialGeneration + 1,
      aiNeedsReauth: false,
    });
    saveApiKeyLocally(key);
    syncProviderConfig(get());
  },

  clearOrcaCredential: () => {
    const state = get();
    set({
      aiApiKey: '',
      aiCredentialSource: 'api-key',
      aiCredentialGeneration: state.aiCredentialGeneration + 1,
      aiNeedsReauth: false,
    });
    saveApiKeyLocally('');
    syncProviderConfig(get());
  },

  markNeedsReauth: (generation) => {
    const state = get();
    if (!isOrcaProvider(state.aiProvider)) return;
    // Generation-safe: a late failure from a superseded request must never
    // invalidate a credential the user has since replaced.
    if (state.aiCredentialGeneration !== generation) return;
    set({ aiNeedsReauth: true });
    syncProviderConfig(get());
  },

  hydrate: async () => {
    if (get()._hydrated) return;

    // Load API key from localStorage immediately
    const apiKey = loadApiKeyLocally();
    set({ aiApiKey: apiKey });

    // The persisted multimodal model is restored below, once the active
    // provider is known — restoring it here would read the default provider and
    // silently drop it.

    // Load other settings from server
    try {
      const res = await fetch('/api/user/settings', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        // Backward compat: map legacy 'custom' provider to 'openai'
        const provider = (data.aiProvider === 'custom' || data.aiProvider === 'azure') ? 'openai' : data.aiProvider;
        const resolvedProvider: AIProvider = provider || get().aiProvider;
        set({
          ...(provider && { aiProvider: provider }),
          ...(data.aiBaseURL && { aiBaseURL: data.aiBaseURL }),
          ...(data.aiModel && { aiModel: data.aiModel }),
          ...(typeof data.autoSave === 'boolean' && { autoSave: data.autoSave }),
          ...(typeof data.autoSaveInterval === 'number' && { autoSaveInterval: data.autoSaveInterval }),
          _hydrated: true,
        });
        // Restore the persisted multimodal model for the provider we actually
        // resolved. It is restored blind on purpose: the model selector
        // revalidates it against the live capability-filtered catalog and
        // clears it if it no longer qualifies.
        if (isOrcaProvider(resolvedProvider)) {
          const saved = loadProviderConfigs()[resolvedProvider]?.parseModel;
          if (saved) set({ aiParseModel: saved });
        }
        // Seed provider config cache with hydrated values
        syncProviderConfig(get());
        return;
      }
    } catch { /* fall through */ }

    const fallbackProvider = get().aiProvider;
    if (isOrcaProvider(fallbackProvider)) {
      const saved = loadProviderConfigs()[fallbackProvider]?.parseModel;
      if (saved) set({ aiParseModel: saved });
    }
    set({ _hydrated: true });
  },
}));

// Auto-hydrate on client side so settings are ready before any component uses them
if (typeof window !== 'undefined') {
  useSettingsStore.getState().hydrate();
}
