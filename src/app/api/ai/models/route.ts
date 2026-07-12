import { NextRequest } from 'next/server';
import { DEFAULT_AI_MODEL, FIXED_AI_BASE_URL } from '@/lib/ai/config';

export async function GET(request: NextRequest) {
  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const currentModel = request.headers.get('x-model') || DEFAULT_AI_MODEL;
  const fallbackModels = [{ id: currentModel }, ...(currentModel === DEFAULT_AI_MODEL ? [] : [{ id: DEFAULT_AI_MODEL }])];

  if (!apiKey) {
    return Response.json({ models: fallbackModels });
  }

  try {
    let models: { id: string }[] = [];

    switch (provider) {
      case 'anthropic': {
        const url = `${FIXED_AI_BASE_URL.replace(/\/$/, '')}/models`;
        const res = await fetch(url, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (!res.ok) return Response.json({ models: fallbackModels });
        const data = await res.json();
        models = (data.data ?? []).map((m: { id: string }) => ({ id: m.id }));
        break;
      }

      case 'gemini': {
        const url = `${FIXED_AI_BASE_URL.replace(/\/$/, '')}/models?key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return Response.json({ models: fallbackModels });
        const data = await res.json();
        models = (data.models ?? []).map((m: { name: string }) => ({
          id: m.name.replace(/^models\//, ''),
        }));
        break;
      }

      default: {
        // openai
        const res = await fetch(`${FIXED_AI_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return Response.json({ models: fallbackModels });
        const data = await res.json();
        models = (data.data ?? data).map((m: { id: string }) => ({ id: m.id }));
        break;
      }
    }

    if (!models.some((m) => m.id === currentModel)) models.unshift({ id: currentModel });
    if (!models.some((m) => m.id === DEFAULT_AI_MODEL)) models.unshift({ id: DEFAULT_AI_MODEL });
    return Response.json({ models });
  } catch {
    return Response.json({ models: fallbackModels });
  }
}
