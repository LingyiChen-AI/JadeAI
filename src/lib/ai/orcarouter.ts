/**
 * OrcaRouter provider support: origins, capability filtering, and the verified
 * cold-start catalog.
 *
 * OrcaRouter is an OpenAI-compatible gateway. Authentication and inference live
 * on *different* public origins — `https://www.orcarouter.ai` serves the consent
 * screen and `/api/v1/auth/keys`, while `https://api.orcarouter.ai/v1` serves
 * inference and the model catalog. Never derive one from the other by swapping a
 * hostname or appending `/v1`.
 *
 * This module is imported from both the browser bundle and server routes, so it
 * must stay free of Node-only imports. The PKCE machinery lives in
 * `./orcarouter-pkce`.
 */

/** Provider IDs. OrcaRouter is a first-class provider with two auth choices. */
export const ORCAROUTER_API_PROVIDER = 'orcarouter';
export const ORCAROUTER_OAUTH_PROVIDER = 'orcarouter-oauth';

export type OrcaRouterProviderId =
  | typeof ORCAROUTER_API_PROVIDER
  | typeof ORCAROUTER_OAUTH_PROVIDER;

export const ORCAROUTER_PROVIDER_IDS: OrcaRouterProviderId[] = [
  ORCAROUTER_API_PROVIDER,
  ORCAROUTER_OAUTH_PROVIDER,
];

export function isOrcaRouterProvider(provider: string): provider is OrcaRouterProviderId {
  return (ORCAROUTER_PROVIDER_IDS as string[]).includes(provider);
}

/** Public defaults. Authentication and inference are separate origins. */
export const ORCAROUTER_PUBLIC_AUTH_BASE = 'https://www.orcarouter.ai';
export const ORCAROUTER_PUBLIC_API_BASE = 'https://api.orcarouter.ai/v1';

/** Authorize screen path (fixed) and code-exchange path (fixed). */
export const ORCAROUTER_AUTHORIZE_PATH = '/auth';
export const ORCAROUTER_EXCHANGE_PATH = '/api/v1/auth/keys';

/**
 * Keyboard/UX links. The console is where a user revokes a key they handed us.
 */
export const ORCAROUTER_KEY_CONSOLE_URL =
  'https://www.orcarouter.ai/console/authorized-apps';
export const ORCAROUTER_KEYS_URL = 'https://www.orcarouter.ai/console/api-keys';

export const ORCAROUTER_APP_NAME = 'JadeAI';

/** Official OrcaRouter logo, used for both authentication entries. */
export const ORCAROUTER_LOGO_URL = 'https://www.orcarouter.ai/orca-logo-classic.png';

/** Scope we ask for, and the only scope we accept back for our own use. */
export const ORCAROUTER_SCOPE = 'api';

// ---------------------------------------------------------------------------
// Origin resolution
// ---------------------------------------------------------------------------

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Remote origins must be HTTPS; plain HTTP is tolerated only for loopback
 * development. Returns the normalized origin, or null when the value is
 * unusable so the caller can fall back to the public default.
 */
export function normalizeOrcaOrigin(
  raw: string | undefined | null
): { origin: string; insecure: boolean } | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) return null;
  return {
    origin: stripTrailingSlash(url.origin + url.pathname),
    insecure: url.protocol === 'http:',
  };
}

export interface OrcaRouterEndpoints {
  /** Auth origin, no trailing slash: consent screen and code exchange. */
  authBase: string;
  /** Inference base, including the `/v1` segment where applicable. */
  apiBase: string;
}

/**
 * `ORCA_BASE_URL` is a shared self-hosted fallback; the explicit
 * `ORCA_AUTH_BASE_URL` / `ORCA_API_BASE_URL` overrides win over it, and the
 * shared value wins over the public default.
 */
export function resolveOrcaRouterEndpoints(
  env: Record<string, string | undefined> = {}
): OrcaRouterEndpoints {
  const shared = normalizeOrcaOrigin(env.ORCA_BASE_URL);
  const auth = normalizeOrcaOrigin(env.ORCA_AUTH_BASE_URL);
  const api = normalizeOrcaOrigin(env.ORCA_API_BASE_URL);

  const authBase = auth?.origin ?? shared?.origin ?? ORCAROUTER_PUBLIC_AUTH_BASE;
  const apiBase = api?.origin ?? shared?.origin ?? ORCAROUTER_PUBLIC_API_BASE;

  return { authBase, apiBase };
}

