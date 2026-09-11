/**
 * OAuth 2.0 + PKCE for OrcaRouter — Flow B, out-of-band code.
 *
 * Flow B is chosen because JadeAI is self-hosted software whose address differs
 * on every deployment (Docker container, Electron desktop client, LAN dev
 * server). In the Docker shape the browser runs on the host while this process
 * runs inside the container, so a `127.0.0.1:<port>` listener is not reachable
 * from the browser that approves the request. Flow B needs no registered
 * redirect URI and behaves identically across web, Docker and desktop.
 *
 * Consequences that this module enforces:
 *
 * - `code_challenge_method=S256` is mandatory for a code a human can read off a
 *   screen, so it is sent unconditionally.
 * - A fresh verifier and state come from the CSPRNG on every attempt.
 * - The verifier never enters a URL, a log line, or an error message. Only the
 *   challenge travels on the authorize URL.
 * - There is no client secret and no refresh grant. The exchange yields a
 *   durable OrcaRouter API key which is reused until the user revokes it.
 *
 * Server-only: imports `node:crypto`.
 */

import crypto from 'node:crypto';
import {
  ORCAROUTER_SCOPE,
  buildAuthorizeUrl,
  buildExchangeUrl,
  type OrcaCapability,
} from './orcarouter';

/** Unpadded base64url. */
export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

/** `base64url(sha256(verifier))`, no padding — the S256 challenge. */
export function codeChallengeS256(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier, 'utf8').digest());
}

export interface PkcePair {
  /** Never logged, never placed in a URL, never returned to the browser. */
  verifier: string;
  challenge: string;
  state: string;
}

/** A fresh verifier/state pair. Cryptographic RNG, every single attempt. */
export function createPkcePair(): PkcePair {
  const verifier = base64url(crypto.randomBytes(32));
  const state = base64url(crypto.randomBytes(16));
  return { verifier, challenge: codeChallengeS256(verifier), state };
}

/** Constant-time comparison for the echoed `state` (Flow A) / form state. */
export function safeStateEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface AuthorizeUrlInput {
  authBase: string;
  challenge: string;
  state: string;
  appName: string;
  scope?: string;
  loginHint?: string;
  workspaceHint?: string;
  /** Flow B: the literal `oob`. Flow A: an http(s) callback URL. */
  callbackUrl?: string;
}

/**
 * Build the consent-screen URL. Uses the literal `oob` callback for Flow B so
 * the mode is requested rather than guessed, and always sends S256.
 */
export function buildAuthorizeRequest(input: AuthorizeUrlInput): string {
  const params = new URLSearchParams();
  params.set('callback_url', input.callbackUrl ?? 'oob');
  params.set('code_challenge', input.challenge);
  params.set('code_challenge_method', 'S256');
  params.set('state', input.state);
  params.set('app_name', input.appName);
  params.set('scope', input.scope ?? ORCAROUTER_SCOPE);
  if (input.loginHint) params.set('login_hint', input.loginHint);
  if (input.workspaceHint) params.set('workspace_hint', input.workspaceHint);
  return buildAuthorizeUrl(input.authBase, params);
}

// ---------------------------------------------------------------------------
// Exchange
// ---------------------------------------------------------------------------

export type OrcaExchangeFailure =
  | 'denied'
  | 'invalid_grant'
  | 'challenge_mismatch'
  | 'rate_limited'
  | 'auth'
  | 'network'
  | 'malformed';

export interface OrcaExchangeSuccess {
  ok: true;
  key: string;
  userId?: string;
  scope: string;
  /** True when the granted scope cannot cover this app's own use. */
  scopeInsufficient: boolean;
}

export interface OrcaExchangeError {
  ok: false;
  failure: OrcaExchangeFailure;
  /** User-actionable, credential-free message. */
  message: string;
  status?: number;
}

export type OrcaExchangeResult = OrcaExchangeSuccess | OrcaExchangeError;

export interface ExchangeResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type ExchangeFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<ExchangeResponseLike>;

export interface ExchangeOptions {
  authBase: string;
  code: string;
  verifier: string;
  /** Only `api` is usable by this app; anything narrower is reported. */
  requiredScope?: string;
  fetchImpl?: ExchangeFetch;
  timeoutMs?: number;
}

/**
 * Map an exchange failure to a user-facing message. Deliberately never echoes
 * the response body: it can contain the code or a partially-issued credential.
 */
function describeFailure(status: number): OrcaExchangeError {
  if (status === 400) {
    return {
      ok: false,
      failure: 'challenge_mismatch',
      status,
      message:
        'OrcaRouter rejected the PKCE challenge for this request. Start the connection again.',
    };
  }
  if (status === 403) {
    return {
      ok: false,
      failure: 'invalid_grant',
      status,
      message:
        'That authorization code is unknown, already used, or expired. Authorization codes are single-use and valid for 10 minutes — start over and paste the new code.',
    };
  }
  if (status === 429) {
    return {
      ok: false,
      failure: 'rate_limited',
      status,
      message:
        'OrcaRouter is rate-limiting new authorizations for this account (10 per 24 hours). Reuse the stored credential, or paste an API key instead.',
    };
  }
  if (status === 401) {
    return {
      ok: false,
      failure: 'auth',
      status,
      message: 'OrcaRouter refused the exchange. Start the connection again.',
    };
  }
  return {
    ok: false,
    failure: 'network',
    status,
    message: `Could not reach OrcaRouter to exchange the code (HTTP ${status}).`,
  };
}

