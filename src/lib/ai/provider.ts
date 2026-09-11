import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  ORCAROUTER_PUBLIC_API_BASE,
  isOrcaRouterProvider,
  resolveOrcaRouterEndpoints,
} from './orcarouter';

export interface AIConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
  /**
   * Model for surfaces that upload non-text input. Only meaningful for
   * OrcaRouter, where the text and multimodal catalogs are filtered separately.
   */
  parseModel?: string;
}

export function extractAIConfig(request: NextRequest): AIConfig {
  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const model = request.headers.get('x-model') || 'gpt-4o';
  const parseModel = request.headers.get('x-parse-model') || '';
  // OrcaRouter owns its base URL (deployment overrides included), so it must not
  // inherit the OpenAI default when the client omits the header.
  const baseURL = isOrcaRouterProvider(provider)
    ? request.headers.get('x-base-url') || ''
    : request.headers.get('x-base-url') || 'https://api.openai.com/v1';
  return { provider, apiKey, baseURL, model, ...(parseModel ? { parseModel } : {}) };
}

/**
 * Inference base URL for an OrcaRouter configuration.
 *
 * Both OrcaRouter auth choices — a pasted API key and a PKCE-issued key — are
 * ordinary OrcaRouter keys, so they share this one endpoint and the same
 * OpenAI-compatible adapter. Only the way the key was obtained differs.
 */
export function getOrcaRouterApiBase(config: Pick<AIConfig, 'baseURL'>): string {
  const configured = config.baseURL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  }
  return resolveOrcaRouterEndpoints(process.env).apiBase || ORCAROUTER_PUBLIC_API_BASE;
}

export function getModel(config: AIConfig, modelOverride?: string) {
  if (!config.apiKey) {
    throw new AIConfigError('API key is required. Please configure it in Settings.');
  }
  const modelId = modelOverride || config.model;

  // OrcaRouter is OpenAI-compatible, so both authentication choices resolve to
  // the same adapter against the same inference origin.
  if (isOrcaRouterProvider(config.provider)) {
    const p = createOpenAI({ apiKey: config.apiKey, baseURL: getOrcaRouterApiBase(config) });
    return p.chat(modelId);
  }

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
 * OrcaRouter speaks the OpenAI wire format, so it takes the same options.
 */
export function getJsonProviderOptions(config: AIConfig) {
  if (config.provider === 'openai' || isOrcaRouterProvider(config.provider)) {
    return { openai: { response_format: { type: 'json_object' as const } } };
  }
  return {} as Record<string, never>;
}

/**
 * Shape of the input modalities a call is about to send. Used by the model
 * selector so a text-only selection cannot be used for an image upload.
 */
export const MULTIMODAL_ENTRY_MODALITIES = ['image'] as const;

/**
 * Resolve the model for a surface that uploads non-text input.
 *
 * For OrcaRouter the text and multimodal catalogs are filtered separately, so a
 * text model is not a safe fallback: rather than send page images to a model
 * that never declared image input, refuse and tell the user which control to
 * set. Other providers keep their existing single-model behaviour.
 */
export function getParseModel(config: AIConfig) {
  if (!isOrcaRouterProvider(config.provider)) {
    return getModel(config);
  }
  const parseModel = config.parseModel?.trim();
  if (!parseModel) {
    throw new AIConfigError(
      'No multimodal model is selected for resume parsing. Pick one under Settings → AI → Multimodal model.'
    );
  }
  return getModel(config, parseModel);
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}
