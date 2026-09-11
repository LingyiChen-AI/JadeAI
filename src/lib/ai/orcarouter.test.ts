import { describe, it, expect, vi } from 'vitest';
import {
  ORCAROUTER_PUBLIC_API_BASE,
  ORCAROUTER_PUBLIC_AUTH_BASE,
  buildCatalogUrl,
  buildExchangeUrl,
  fallbackModelsFor,
  filterModelsByCapability,
  isModelCompatible,
  normalizeOrcaOrigin,
  parseCatalogModel,
  parseCatalogResponse,
  reconcileSelectedModel,
  resolveOrcaRouterEndpoints,
  discoverOrcaModels,
  ORCAROUTER_FALLBACK_MODELS,
  type CatalogFetch,
  type OrcaCatalogModel,
} from './orcarouter';

const m = (
  id: string,
  endpointTypes: string[],
  inputModalities: string[] = ['text'],
  outputModalities: string[] = ['text']
): OrcaCatalogModel => ({
  id,
  inputModalities: inputModalities as OrcaCatalogModel['inputModalities'],
  outputModalities: outputModalities as OrcaCatalogModel['outputModalities'],
  endpointTypes,
});

/** Fixture covering every capability the catalog can advertise. */
const FIXTURE: OrcaCatalogModel[] = [
  m('openai/gpt-5.5', ['openai', 'openai-response'], ['file', 'image', 'text']),
  m('deepseek/deepseek-v4-pro', ['openai', 'openai-response'], ['text']),
  m('google/gemini-3.5-flash', ['openai', 'gemini'], ['text', 'image', 'video', 'audio', 'file']),
  m('anthropic/claude-opus-4.8', ['openai', 'anthropic', 'openai-response'], ['text', 'image', 'file']),
  m('google/gemini-3-pro-image-preview', ['openai', 'gemini'], ['text', 'image'], ['image', 'text']),
  m('orcarouter/auto', ['openai', 'openai-response', 'anthropic', 'gemini'], ['text']),
  m('openai/gpt-image-1', ['image-generation']),
  m('openai/text-embedding-3-small', ['embeddings']),
  m('some/video-model', ['openai-video']),
  m('some/rerank-model', ['jina-rerank']),
  // Metadata-poor record: everything must fail closed for this one.
  m('mystery/model', []),
];

describe('origins', () => {
  it('defaults to the documented public origins', () => {
    const { authBase, apiBase } = resolveOrcaRouterEndpoints({});
    expect(authBase).toBe(ORCAROUTER_PUBLIC_AUTH_BASE);
    expect(apiBase).toBe(ORCAROUTER_PUBLIC_API_BASE);
  });

  it('keeps auth and inference on separate origins and never derives one from the other', () => {
    const { authBase, apiBase } = resolveOrcaRouterEndpoints({});
    const exchange = buildExchangeUrl(authBase);
    // The common mistake: exchange on the relay origin. That path 404s.
    expect(exchange).toBe('https://www.orcarouter.ai/api/v1/auth/keys');
    expect(exchange).not.toContain('api.orcarouter.ai');
    expect(buildCatalogUrl(apiBase, 'text')).toBe(
      'https://api.orcarouter.ai/v1/models?capability=chat'
    );
    expect(buildCatalogUrl(apiBase, 'text')).not.toContain('www.orcarouter.ai');
  });

  it('prefers explicit overrides over the shared self-hosted base', () => {
    const { authBase, apiBase } = resolveOrcaRouterEndpoints({
      ORCA_BASE_URL: 'https://self.example.com',
      ORCA_AUTH_BASE_URL: 'https://auth.example.com',
      ORCA_API_BASE_URL: 'https://api.example.com/v1',
    });
    expect(authBase).toBe('https://auth.example.com');
    expect(apiBase).toBe('https://api.example.com/v1');
  });

  it('supports one shared self-hosted origin', () => {
    const { authBase, apiBase } = resolveOrcaRouterEndpoints({
      ORCA_BASE_URL: 'https://orca.internal',
    });
    expect(authBase).toBe('https://orca.internal');
    expect(apiBase).toBe('https://orca.internal');
  });

  it('requires https for remote origins but allows http on loopback', () => {
    expect(normalizeOrcaOrigin('http://orca.example.com')).toBeNull();
    expect(normalizeOrcaOrigin('http://127.0.0.1:8080')).toEqual({
      origin: 'http://127.0.0.1:8080',
      insecure: true,
    });
    expect(normalizeOrcaOrigin('http://localhost:3000')).not.toBeNull();
    expect(normalizeOrcaOrigin('ftp://orca.example.com')).toBeNull();
    // Credentials in the origin are refused.
    expect(normalizeOrcaOrigin('https://user:pass@orca.example.com')).toBeNull();
  });

  it('falls back to the public default when an override is unusable', () => {
    const { authBase } = resolveOrcaRouterEndpoints({
      ORCA_AUTH_BASE_URL: 'http://insecure.example.com',
    });
    expect(authBase).toBe(ORCAROUTER_PUBLIC_AUTH_BASE);
  });

  it('maps each capability to the right query value', () => {
    const base = 'https://api.orcarouter.ai/v1';
    expect(buildCatalogUrl(base, 'text')).toContain('capability=chat');
    expect(buildCatalogUrl(base, 'multimodal')).toContain('capability=chat');
    expect(buildCatalogUrl(base, 'embedding')).toContain('capability=embedding');
    expect(buildCatalogUrl(base, 'image')).toContain('capability=image');
    expect(buildCatalogUrl(base, 'video')).toContain('capability=video');
    expect(buildCatalogUrl(base, 'rerank')).toContain('capability=rerank');
  });
});

