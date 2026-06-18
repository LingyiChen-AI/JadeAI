import { NextRequest } from 'next/server';
import { fetchModels } from '@/lib/ai/model-fetcher';

export async function GET(request: NextRequest) {
  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const baseURL = request.headers.get('x-base-url') || '';

  if (!apiKey) {
    return Response.json({ models: [], error: 'settings.apiKeyRequired' });
  }

  const result = await fetchModels(provider, apiKey, baseURL);
  return Response.json(result);
}
