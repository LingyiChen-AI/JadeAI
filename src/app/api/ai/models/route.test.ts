import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { fetchModels } from '@/lib/ai/model-fetcher';

vi.mock('@/lib/ai/model-fetcher', () => ({
  fetchModels: vi.fn(),
}));

function makeRequest(headers: Record<string, string>) {
  return new Request('https://example.com/api/ai/models', { headers });
}

describe('/api/ai/models', () => {
  beforeEach(() => {
    vi.mocked(fetchModels).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns apiKeyRequired when x-api-key is missing', async () => {
    const request = makeRequest({ 'x-provider': 'openai' });
    const response = await GET(request as unknown as import('next/server').NextRequest);
    const data = await response.json();

    expect(data).toEqual({ models: [], error: 'settings.apiKeyRequired' });
    expect(fetchModels).not.toHaveBeenCalled();
  });

  it('returns models on success', async () => {
    vi.mocked(fetchModels).mockResolvedValue({
      models: [{ id: 'gpt-4o' }],
    });

    const request = makeRequest({
      'x-provider': 'openai',
      'x-api-key': 'sk-test',
      'x-base-url': 'https://api.openai.com/v1',
    });
    const response = await GET(request as unknown as import('next/server').NextRequest);
    const data = await response.json();

    expect(data).toEqual({ models: [{ id: 'gpt-4o' }] });
    expect(fetchModels).toHaveBeenCalledWith('openai', 'sk-test', 'https://api.openai.com/v1');
  });

  it('passes through fetcher errors', async () => {
    vi.mocked(fetchModels).mockResolvedValue({
      models: [],
      error: 'settings.fetchModelsFailed',
    });

    const request = makeRequest({
      'x-provider': 'openai',
      'x-api-key': 'sk-test',
    });
    const response = await GET(request as unknown as import('next/server').NextRequest);
    const data = await response.json();

    expect(data).toEqual({ models: [], error: 'settings.fetchModelsFailed' });
  });
});