/** Absolute consent-screen URL for an authorize query string. */
export function buildAuthorizeUrl(authBase: string, params: URLSearchParams): string {
  return `${stripTrailingSlash(authBase)}${ORCAROUTER_AUTHORIZE_PATH}?${params.toString()}`;
}

/** Absolute code-exchange URL. This is on the auth origin, never the relay. */
export function buildExchangeUrl(authBase: string): string {
  return `${stripTrailingSlash(authBase)}${ORCAROUTER_EXCHANGE_PATH}`;
}

/** Absolute catalog URL for a capability query on the inference origin. */
export function buildCatalogUrl(apiBase: string, capability: OrcaCapability): string {
  const base = stripTrailingSlash(apiBase);
  return `${base}/models?capability=${CATALOG_QUERY[capability]}`;
}

// ---------------------------------------------------------------------------
// Capability model
// ---------------------------------------------------------------------------

/**
 * The AI surfaces JadeAI actually exposes. Each one filters the catalog
 * differently; they must not share one flat list.
 */
export type OrcaCapability =
  | 'text'
  | 'multimodal'
  | 'embedding'
  | 'image'
  | 'video'
  | 'rerank';

/**
 * Server-side `?capability=` query value. Chat-shaped surfaces (including
 * multimodal understanding) all query `chat` and then filter on the declared
 * input modalities; that is a superset query with an exact client-side filter.
 */
export const CATALOG_QUERY: Record<OrcaCapability, string> = {
  text: 'chat',
  multimodal: 'chat',
  embedding: 'embedding',
  image: 'image',
  video: 'video',
  rerank: 'rerank',
};

/** Endpoint types the OpenAI-compatible chat adapter can actually speak. */
const CHAT_ENDPOINT_TYPES = new Set([
  'openai',
  'anthropic',
  'gemini',
  'openai-response',
]);

/** Endpoint types that mean "not a text chat model" whatever else is listed. */
const NON_TEXT_ENDPOINT_TYPES = new Set([
  'image-generation',
  'openai-video',
  'jina-rerank',
  'embeddings',
]);

export type OrcaModality = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface OrcaCatalogModel {
  id: string;
  name?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  inputModalities: OrcaModality[];
  outputModalities: OrcaModality[];
  endpointTypes: string[];
  /** Reasoning effort ladder, when the catalog (or verified seed) declares one. */
  reasoningEfforts?: string[];
}

const MODALITY_VALUES = new Set<string>(['text', 'image', 'audio', 'video', 'file']);

/** Bound the catalog: a hostile or broken response must not consume memory. */
export const CATALOG_MAX_ITEMS = 2000;
export const CATALOG_MAX_BYTES = 2 * 1024 * 1024;
export const CATALOG_TIMEOUT_MS = 10_000;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asModalities(value: unknown): OrcaModality[] {
  return asStringArray(value).filter((v): v is OrcaModality => MODALITY_VALUES.has(v));
}

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

/**
 * Normalize one catalog record. Anything that is not an object with a usable
 * string `id` is dropped rather than guessed at.
 */
export function parseCatalogModel(raw: unknown): OrcaCatalogModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== 'string' || !id.trim()) return null;

  const architecture =
    record.architecture && typeof record.architecture === 'object'
      ? (record.architecture as Record<string, unknown>)
      : {};

  const topProvider =
    record.top_provider && typeof record.top_provider === 'object'
      ? (record.top_provider as Record<string, unknown>)
      : {};

  const contextLength =
    asPositiveInt(record.context_length) ?? asPositiveInt(topProvider.context_length);

  const reasoning = record.reasoning;
  const reasoningEfforts = Array.isArray(reasoning)
    ? asStringArray(reasoning)
    : typeof reasoning === 'string'
      ? asStringArray((reasoning as string).split(',').map((s) => s.trim()))
      : undefined;

  return {
    id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name : undefined,
    contextLength,
    maxCompletionTokens:
      asPositiveInt(record.max_completion_tokens) ??
      asPositiveInt(topProvider.max_completion_tokens),
    inputModalities: asModalities(architecture.input_modalities),
    outputModalities: asModalities(architecture.output_modalities),
    endpointTypes: asStringArray(record.supported_endpoint_types),
    ...(reasoningEfforts && reasoningEfforts.length > 0 ? { reasoningEfforts } : {}),
  };
}

