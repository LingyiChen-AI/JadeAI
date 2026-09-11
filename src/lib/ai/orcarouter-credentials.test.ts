import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The dual-authentication contract.
 *
 * Hard requirement: pasting an `sk-orca-…` key and completing the PKCE connect
 * flow must produce *the same* credential result, and nothing downstream —
 * provider adapter, model discovery, inference — may know or care which one
 * produced it. These tests fail if either adapter grows its own downstream path.
 */

const FAKE_API_KEY = 'sk-orca-fakeAPIKEY0000000000000000000';
const FAKE_PKCE_KEY = 'sk-orca-fakePKCEKEY000000000000000000';

/** Minimal browser-ish globals so the settings store can run under vitest/node. */
function installBrowserShims() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', localStorage);
  return store;
}

async function loadStore() {
  vi.resetModules();
  return import('@/stores/settings-store');
}

describe('credential seam — both adapters produce one credential shape', () => {
  beforeEach(() => {
    installBrowserShims();
  });

  it('the API-key adapter and the PKCE adapter yield the same credential result', async () => {
    const { useSettingsStore } = await loadStore();

    // --- Adapter 1: the user pastes a key into the settings field ---------
    useSettingsStore.setState(useSettingsStore.getState());
    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);

    const fromApiKey = useSettingsStore.getState();
    const apiKeyCredential = {
      key: fromApiKey.aiApiKey,
      source: fromApiKey.aiCredentialSource,
      provider: fromApiKey.aiProvider,
    };

    // --- Adapter 2: the PKCE connect flow installs a key ------------------
    useSettingsStore.getState().setAIProvider('orcarouter-oauth');
    useSettingsStore.getState().saveOrcaCredential({
      key: FAKE_PKCE_KEY,
      source: 'pkce',
      scope: 'api',
    });

    const fromPkce = useSettingsStore.getState();
    const pkceCredential = {
      key: fromPkce.aiApiKey,
      source: fromPkce.aiCredentialSource,
      provider: fromPkce.aiProvider,
    };

    // Same shape, same downstream fields; only the provenance differs.
    expect(Object.keys(apiKeyCredential).sort()).toEqual(Object.keys(pkceCredential).sort());
    expect(apiKeyCredential.source).toBe('api-key');
    expect(pkceCredential.source).toBe('pkce');
    // Both land in the one slot every downstream consumer reads.
    expect(apiKeyCredential.key).toBe(FAKE_API_KEY);
    expect(pkceCredential.key).toBe(FAKE_PKCE_KEY);
    // Both resolve to an OrcaRouter provider with the same inference base.
    expect(fromApiKey.aiBaseURL).toBe('https://api.orcarouter.ai/v1');
    expect(fromPkce.aiBaseURL).toBe('https://api.orcarouter.ai/v1');
  });

  it('downstream headers carry no hint of which adapter was used', async () => {
    const { useSettingsStore, getAIHeaders } = await loadStore();

    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);
    const apiKeyHeaders = getAIHeaders();

    useSettingsStore.getState().setAIProvider('orcarouter-oauth');
    useSettingsStore.getState().saveOrcaCredential({ key: FAKE_API_KEY, source: 'pkce' });
    const pkceHeaders = getAIHeaders();

    // Nothing in the request tells the server (or the provider) how the key
    // was obtained — there is no provenance header of any kind.
    expect(Object.keys(apiKeyHeaders).sort()).toEqual(Object.keys(pkceHeaders).sort());
    expect(Object.keys(apiKeyHeaders).sort()).toEqual([
      'x-api-key',
      'x-base-url',
      'x-model',
      'x-provider',
    ]);
    expect(Object.keys(apiKeyHeaders).some((k) => /source|grant|method|credential/i.test(k))).toBe(
      false
    );
    expect(JSON.stringify(pkceHeaders)).not.toMatch(/pkce/i);
    expect(apiKeyHeaders['x-api-key']).toBe(FAKE_API_KEY);
    expect(pkceHeaders['x-api-key']).toBe(FAKE_API_KEY);
    // The inference base URL is identical either way.
    expect(apiKeyHeaders['x-base-url']).toBe('https://api.orcarouter.ai/v1');
    expect(pkceHeaders['x-base-url']).toBe('https://api.orcarouter.ai/v1');
  });

  it('only one credential slot exists: a new key replaces the old, whichever adapter wrote it', async () => {
    const { useSettingsStore } = await loadStore();

    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);
    expect(useSettingsStore.getState().aiApiKey).toBe(FAKE_API_KEY);

    useSettingsStore.getState().saveOrcaCredential({ key: FAKE_PKCE_KEY, source: 'pkce' });
    expect(useSettingsStore.getState().aiApiKey).toBe(FAKE_PKCE_KEY);
    // The picker follows how the key was actually obtained.
    expect(useSettingsStore.getState().aiProvider).toBe('orcarouter-oauth');
  });

  it('each adapter can be used independently: clearing one does not require the other', async () => {
    const { useSettingsStore } = await loadStore();

    // A user with no browser can stay on the API-key path forever.
    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);
    expect(useSettingsStore.getState().aiCredentialSource).toBe('api-key');
    expect(useSettingsStore.getState().aiNeedsReauth).toBe(false);

    useSettingsStore.getState().clearOrcaCredential();
    expect(useSettingsStore.getState().aiApiKey).toBe('');
    expect(useSettingsStore.getState().aiNeedsReauth).toBe(false);
  });

  it('bumps the credential generation on every write, from either adapter', async () => {
    const { useSettingsStore } = await loadStore();
    const start = useSettingsStore.getState().aiCredentialGeneration;

    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);
    const afterApiKey = useSettingsStore.getState().aiCredentialGeneration;
    expect(afterApiKey).toBeGreaterThan(start);

    useSettingsStore.getState().saveOrcaCredential({ key: FAKE_PKCE_KEY, source: 'pkce' });
    expect(useSettingsStore.getState().aiCredentialGeneration).toBeGreaterThan(afterApiKey);
  });
});