describe('catalog parsing', () => {
  it('preserves the vendor/model namespace verbatim', () => {
    const [model] = parseCatalogResponse({
      data: [{ id: 'anthropic/claude-opus-4.8' }],
    });
    expect(model.id).toBe('anthropic/claude-opus-4.8');
  });

  it('reads context, modalities and endpoint types', () => {
    const [model] = parseCatalogResponse({
      data: [
        {
          id: 'openai/gpt-5.5',
          context_length: 272000,
          max_completion_tokens: 128000,
          supported_endpoint_types: ['openai', 'openai-response'],
          architecture: { input_modalities: ['file', 'image', 'text'], output_modalities: ['text'] },
        },
      ],
    });
    expect(model.contextLength).toBe(272000);
    expect(model.maxCompletionTokens).toBe(128000);
    expect(model.inputModalities).toEqual(['file', 'image', 'text']);
    expect(model.endpointTypes).toContain('openai');
  });

  it('accepts a bare array under either envelope key', () => {
    expect(parseCatalogResponse({ models: [{ id: 'a/b' }] })).toHaveLength(1);
    expect(parseCatalogResponse({ data: [{ id: 'a/b' }] })).toHaveLength(1);
  });

  it('drops records with no usable id instead of guessing', () => {
    expect(parseCatalogModel(null)).toBeNull();
    expect(parseCatalogModel({})).toBeNull();
    expect(parseCatalogModel({ id: '' })).toBeNull();
    expect(parseCatalogModel({ id: 42 })).toBeNull();
    expect(
      parseCatalogResponse({ data: [{ id: 'ok/one' }, { nope: true }, null, { id: 7 }] })
    ).toHaveLength(1);
  });

  it('does not invent modalities that were not declared', () => {
    const [model] = parseCatalogResponse({ data: [{ id: 'mystery/model' }] });
    expect(model.inputModalities).toEqual([]);
    expect(model.outputModalities).toEqual([]);
  });
});