/** Parse a `GET /v1/models` envelope, tolerating both `data` and `models`. */
export function parseCatalogResponse(payload: unknown): OrcaCatalogModel[] {
  const envelope =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const list = Array.isArray(envelope.data)
    ? envelope.data
    : Array.isArray(envelope.models)
      ? envelope.models
      : [];

  const out: OrcaCatalogModel[] = [];
  for (const item of list.slice(0, CATALOG_MAX_ITEMS)) {
    const model = parseCatalogModel(item);
    if (model) out.push(model);
  }
  return out;
}

export interface CapabilityFilterOptions {
  /**
   * Non-text modalities the calling surface actually uploads. A model is only
   * eligible when it *declares* every one of them. Undeclared means fail
   * closed — we never infer capability from a model name.
   */
  requiredInputModalities?: OrcaModality[];
}

function isNonTextSpecialist(model: OrcaCatalogModel): boolean {
  return model.endpointTypes.some((t) => NON_TEXT_ENDPOINT_TYPES.has(t));
}

function hasChatEndpoint(model: OrcaCatalogModel): boolean {
  return model.endpointTypes.some((t) => CHAT_ENDPOINT_TYPES.has(t));
}

/** Shared gate for the two chat-shaped surfaces. */
function isSelectableChatModel(model: OrcaCatalogModel): boolean {
  if (!hasChatEndpoint(model)) return false;
  if (isNonTextSpecialist(model)) return false;
  // Image-emitting chat models have no place in a prose dropdown.
  if (model.outputModalities.includes('image')) return false;
  return true;
}

/**
 * Filter a catalog down to the models a given AI surface can actually use.
 *
 * Every branch is driven by declared catalog metadata. A model whose metadata is
 * missing never qualifies: fail closed.
 */
export function filterModelsByCapability(
  models: OrcaCatalogModel[],
  capability: OrcaCapability,
  options: CapabilityFilterOptions = {}
): OrcaCatalogModel[] {
  switch (capability) {
    case 'text':
      return models.filter(isSelectableChatModel);

    case 'multimodal': {
      const required = options.requiredInputModalities ?? ['image'];
      return models.filter(
        (m) =>
          isSelectableChatModel(m) &&
          // Declared capability only; undeclared modalities fail closed.
          required.every((modality) => m.inputModalities.includes(modality))
      );
    }

    case 'embedding':
      return models.filter((m) => m.endpointTypes.includes('embeddings'));

    case 'image':
      return models.filter((m) => m.endpointTypes.includes('image-generation'));

    case 'video':
      return models.filter((m) => m.endpointTypes.includes('openai-video'));

    case 'rerank':
      return models.filter((m) => m.endpointTypes.includes('jina-rerank'));

    default:
      return [];
  }
}

/** Server-side guard: is this model usable for this surface right now? */
export function isModelCompatible(
  model: OrcaCatalogModel,
  capability: OrcaCapability,
  options: CapabilityFilterOptions = {}
): boolean {
  return filterModelsByCapability([model], capability, options).length > 0;
}

// ---------------------------------------------------------------------------
// Verified cold-start catalog
// ---------------------------------------------------------------------------

/**
 * Small, verified seed so a fresh install can pick a model before any network
 * call succeeds, and so a catalog outage is a degraded state rather than an
 * empty dropdown. Every ID and every metadata field below was checked against
 * the live `GET https://api.orcarouter.ai/v1/models` response; live discovery
 * replaces this list wholesale when it succeeds.
 */
export const ORCAROUTER_FALLBACK_MODELS: OrcaCatalogModel[] = [
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    contextLength: 272000,
    maxCompletionTokens: 128000,
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    endpointTypes: ['openai', 'openai-response'],
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'Anthropic: Claude Opus 4.8',
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    endpointTypes: ['openai', 'anthropic', 'openai-response'],
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    inputModalities: ['text', 'image', 'video', 'audio', 'file'],
    outputModalities: ['text'],
    endpointTypes: ['openai', 'gemini'],
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: DeepSeek V4 Pro',
    contextLength: 1048576,
    maxCompletionTokens: 384000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    endpointTypes: ['openai', 'openai-response'],
  },
  {
    id: 'orcarouter/auto',
    name: 'OrcaRouter Auto',
    inputModalities: ['text'],
    outputModalities: ['text'],
    endpointTypes: ['openai', 'openai-response', 'anthropic', 'gemini'],
  },
];

