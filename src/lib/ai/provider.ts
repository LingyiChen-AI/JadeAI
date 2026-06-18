import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export interface AIConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export const PROVIDER_DEFAULTS: Record<
  AIProvider,
  { baseURL: string; model: string }
> = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { baseURL: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
};

export function getDefaultBaseURL(provider: AIProvider): string {
  return PROVIDER_DEFAULTS[provider]?.baseURL ?? PROVIDER_DEFAULTS.openai.baseURL;
}

export function getDefaultModel(provider: AIProvider): string {
  return PROVIDER_DEFAULTS[provider]?.model ?? PROVIDER_DEFAULTS.openai.model;
}

export function extractAIConfig(request: NextRequest): AIConfig {
  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const baseURL = request.headers.get('x-base-url') || getDefaultBaseURL('openai');
  const model = request.headers.get('x-model') || getDefaultModel('openai');
  return { provider, apiKey, baseURL, model };
}

export function getModel(config: AIConfig, modelOverride?: string) {
  if (!config.apiKey) {
    throw new AIConfigError('API key is required. Please configure it in Settings.');
  }
  const modelId = modelOverride || config.model;

  switch (config.provider) {
    case 'anthropic': {
      const p = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL || undefined });
      return p(modelId);
    }
    case 'gemini': {
      const p = createGoogleGenerativeAI({ apiKey: config.apiKey, baseURL: config.baseURL || undefined });
      return p(modelId);
    }
    default: {
      const p = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      return p.chat(modelId);
    }
  }
}

/**
 * Returns providerOptions for JSON mode — only applicable to OpenAI-compatible providers.
 */
export function getJsonProviderOptions(config: AIConfig) {
  if (config.provider === 'openai') {
    return { openai: { response_format: { type: 'json_object' as const } } };
  }
  return {} as Record<string, never>;
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}
