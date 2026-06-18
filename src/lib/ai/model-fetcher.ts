import { AIProvider, getDefaultBaseURL } from './provider';

export interface ModelListResult {
  models: { id: string }[];
  error?: string;
}

export function normalizeBaseURL(url: string, provider: AIProvider): string {
  const trimmed = url.trim();
  if (!trimmed) return getDefaultBaseURL(provider);
  if (!/^https?:\/\//i.test(trimmed)) return getDefaultBaseURL(provider);
  return trimmed.replace(/\/+$/, '');
}

function authError(): ModelListResult {
  return { models: [], error: 'settings.apiKeyRequired' };
}

function genericError(): ModelListResult {
  return { models: [], error: 'settings.fetchModelsFailed' };
}

export async function fetchModels(
  provider: string,
  apiKey: string,
  baseURL: string,
): Promise<ModelListResult> {
  if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
    return genericError();
  }

  const p = provider as AIProvider;
  const normalized = normalizeBaseURL(baseURL, p);

  try {
    switch (p) {
      case 'openai': {
        const res = await fetch(`${normalized}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          return res.status === 401 || res.status === 403 ? authError() : genericError();
        }
        const data = (await res.json()) as { data?: { id: string }[] };
        return { models: (data.data ?? []).map((m) => ({ id: m.id })) };
      }

      case 'anthropic': {
        const res = await fetch(`${normalized}/v1/models`, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (!res.ok) {
          return res.status === 401 || res.status === 403 ? authError() : genericError();
        }
        const data = (await res.json()) as { data?: { id: string }[] };
        return { models: (data.data ?? []).map((m) => ({ id: m.id })) };
      }

      case 'gemini': {
        const res = await fetch(`${normalized}/models?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) {
          return res.status === 400 || res.status === 401 || res.status === 403 ? authError() : genericError();
        }
        const data = (await res.json()) as { models?: { name: string }[] };
        return {
          models: (data.models ?? []).map((m) => ({
            id: m.name.replace(/^models\//, ''),
          })),
        };
      }

      default:
        return genericError();
    }
  } catch {
    return genericError();
  }
}