describe('capability filtering', () => {
  it('text: keeps chat models, drops image/video/rerank/embedding specialists', () => {
    const ids = filterModelsByCapability(FIXTURE, 'text').map((x) => x.id);
    expect(ids).toContain('openai/gpt-5.5');
    expect(ids).toContain('deepseek/deepseek-v4-pro');
    expect(ids).toContain('anthropic/claude-opus-4.8');
    expect(ids).not.toContain('openai/gpt-image-1');
    expect(ids).not.toContain('openai/text-embedding-3-small');
    expect(ids).not.toContain('some/video-model');
    expect(ids).not.toContain('some/rerank-model');
    // An image-emitting chat model is still not a prose model.
    expect(ids).not.toContain('google/gemini-3-pro-image-preview');
  });

  it('text: excludes a model whose metadata is missing (fail closed)', () => {
    expect(filterModelsByCapability(FIXTURE, 'text').map((x) => x.id)).not.toContain(
      'mystery/model'
    );
  });

  it('multimodal: only models that explicitly declare image input', () => {
    const ids = filterModelsByCapability(FIXTURE, 'multimodal').map((x) => x.id);
    expect(ids).toEqual([
      'openai/gpt-5.5',
      'google/gemini-3.5-flash',
      'anthropic/claude-opus-4.8',
    ]);
    expect(ids).not.toContain('deepseek/deepseek-v4-pro');
  });

  it('multimodal: a model with undeclared modalities fails closed', () => {
    expect(filterModelsByCapability(FIXTURE, 'multimodal').map((x) => x.id)).not.toContain(
      'mystery/model'
    );
  });

  it('multimodal: honours extra required modalities', () => {
    const ids = filterModelsByCapability(FIXTURE, 'multimodal', {
      requiredInputModalities: ['image', 'audio'],
    }).map((x) => x.id);
    expect(ids).toEqual(['google/gemini-3.5-flash']);
  });

  it('embedding / image / video / rerank match their endpoint strictly', () => {
    expect(filterModelsByCapability(FIXTURE, 'embedding').map((x) => x.id)).toEqual([
      'openai/text-embedding-3-small',
    ]);
    expect(filterModelsByCapability(FIXTURE, 'image').map((x) => x.id)).toEqual([
      'openai/gpt-image-1',
    ]);
    expect(filterModelsByCapability(FIXTURE, 'video').map((x) => x.id)).toEqual([
      'some/video-model',
    ]);
    expect(filterModelsByCapability(FIXTURE, 'rerank').map((x) => x.id)).toEqual([
      'some/rerank-model',
    ]);
  });

  it('never infers capability from a model name', () => {
    // The name says "image" but the metadata declares no image-generation
    // endpoint, so it must not appear in the image list.
    const misleading = m('vendor/super-image-generator', ['openai'], ['text']);
    expect(filterModelsByCapability([misleading], 'image')).toHaveLength(0);
  });

  it('isModelCompatible agrees with the list filter', () => {
    const gpt = FIXTURE[0];
    expect(isModelCompatible(gpt, 'text')).toBe(true);
    expect(isModelCompatible(gpt, 'embedding')).toBe(false);
  });

  it('reconcileSelectedModel clears a value the current filter rejects', () => {
    expect(reconcileSelectedModel('deepseek/deepseek-v4-pro', FIXTURE, 'multimodal')).toEqual({
      model: '',
      cleared: true,
    });
    expect(reconcileSelectedModel('openai/gpt-5.5', FIXTURE, 'multimodal')).toEqual({
      model: 'openai/gpt-5.5',
      cleared: false,
    });
    expect(reconcileSelectedModel('', FIXTURE, 'text')).toEqual({ model: '', cleared: false });
  });
});