describe('provider adapter — both OrcaRouter entries share one transport', () => {
  beforeEach(() => {
    vi.resetModules();
    installBrowserShims();
  });

  it('builds the identical OpenAI-compatible client for both provider ids', async () => {
    const createOpenAISpy = vi.fn(() => ({ chat: (id: string) => ({ modelId: id }) }));
    vi.doMock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAISpy }));

    const { getModel } = await import('@/lib/ai/provider');

    for (const provider of ['orcarouter', 'orcarouter-oauth']) {
      createOpenAISpy.mockClear();
      const model = getModel({
        provider,
        apiKey: FAKE_API_KEY,
        baseURL: '',
        model: 'openai/gpt-5.5',
      });
      expect(createOpenAISpy).toHaveBeenCalledTimes(1);
      expect(createOpenAISpy).toHaveBeenCalledWith({
        apiKey: FAKE_API_KEY,
        baseURL: 'https://api.orcarouter.ai/v1',
      });
      expect(model).toEqual({ modelId: 'openai/gpt-5.5' });
    }

    vi.doUnmock('@ai-sdk/openai');
  });

  it('never routes OrcaRouter inference at the auth origin', async () => {
    const { getOrcaRouterApiBase } = await import('@/lib/ai/provider');
    const base = getOrcaRouterApiBase({ baseURL: '' });
    expect(base).toBe('https://api.orcarouter.ai/v1');
    expect(base).not.toContain('www.orcarouter.ai');
  });

  it('honours an explicit self-hosted API override', async () => {
    const { getOrcaRouterApiBase } = await import('@/lib/ai/provider');
    expect(getOrcaRouterApiBase({ baseURL: 'https://orca.internal/v1/' })).toBe(
      'https://orca.internal/v1'
    );
  });

  it('refuses to send page images to a text-only model when none is chosen', async () => {
    const { getParseModel, AIConfigError } = await import('@/lib/ai/provider');
    expect(() =>
      getParseModel({
        provider: 'orcarouter',
        apiKey: FAKE_API_KEY,
        baseURL: '',
        model: 'deepseek/deepseek-v4-pro',
      })
    ).toThrow(AIConfigError);
    // Non-OrcaRouter providers keep their existing single-model behaviour.
    expect(() =>
      getParseModel({
        provider: 'openai',
        apiKey: FAKE_API_KEY,
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      })
    ).not.toThrow();
  });
});

describe('401 handling is generation-safe and never fakes a refresh', () => {
  beforeEach(() => {
    installBrowserShims();
  });

  it('marks only the rejected generation and blocks further use', async () => {
    const { useSettingsStore, isActiveCredentialUsable } = await loadStore();
    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);
    const rejectedGeneration = useSettingsStore.getState().aiCredentialGeneration;

    useSettingsStore.getState().markNeedsReauth(rejectedGeneration);
    expect(useSettingsStore.getState().aiNeedsReauth).toBe(true);
    expect(isActiveCredentialUsable()).toBe(false);
    // The stored secret is NOT deleted — a misclassified failure must not
    // become irreversible account loss.
    expect(useSettingsStore.getState().aiApiKey).toBe(FAKE_API_KEY);
  });

  it('a late failure from a superseded request cannot poison a fresh login', async () => {
    const { useSettingsStore, isActiveCredentialUsable } = await loadStore();
    useSettingsStore.getState().setAIProvider('orcarouter-oauth');
    useSettingsStore.getState().saveOrcaCredential({ key: FAKE_PKCE_KEY, source: 'pkce' });
    const staleGeneration = useSettingsStore.getState().aiCredentialGeneration - 1;

    // The rejected request belonged to the previous credential generation.
    useSettingsStore.getState().markNeedsReauth(staleGeneration);

    expect(useSettingsStore.getState().aiNeedsReauth).toBe(false);
    expect(isActiveCredentialUsable()).toBe(true);
    expect(useSettingsStore.getState().aiApiKey).toBe(FAKE_PKCE_KEY);
  });

  it('a successful re-login clears the needsReauth verdict', async () => {
    const { useSettingsStore } = await loadStore();
    useSettingsStore.getState().setAIProvider('orcarouter');
    useSettingsStore.getState().setAIApiKey(FAKE_API_KEY);
    useSettingsStore.getState().markNeedsReauth(useSettingsStore.getState().aiCredentialGeneration);
    expect(useSettingsStore.getState().aiNeedsReauth).toBe(true);

    useSettingsStore.getState().setAIApiKey(FAKE_PKCE_KEY);
    expect(useSettingsStore.getState().aiNeedsReauth).toBe(false);
  });
});
