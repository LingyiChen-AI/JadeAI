import { NextRequest } from 'next/server';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import {
  ORCAROUTER_APP_NAME,
  ORCAROUTER_SCOPE,
  resolveOrcaRouterEndpoints,
  type OrcaCapability,
} from '@/lib/ai/orcarouter';
import {
  PendingLoginRegistry,
  buildAuthorizeRequest,
  createPkcePair,
  exchangeCodeForApiKey,
  safeStateEquals,
} from '@/lib/ai/orcarouter-pkce';

/**
 * Server side of "Connect with OrcaRouter" (OAuth 2.0 + PKCE, Flow B).
 *
 * The verifier never leaves this process. The browser receives only the
 * authorize URL (which carries the S256 challenge) and, after a successful
 * exchange, the OrcaRouter API key — the same kind of credential the manual
 * API-key path produces.
 *
 * The in-flight registry is process-local on purpose: it exists to release the
 * "authorization already pending" lock on cancel, not to persist anything.
 */

const pendingLogins = new PendingLoginRegistry();

/** Verifier/state for one in-flight attempt, keyed by user + generation. */
interface PendingAttempt {
  verifier: string;
  state: string;
  generation: number;
  createdAt: number;
}

const attempts = new Map<string, PendingAttempt>();
const ATTEMPT_TTL_MS = 15 * 60 * 1000;

function attemptKey(userKey: string, generation: number): string {
  return `${userKey}:${generation}`;
}

function sweepExpired(now: number) {
  for (const [key, attempt] of attempts) {
    if (now - attempt.createdAt > ATTEMPT_TTL_MS) attempts.delete(key);
  }
}

/** Keep the capability list closed so a caller cannot widen the catalog query. */
const ALLOWED_CAPABILITIES: OrcaCapability[] = [
  'text',
  'multimodal',
  'embedding',
  'image',
  'video',
  'rerank',
];

function parseCapability(value: unknown): OrcaCapability {
  return ALLOWED_CAPABILITIES.includes(value as OrcaCapability)
    ? (value as OrcaCapability)
    : 'text';
}

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    const userKey = String(user.id);

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const action = typeof body.action === 'string' ? body.action : 'start';
    const { authBase } = resolveOrcaRouterEndpoints(process.env);

    if (action === 'cancel') {
      const generation =
        typeof body.generation === 'number' ? body.generation : undefined;
      const released = pendingLogins.cancel(userKey, generation);
      if (typeof generation === 'number') {
        attempts.delete(attemptKey(userKey, generation));
      }
      return Response.json({ cancelled: released });
    }

    if (action === 'exchange') {
      const code = typeof body.code === 'string' ? body.code : '';
      const generation =
        typeof body.generation === 'number' ? body.generation : undefined;
      const state = typeof body.state === 'string' ? body.state : '';

      if (typeof generation !== 'number') {
        return Response.json({ error: 'missing_generation' }, { status: 400 });
      }
      // A stale exchange must not touch anything: the user has already started
      // (or finished) a newer attempt.
      if (!pendingLogins.isCurrent(userKey, generation)) {
        return Response.json({ error: 'stale_attempt' }, { status: 409 });
      }

      const attempt = attempts.get(attemptKey(userKey, generation));
      if (!attempt) {
        return Response.json({ error: 'no_pending_attempt' }, { status: 409 });
      }

      // The authorize URL echoes `state` back through the consent screen; the
      // user pastes back a code. Compare the state when the UI supplies it so a
      // code some other page minted cannot be redeemed here.
      if (state && !safeStateEquals(state, attempt.state)) {
        return Response.json({ error: 'state_mismatch' }, { status: 400 });
      }

      const result = await exchangeCodeForApiKey({
        authBase,
        code,
        verifier: attempt.verifier,
      });

      // Consume the attempt either way: an auth code is single-use, and a
      // failed exchange must not leave a verifier lying around.
      attempts.delete(attemptKey(userKey, generation));
      pendingLogins.complete(userKey, generation);

      if (!result.ok) {
        return Response.json(
          { error: result.failure, message: result.message },
          { status: result.failure === 'network' ? 502 : 400 }
        );
      }

      return Response.json({
        key: result.key,
        scope: result.scope,
        scopeInsufficient: result.scopeInsufficient,
        requiredScope: ORCAROUTER_SCOPE,
        userId: result.userId,
        generation,
      });
    }

    // action === 'start'
    const now = Date.now();
    sweepExpired(now);

    const capability = parseCapability(body.capability);
    const loginHint = typeof body.loginHint === 'string' ? body.loginHint : undefined;
    const workspaceHint =
      typeof body.workspaceHint === 'string' ? body.workspaceHint : undefined;

    const pending = pendingLogins.begin(userKey, capability, now);
    const pair = createPkcePair();

    attempts.set(attemptKey(userKey, pending.generation), {
      verifier: pair.verifier,
      state: pair.state,
      generation: pending.generation,
      createdAt: now,
    });

    const authorizeUrl = buildAuthorizeRequest({
      authBase,
      challenge: pair.challenge,
      state: pair.state,
      appName: ORCAROUTER_APP_NAME,
      scope: ORCAROUTER_SCOPE,
      loginHint,
      workspaceHint,
    });

    return Response.json({
      authorizeUrl,
      state: pair.state,
      generation: pending.generation,
      authOrigin: new URL(authBase).origin,
      expiresInSeconds: Math.floor(ATTEMPT_TTL_MS / 1000),
    });
  } catch {
    return Response.json({ error: 'connect_failed' }, { status: 500 });
  }
}

/** Read-only status so the UI can tell whether it holds a live attempt. */
export async function GET(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    const pending = pendingLogins.current(String(user.id));
    const { authBase, apiBase } = resolveOrcaRouterEndpoints(process.env);
    return Response.json({
      pending: pending
        ? { capability: pending.capability, generation: pending.generation }
        : null,
      authOrigin: new URL(authBase).origin,
      apiOrigin: new URL(apiBase).origin,
      appName: ORCAROUTER_APP_NAME,
      scope: ORCAROUTER_SCOPE,
    });
  } catch {
    return Response.json({ error: 'status_failed' }, { status: 500 });
  }
}
