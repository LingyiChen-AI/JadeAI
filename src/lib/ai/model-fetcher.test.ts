import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchModels, normalizeBaseURL } from './model-fetcher';
import { getDefaultBaseURL } from './provider';

describe('normalizeBaseURL', () => {
  it('returns the provider default for an empty string', () => {
    expect(normalizeBaseURL('', 'openai')).toBe(getDefaultBaseURL('openai'));
  });

  it('returns the provider default for a string without a protocol', () => {
    expect(normalizeBaseURL('api.example.com/v1', 'anthropic')).toBe(
      getDefaultBaseURL('anthropic'),
    );
  });

  it('strips trailing slashes', () => {
    expect(normalizeBaseURL('https://api.example.com/v1/', 'openai')).toBe(
      'https://api.example.com/v1',
    );
    expect(normalizeBaseURL('https://api.example.com/v1///', 'openai')).toBe(
      'https://api.example.com/v1',
    );
  });

  it('preserves a URL without trailing slash', () => {
    expect(normalizeBaseURL('https://api.example.com/v1', 'openai')).toBe(
      'https://api.example.com/v1',
    );
  });
});

describe('fetchModels', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(response: Partial<Response> & { json?: unknown }) {
    const jsonFn = typeof response.json === 'function'
      ? response.json
      : () => Promise.resolve(response.json);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: jsonFn,
    } as Response);
  }

  it('fetches OpenAI models', async () => {
    mockFetch({ json: { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] } });

    const result = await fetchModels('openai', 'sk-test', '');

    expect(global.fetch).toHaveBeenCalledWith(
      `${getDefaultBaseURL('openai')}/models`,
      { headers: { Authorization: 'Bearer sk-test' } },
    );
    expect(result).toEqual({ models: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] });
  });

  it('fetches Anthropic models', async () => {
    mockFetch({ json: { data: [{ id: 'claude-opus-4' }] } });

    const result = await fetchModels('anthropic', 'sk-test', '');

    expect(global.fetch).toHaveBeenCalledWith(
      `${getDefaultBaseURL('anthropic')}/v1/models`,
      {
        headers: {
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
        },
      },
    );
    expect(result).toEqual({ models: [{ id: 'claude-opus-4' }] });
  });

  it('fetches Gemini models and strips the models/ prefix', async () => {
    mockFetch({ json: { models: [{ name: 'models/gemini-2.0-flash' }] } });

    const result = await fetchModels('gemini', 'sk-test', '');

    expect(global.fetch).toHaveBeenCalledWith(
      `${getDefaultBaseURL('gemini')}/models?key=sk-test`,
    );
    expect(result).toEqual({ models: [{ id: 'gemini-2.0-flash' }] });
  });

  it('returns apiKeyRequired for 401 responses', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const result = await fetchModels('openai', 'bad-key', '');

    expect(result).toEqual({ models: [], error: 'settings.apiKeyRequired' });
  });

  it('returns fetchModelsFailed for 500 responses', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await fetchModels('openai', 'sk-test', '');

    expect(result).toEqual({ models: [], error: 'settings.fetchModelsFailed' });
  });

  it('returns fetchModelsFailed when JSON parsing fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    } as Response);

    const result = await fetchModels('openai', 'sk-test', '');

    expect(result).toEqual({ models: [], error: 'settings.fetchModelsFailed' });
  });

  it('returns fetchModelsFailed for unknown providers', async () => {
    const result = await fetchModels('unknown', 'sk-test', '');

    expect(result).toEqual({ models: [], error: 'settings.fetchModelsFailed' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
