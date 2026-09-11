import { NextRequest } from 'next/server';
import {
  ORCAROUTER_PUBLIC_API_BASE,
  discoverOrcaModels,
  isOrcaRouterProvider,
  resolveOrcaRouterEndpoints,
  type OrcaCapability,
  type OrcaModality,
} from '@/lib/ai/orcarouter';

/**
 * Model discovery proxy.
 *
 * The browser never talks to a provider for discovery: it calls this route with
 * the `x-api-key` header the rest of the app already uses, and the server holds
 * the key for the duration of the request. That boundary is unchanged — what is
 * new is that OrcaRouter answers with capability metadata, so each AI surface
 * gets a filtered catalog rather than one flat list.
 *
 * `?capability=` selects the surface. `?input=` adds the non-text modalities the
 * caller is about to upload (multimodal surfaces only).
 */

const ALLOWED_CAPABILITIES: OrcaCapability[] = [
  'text',
  'multimodal',
  'embedding',
  'image',
  'video',
  'rerank',
];

const ALLOWED_MODALITIES: OrcaModality[] = ['text', 'image', 'audio', 'video', 'file'];

function parseCapability(value: string | null): OrcaCapability | null {
  if (!value) return null;
  return ALLOWED_CAPABILITIES.includes(value as OrcaCapability)
    ? (value as OrcaCapability)
    : null;
}

function parseInputModalities(value: string | null): OrcaModality[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is OrcaModality => ALLOWED_MODALITIES.includes(v as OrcaModality));
}

export async function GET(request: NextRequest) {
  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const baseURL = request.headers.get('x-base-url') || '';
  const capability = parseCapability(request.nextUrl.searchParams.get('capability'));
  const inputModalities = parseInputModalities(request.nextUrl.searchParams.get('input'));

  // --- OrcaRouter: capability-aware discovery with a verified fallback ------
  if (isOrcaRouterProvider(provider)) {
    const apiBase = baseURL.trim()
      ? baseURL.replace(/\/+$/, '')
      : resolveOrcaRouterEndpoints(process.env).apiBase || ORCAROUTER_PUBLIC_API_BASE;

    // No capability asked for → report the origins only, never a flat list that
    // a caller could mistake for a text catalog.
    if (!capability) {
      return Response.json({
        models: [],
        source: 'seed',
        reason: 'missing_capability',
        apiOrigin: new URL(apiBase).origin,
      });
    }

    const requiredInputModalities =
      capability === 'multimodal'
        ? (inputModalities.length > 0 ? inputModalities : (['image'] as OrcaModality[]))
        : undefined;

    const result = await discoverOrcaModels({
      apiBase,
      apiKey,
      capability,
      ...(requiredInputModalities ? { requiredInputModalities } : {}),
    });

    return Response.json({
      models: result.models.map((m) => ({
        id: m.id,
        name: m.name,
        contextLength: m.contextLength,
        maxCompletionTokens: m.maxCompletionTokens,
        inputModalities: m.inputModalities,
        outputModalities: m.outputModalities,
        endpointTypes: m.endpointTypes,
        ...(m.reasoningEfforts ? { reasoningEfforts: m.reasoningEfforts } : {}),
      })),
      source: result.source,
      ...(result.reason ? { reason: result.reason } : {}),
      capability,
      apiOrigin: new URL(apiBase).origin,
    });
  }

  // --- Existing providers: unchanged behaviour -----------------------------
  if (!apiKey) {
    return Response.json({ models: [] });
  }

  try {
    let models: { id: string }[] = [];

    switch (provider) {
      case 'anthropic': {
        const url = baseURL
          ? `${baseURL.replace(/\/$/, '')}/v1/models`
          : 'https://api.anthropic.com/v1/models';
        const res = await fetch(url, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (!res.ok) return Response.json({ models: [] });
        const data = await res.json();
        models = (data.data ?? []).map((m: { id: string }) => ({ id: m.id }));
        break;
      }

      case 'gemini': {
        const url = baseURL
          ? `${baseURL.replace(/\/$/, '')}/models?key=${apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return Response.json({ models: [] });
        const data = await res.json();
        models = (data.models ?? []).map((m: { name: string }) => ({
          id: m.name.replace(/^models\//, ''),
        }));
        break;
      }

      default: {
        // openai
        const effectiveBaseURL = baseURL || 'https://api.openai.com/v1';
        const res = await fetch(`${effectiveBaseURL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return Response.json({ models: [] });
        const data = await res.json();
        models = (data.data ?? data).map((m: { id: string }) => ({ id: m.id }));
        break;
      }
    }

    return Response.json({ models });
  } catch {
    return Response.json({ models: [] });
  }
}