describe('verified fallback catalog', () => {
  it('ships the five verified seed models', () => {
    expect(ORCAROUTER_FALLBACK_MODELS.map((x) => x.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-v4-pro',
      'orcarouter/auto',
    ]);
  });

  it('keeps GPT-5.5 reasoning metadata across the full ladder', () => {
    const gpt = fallbackModelsFor('text').find((x) => x.id === 'openai/gpt-5.5');
    expect(gpt?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(gpt?.contextLength).toBe(272000);
    expect(gpt?.inputModalities).toContain('image');
  });

  it('keeps context and modality metadata on the other seeds', () => {
    const opus = ORCAROUTER_FALLBACK_MODELS.find((x) => x.id === 'anthropic/claude-opus-4.8');
    expect(opus?.contextLength).toBe(1000000);
    expect(opus?.maxCompletionTokens).toBe(128000);
    const flash = ORCAROUTER_FALLBACK_MODELS.find((x) => x.id === 'google/gemini-3.5-flash');
    expect(flash?.contextLength).toBe(1048576);
    expect(flash?.inputModalities).toContain('video');
  });

  it('filters the seed by capability like any other catalog', () => {
    // deepseek is text-only, so it cannot appear in the multimodal list.
    const multimodal = fallbackModelsFor('multimodal').map((x) => x.id);
    expect(multimodal).toContain('openai/gpt-5.5');
    expect(multimodal).not.toContain('deepseek/deepseek-v4-pro');
    // No seed model can produce an image or an embedding.
    expect(fallbackModelsFor('image')).toHaveLength(0);
    expect(fallbackModelsFor('embedding')).toHaveLength(0);
  });
});

describe('live discovery', () => {
  const ok = (body: unknown): CatalogFetch =>
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    }));

  it('uses the live catalog when discovery succeeds', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      fetchImpl: ok({
        data: [
          {
            id: 'openai/gpt-5.5',
            supported_endpoint_types: ['openai'],
            architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          },
          { id: 'openai/gpt-image-1', supported_endpoint_types: ['image-generation'] },
        ],
      }),
    });
    expect(result.source).toBe('live');
    expect(result.models.map((x) => x.id)).toEqual(['openai/gpt-5.5']);
    expect(result.reason).toBeUndefined();
  });

  it('requests the catalog on the inference origin with Bearer auth', async () => {
    const spy = ok({ data: [{ id: 'a/b', supported_endpoint_types: ['openai'] }] });
    await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      fetchImpl: spy,
    });
    const [url, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect(url).not.toContain('www.orcarouter.ai');
    expect(init.headers.Authorization).toBe('Bearer sk-orca-test');
  });

  it('degrades to the seed on 401/403 and reports an auth reason', async () => {
    for (const status of [401, 403]) {
      const result = await discoverOrcaModels({
        apiBase: ORCAROUTER_PUBLIC_API_BASE,
        apiKey: 'sk-orca-revoked',
        capability: 'text',
        fetchImpl: vi.fn(async () => ({ ok: false, status, text: async () => '' })),
      });
      expect(result.source).toBe('seed');
      expect(result.reason).toBe('auth');
      expect(result.models.length).toBeGreaterThan(0);
    }
  });

  it('degrades to the seed on a transport failure', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    });
    expect(result.source).toBe('seed');
    expect(result.reason).toBe('network');
  });

  it('degrades to the seed on a malformed body rather than showing junk', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, text: async () => 'not json' })),
    });
    expect(result.source).toBe('seed');
    expect(result.reason).toBe('malformed');
  });

  it('reports a missing key as such instead of pretending to have a catalog', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: '',
      capability: 'text',
      fetchImpl: ok({ data: [{ id: 'a/b' }] }),
    });
    expect(result.source).toBe('seed');
    expect(result.reason).toBe('missing_key');
  });

  it('never merges the seed into a successful live result', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      fetchImpl: ok({
        data: [{ id: 'only/live', supported_endpoint_types: ['openai'] }],
      }),
    });
    expect(result.source).toBe('live');
    expect(result.models.map((x) => x.id)).toEqual(['only/live']);
    expect(result.models.some((x) => x.id === 'openai/gpt-5.5')).toBe(false);
  });

  it('bounds an oversized response', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      maxBytes: 32,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => 'x'.repeat(1024),
      })),
    });
    expect(result.source).toBe('seed');
    expect(result.reason).toBe('malformed');
  });

  it('bounds the number of accepted items', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({
      id: `vendor/m${i}`,
      supported_endpoint_types: ['openai'],
    }));
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'text',
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: many }) })),
    });
    expect(result.source).toBe('live');
    expect(result.models.length).toBeLessThanOrEqual(2000);
  });

  it('passes required modalities through to the multimodal filter', async () => {
    const result = await discoverOrcaModels({
      apiBase: ORCAROUTER_PUBLIC_API_BASE,
      apiKey: 'sk-orca-test',
      capability: 'multimodal',
      requiredInputModalities: ['image'],
      fetchImpl: ok({
        data: [
          {
            id: 'with/image',
            supported_endpoint_types: ['openai'],
            architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          },
          {
            id: 'text/only',
            supported_endpoint_types: ['openai'],
            architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          },
        ],
      }),
    });
    expect(result.models.map((x) => x.id)).toEqual(['with/image']);
  });
});