/**
 * POST the code + verifier to the auth origin's `/api/v1/auth/keys`.
 *
 * Note the path: the relay is at `api.orcarouter.ai/v1`, but authentication is
 * on `www.orcarouter.ai` under `/api/v1/auth`. `…/v1/auth/keys` is a 404.
 */
export async function exchangeCodeForApiKey(
  options: ExchangeOptions
): Promise<OrcaExchangeResult> {
  const {
    authBase,
    code,
    verifier,
    requiredScope = ORCAROUTER_SCOPE,
    timeoutMs = 30_000,
  } = options;

  const trimmed = (code ?? '').trim();
  if (!trimmed) {
    return {
      ok: false,
      failure: 'denied',
      message: 'No authorization code was provided.',
    };
  }

  const doFetch: ExchangeFetch =
    options.fetchImpl ??
    ((url, init) => fetch(url, init) as unknown as Promise<ExchangeResponseLike>);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await doFetch(buildExchangeUrl(authBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: trimmed,
        code_verifier: verifier,
        code_challenge_method: 'S256',
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!res.ok) return describeFailure(res.status);

    const raw = await res.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        failure: 'malformed',
        message: 'OrcaRouter returned a response this app could not read. Nothing was stored.',
      };
    }

    const key = typeof payload.key === 'string' ? payload.key.trim() : '';
    if (!key) {
      return {
        ok: false,
        failure: 'malformed',
        message:
          'OrcaRouter did not return an API key for that authorization. Nothing was stored.',
      };
    }

    // The response reports the scope that was *granted*, which may be narrower
    // than what we asked for. Report that rather than assume we hold more.
    const scope = typeof payload.scope === 'string' ? payload.scope : '';
    return {
      ok: true,
      key,
      userId: typeof payload.user_id === 'string' ? payload.user_id : undefined,
      scope,
      scopeInsufficient: scope !== requiredScope,
    };
  } catch {
    return {
      ok: false,
      failure: 'network',
      message: 'Could not reach OrcaRouter to exchange the code. Check your connection and retry.',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Credential lifecycle
// ---------------------------------------------------------------------------

/** Stable identity of one stored credential, used for generation-safe 401s. */
export interface CredentialGeneration {
  provider: string;
  /** Monotonic counter bumped on every successful (re)authorization. */
  generation: number;
}

export type AuthFailureKind = 'needs_reauth' | 'rate_limited' | 'transient' | 'fatal';

/**
 * Classify an upstream rejection. A durable key grant has no refresh endpoint,
 * so a 401/403 is terminal for *that* credential: mark it for reauthentication
 * and stop. Never synthesize a refresh attempt.
 */
export function classifyOrcaAuthFailure(status: number): AuthFailureKind {
  if (status === 401 || status === 403) return 'needs_reauth';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'transient';
  return 'fatal';
}

/**
 * Apply a reauth verdict to a credential store, generation-safely. Only the
 * exact generation that produced the rejected request may be marked, so a late
 * failure from an old request cannot invalidate a freshly reauthorized key.
 */
export function markNeedsReauth<T extends CredentialGeneration>(
  credentials: T[],
  rejected: CredentialGeneration
): T[] {
  return credentials.map((credential) =>
    credential.provider === rejected.provider &&
    credential.generation === rejected.generation
      ? ({ ...credential, needsReauth: true } as T)
      : credential
  );
}

/** Whether a resolved credential may be used for an inference call. */
export function isCredentialUsable(credential: CredentialGeneration & {
  needsReauth?: boolean;
}): boolean {
  return !credential.needsReauth;
}

// ---------------------------------------------------------------------------
// Login-attempt registry (server side of the GUI lifecycle)
// ---------------------------------------------------------------------------

export interface PendingLogin {
  capability: OrcaCapability;
  generation: number;
  createdAt: number;
}

/**
 * Tracks in-flight authorizations per user so a cancel can release the lock.
 *
 * The generation counter is monotonic: a response that arrives for an older
 * attempt can never overwrite the state of a newer one, and cancelling an old
 * attempt never cancels the new one.
 */
export class PendingLoginRegistry {
  private byUser = new Map<string, PendingLogin>();

  begin(userKey: string, capability: OrcaCapability, now: number): PendingLogin {
    const previous = this.byUser.get(userKey);
    const generation = (previous?.generation ?? 0) + 1;
    const pending: PendingLogin = { capability, generation, createdAt: now };
    this.byUser.set(userKey, pending);
    return pending;
  }

  /** Cancel only when the caller is cancelling the attempt it actually owns. */
  cancel(userKey: string, generation?: number): boolean {
    const current = this.byUser.get(userKey);
    if (!current) return false;
    if (typeof generation === 'number' && current.generation !== generation) {
      return false;
    }
    this.byUser.delete(userKey);
    return true;
  }

  /** Complete an attempt. A stale generation is refused, not applied. */
  complete(userKey: string, generation: number): boolean {
    const current = this.byUser.get(userKey);
    if (!current || current.generation !== generation) return false;
    this.byUser.delete(userKey);
    return true;
  }

  current(userKey: string): PendingLogin | undefined {
    return this.byUser.get(userKey);
  }

  isCurrent(userKey: string, generation: number): boolean {
    return this.byUser.get(userKey)?.generation === generation;
  }
}