/** Default model for a brand-new OrcaRouter configuration. */
export const ORCAROUTER_DEFAULT_MODEL = 'orcarouter/auto';

/** The seed, filtered to what a surface can use. Never merged into live data. */
export function fallbackModelsFor(
  capability: OrcaCapability,
  options: CapabilityFilterOptions = {}
): OrcaCatalogModel[] {
  return filterModelsByCapability(ORCAROUTER_FALLBACK_MODELS, capability, options);
}

/** Where a catalog came from. `seed` means discovery failed and we degraded. */
export type OrcaCatalogSource = 'live' | 'seed';

export interface OrcaCatalogResult {
  models: OrcaCatalogModel[];
  source: OrcaCatalogSource;
  /** Present when `source === 'seed'`: why live discovery was not used. */
  reason?: 'missing_key' | 'auth' | 'network' | 'malformed';
}

/** Minimal response surface so this works against `fetch` and test doubles. */
export interface CatalogFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type CatalogFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<CatalogFetchResponse>;

export interface DiscoverOptions {
  apiBase: string;
  apiKey: string;
  capability: OrcaCapability;
  requiredInputModalities?: OrcaModality[];
  fetchImpl?: CatalogFetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Live catalog discovery, bounded on every axis: timeout, response size, item
 * count and accepted item shape. On any failure we return the verified seed and
 * say why, so the UI can render a degraded state instead of an empty list.
 */
export async function discoverOrcaModels(
  options: DiscoverOptions
): Promise<OrcaCatalogResult> {
  const {
    apiBase,
    apiKey,
    capability,
    requiredInputModalities,
    timeoutMs = CATALOG_TIMEOUT_MS,
    maxBytes = CATALOG_MAX_BYTES,
  } = options;

  const filterOptions: CapabilityFilterOptions = requiredInputModalities
    ? { requiredInputModalities }
    : {};

  if (!apiKey) {
    return {
      models: fallbackModelsFor(capability, filterOptions),
      source: 'seed',
      reason: 'missing_key',
    };
  }

  const doFetch: CatalogFetch =
    options.fetchImpl ??
    ((url, init) => fetch(url, init) as unknown as Promise<CatalogFetchResponse>);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const res = await doFetch(buildCatalogUrl(apiBase, capability), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!res.ok) {
      return {
        models: fallbackModelsFor(capability, filterOptions),
        source: 'seed',
        reason: res.status === 401 || res.status === 403 ? 'auth' : 'network',
      };
    }

    const body = await res.text();
    if (body.length > maxBytes) {
      return {
        models: fallbackModelsFor(capability, filterOptions),
        source: 'seed',
        reason: 'malformed',
      };
    }

    // A body we cannot parse is a malformed catalog, not a network problem:
    // the caller can tell the user to retry rather than check connectivity.
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return {
        models: fallbackModelsFor(capability, filterOptions),
        source: 'seed',
        reason: 'malformed',
      };
    }

    const parsed = parseCatalogResponse(payload);
    if (parsed.length === 0) {
      return {
        models: fallbackModelsFor(capability, filterOptions),
        source: 'seed',
        reason: 'malformed',
      };
    }

    return {
      models: filterModelsByCapability(parsed, capability, filterOptions),
      source: 'live',
    };
  } catch {
    return {
      models: fallbackModelsFor(capability, filterOptions),
      source: 'seed',
      reason: 'network',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Drop a persisted model choice that is no longer compatible, so a saved value
 * from another provider (or from before an attachment was added) can never be
 * silently submitted.
 */
export function reconcileSelectedModel(
  selected: string,
  models: OrcaCatalogModel[],
  capability: OrcaCapability,
  options: CapabilityFilterOptions = {}
): { model: string; cleared: boolean } {
  if (!selected) return { model: selected, cleared: false };
  const compatible = filterModelsByCapability(models, capability, options).some(
    (m) => m.id === selected
  );
  return compatible ? { model: selected, cleared: false } : { model: '', cleared: true };
}
