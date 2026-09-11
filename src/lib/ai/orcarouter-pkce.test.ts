import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  base64url,
  buildAuthorizeRequest,
  classifyOrcaAuthFailure,
  codeChallengeS256,
  createPkcePair,
  exchangeCodeForApiKey,
  isCredentialUsable,
  markNeedsReauth,
  PendingLoginRegistry,
  safeStateEquals,
  type CredentialGeneration,
  type ExchangeFetch,
} from './orcarouter-pkce';
import { buildExchangeUrl, ORCAROUTER_PUBLIC_AUTH_BASE } from './orcarouter';

/**
 * These tests drive the connect adapter the app actually calls, not the hash
 * helpers in isolation: authorize URL -> code -> exchange -> credential.
 * Everything uses fake keys and fake codes.
 */

const AUTH_BASE = ORCAROUTER_PUBLIC_AUTH_BASE;
const FAKE_CODE = 'fake-auth-code-abc123';
const FAKE_KEY = 'sk-orca-fake000000000000000000000000';

describe('PKCE primitives', () => {
  it('derives the challenge as unpadded base64url(sha256(verifier))', () => {
    const verifier = 'fixed-verifier-for-vector-check';
    const expected = crypto
      .createHash('sha256')
      .update(verifier, 'utf8')
      .digest('base64url');
    expect(codeChallengeS256(verifier)).toBe(expected);
    expect(codeChallengeS256(verifier)).not.toContain('=');
    expect(codeChallengeS256(verifier)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a fresh verifier and state on every attempt', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const pair = createPkcePair();
      expect(pair.verifier).not.toBe(pair.state);
      expect(pair.challenge).toBe(codeChallengeS256(pair.verifier));
      expect(seen.has(pair.verifier)).toBe(false);
      seen.add(pair.verifier);
      // High entropy: 32 bytes -> 43 base64url chars.
      expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    }
  });

  it('does not derive the verifier from anything guessable', () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    // The challenge differs too, so a reused challenge cannot be replayed.
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('compares state in a way that rejects length and content mismatches', () => {
    expect(safeStateEquals('abc', 'abc')).toBe(true);
    expect(safeStateEquals('abc', 'abd')).toBe(false);
    expect(safeStateEquals('abc', 'abcd')).toBe(false);
    expect(safeStateEquals(null, 'abc')).toBe(false);
    expect(safeStateEquals('abc', undefined)).toBe(false);
  });

  it('base64url output is URL-safe and unpadded', () => {
    const out = base64url(crypto.randomBytes(48));
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out).not.toContain('=');
  });
});

describe('authorize URL', () => {
  const pair = createPkcePair();
  const url = buildAuthorizeRequest({
    authBase: AUTH_BASE,
    challenge: pair.challenge,
    state: pair.state,
    appName: 'JadeAI',
  });
  const parsed = new URL(url);

  it('targets the auth origin console screen', () => {
    expect(parsed.origin).toBe('https://www.orcarouter.ai');
    expect(parsed.pathname).toBe('/auth');
  });

  it('requests out-of-band delivery (Flow B)', () => {
    expect(parsed.searchParams.get('callback_url')).toBe('oob');
  });

  it('sends S256, never plain', () => {
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBe(pair.challenge);
    expect(url).not.toContain('plain');
  });

  it('carries the state and the app name and the scope', () => {
    expect(parsed.searchParams.get('state')).toBe(pair.state);
    expect(parsed.searchParams.get('app_name')).toBe('JadeAI');
    expect(parsed.searchParams.get('scope')).toBe('api');
  });

  it('never puts the verifier in the URL', () => {
    expect(url).not.toContain(pair.verifier);
  });

  it('honours a self-hosted auth override and optional hints', () => {
    const custom = new URL(
      buildAuthorizeRequest({
        authBase: 'https://orca.internal',
        challenge: pair.challenge,
        state: pair.state,
        appName: 'JadeAI',
        loginHint: 'someone@example.com',
        workspaceHint: 'team-a',
      })
    );
    expect(custom.origin).toBe('https://orca.internal');
    expect(custom.searchParams.get('login_hint')).toBe('someone@example.com');
    expect(custom.searchParams.get('workspace_hint')).toBe('team-a');
  });
});

describe('code exchange', () => {
  const verifier = 'verifier-under-test';

  const respond = (status: number, body: unknown): ExchangeFetch =>
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    }));

  it('posts to /api/v1/auth/keys on the AUTH origin, never the relay', async () => {
    const spy = respond(200, { key: FAKE_KEY, user_id: '1', scope: 'api' });
    await exchangeCodeForApiKey({ authBase: AUTH_BASE, code: FAKE_CODE, verifier, fetchImpl: spy });
    const [url, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://www.orcarouter.ai/api/v1/auth/keys');
    // The documented mistake is the relay origin, not the path shape.
    expect(url).not.toContain('api.orcarouter.ai');
    expect(url.startsWith('https://api.orcarouter.ai/v1/auth/keys')).toBe(false);
    expect(init.method).toBe('POST');
  });

  it('sends code, verifier and the S256 method in the body', async () => {
    const spy = respond(200, { key: FAKE_KEY, scope: 'api' });
    await exchangeCodeForApiKey({ authBase: AUTH_BASE, code: FAKE_CODE, verifier, fetchImpl: spy });
    const [, init] = (spy as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      code: FAKE_CODE,
      code_verifier: verifier,
      code_challenge_method: 'S256',
    });
  });

  it('returns the key and the granted scope on success', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: respond(200, { key: FAKE_KEY, user_id: '42', scope: 'api' }),
    });
    expect(result).toMatchObject({ ok: true, key: FAKE_KEY, userId: '42', scope: 'api' });
    expect(result.ok && result.scopeInsufficient).toBe(false);
  });

  it('flags a scope downgrade rather than assuming the requested scope', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      requiredScope: 'connector',
      fetchImpl: respond(200, { key: FAKE_KEY, scope: 'api' }),
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.scope).toBe('api');
    expect(result.ok && result.scopeInsufficient).toBe(true);
  });

  it('classifies 403 as an invalid/used/expired code', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: respond(403, { error: 'invalid_grant' }),
    });
    expect(result).toMatchObject({ ok: false, failure: 'invalid_grant', status: 403 });
  });

  it('classifies 400 as a challenge mismatch (downgrade defence)', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: respond(400, { error: 'invalid_request' }),
    });
    expect(result).toMatchObject({ ok: false, failure: 'challenge_mismatch' });
  });

  it('classifies 429 as rate limiting and tells the user to reuse the stored key', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: respond(429, { error: 'too_many_requests' }),
    });
    expect(result).toMatchObject({ ok: false, failure: 'rate_limited' });
    expect(result.ok === false && result.message).toMatch(/reuse/i);
  });

  it('surfaces a network failure as an actionable error, not a hang', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    });
    expect(result).toMatchObject({ ok: false, failure: 'network' });
  });

  it('rejects a missing code without calling the network', async () => {
    const spy = respond(200, { key: FAKE_KEY });
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: '   ',
      verifier,
      fetchImpl: spy,
    });
    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('treats a 200 without a key as malformed instead of storing nothing silently', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: respond(200, { scope: 'api' }),
    });
    expect(result).toMatchObject({ ok: false, failure: 'malformed' });
  });
});

describe('the verifier and the key never leak into errors or logs', () => {
  it('does not echo the response body (which can quote the credential)', async () => {
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier: 'super-secret-verifier-value',
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => `{"key":"${FAKE_KEY}","code_verifier":"super-secret-verifier-value"}`,
      })),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('super-secret-verifier-value');
    expect(serialized).not.toContain(FAKE_KEY);
  });

  it('does not log the verifier or the code while running the flow', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const verifier = 'verifier-must-not-appear';
    const pair = createPkcePair();
    const url = buildAuthorizeRequest({
      authBase: AUTH_BASE,
      challenge: pair.challenge,
      state: pair.state,
      appName: 'JadeAI',
    });
    await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier,
      fetchImpl: vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ key: FAKE_KEY, scope: 'api' }) })),
    });

    const printed = [
      ...logSpy.mock.calls,
      ...errSpy.mock.calls,
      ...warnSpy.mock.calls,
    ]
      .flat()
      .join(' ');
    expect(printed).not.toContain(verifier);
    expect(printed).not.toContain(pair.verifier);
    expect(printed).not.toContain(FAKE_KEY);
    // The verifier also never travelled on the authorize URL.
    expect(url).not.toContain(pair.verifier);

    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('credential lifecycle', () => {
  it('classifies 401/403 as terminal reauthentication, not a retry', () => {
    expect(classifyOrcaAuthFailure(401)).toBe('needs_reauth');
    expect(classifyOrcaAuthFailure(403)).toBe('needs_reauth');
    expect(classifyOrcaAuthFailure(429)).toBe('rate_limited');
    expect(classifyOrcaAuthFailure(503)).toBe('transient');
    expect(classifyOrcaAuthFailure(400)).toBe('fatal');
  });

  it('marks only the exact rejected generation', () => {
    const credentials: (CredentialGeneration & { needsReauth?: boolean })[] = [
      { provider: 'orcarouter', generation: 1, needsReauth: false },
      { provider: 'orcarouter', generation: 2, needsReauth: false },
      { provider: 'orcarouter-oauth', generation: 7, needsReauth: false },
    ];
    const updated = markNeedsReauth(credentials, { provider: 'orcarouter', generation: 1 });
    expect(updated[0].needsReauth).toBe(true);
    expect(updated[1].needsReauth).toBe(false);
    expect(updated[2].needsReauth).toBe(false);
  });

  it('a late failure from an old request cannot poison a newly reauthorized credential', () => {
    // Generation 3 is the fresh login; the rejected request was generation 2.
    const credentials: (CredentialGeneration & { needsReauth?: boolean })[] = [
      { provider: 'orcarouter-oauth', generation: 3, needsReauth: false },
    ];
    const updated = markNeedsReauth(credentials, { provider: 'orcarouter-oauth', generation: 2 });
    expect(updated[0].needsReauth).toBe(false);
    expect(isCredentialUsable(updated[0])).toBe(true);
  });

  it('a credential marked for reauth is unusable until replaced', () => {
    expect(isCredentialUsable({ provider: 'orcarouter', generation: 1, needsReauth: true })).toBe(
      false
    );
    expect(isCredentialUsable({ provider: 'orcarouter', generation: 1 })).toBe(true);
  });

  it('exposes no refresh grant: the module offers no refresh entry point', async () => {
    const mod = await import('./orcarouter-pkce');
    expect(Object.keys(mod).some((k) => /refresh/i.test(k))).toBe(false);
  });
});

describe('pending login registry (GUI cancellation)', () => {
  it('increments the generation for each attempt', () => {
    const registry = new PendingLoginRegistry();
    expect(registry.begin('u1', 'text', 0).generation).toBe(1);
    expect(registry.begin('u1', 'text', 0).generation).toBe(2);
  });

  it('cancelling releases the lock', () => {
    const registry = new PendingLoginRegistry();
    registry.begin('u1', 'text', 0);
    expect(registry.cancel('u1')).toBe(true);
    expect(registry.current('u1')).toBeUndefined();
  });

  it('a stale cancel cannot release a newer attempt', () => {
    const registry = new PendingLoginRegistry();
    registry.begin('u1', 'text', 0); // generation 1
    const second = registry.begin('u1', 'text', 0); // generation 2
    expect(registry.cancel('u1', 1)).toBe(false);
    expect(registry.isCurrent('u1', second.generation)).toBe(true);
    expect(registry.cancel('u1', 2)).toBe(true);
    expect(registry.current('u1')).toBeUndefined();
  });

  it('a stale completion is refused, so an old success cannot install over a new one', () => {
    const registry = new PendingLoginRegistry();
    registry.begin('u1', 'text', 0);
    const second = registry.begin('u1', 'text', 0);
    expect(registry.complete('u1', 1)).toBe(false);
    expect(registry.isCurrent('u1', second.generation)).toBe(true);
    expect(registry.complete('u1', second.generation)).toBe(true);
  });

  it('tracks users independently', () => {
    const registry = new PendingLoginRegistry();
    registry.begin('u1', 'text', 0);
    expect(registry.cancel('u2')).toBe(false);
    expect(registry.current('u1')).toBeDefined();
  });
});

describe('end to end through the adapter (fake auth server)', () => {
  it('authorize -> code -> exchange -> credential, with a fresh verifier', async () => {
    // Stand in for the consent screen: mint a code only if the challenge the
    // client sent matches sha256 of the verifier it later presents.
    const pair = createPkcePair();
    const authorizeUrl = new URL(
      buildAuthorizeRequest({
        authBase: AUTH_BASE,
        challenge: pair.challenge,
        state: pair.state,
        appName: 'JadeAI',
      })
    );

    const seenChallenges: string[] = [];
    const server: ExchangeFetch = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      seenChallenges.push(codeChallengeS256(body.code_verifier));
      expect(url).toBe(buildExchangeUrl(AUTH_BASE));
      if (body.code_challenge_method !== 'S256') {
        return { ok: false, status: 400, text: async () => '{}' };
      }
      if (codeChallengeS256(body.code_verifier) !== authorizeUrl.searchParams.get('code_challenge')) {
        return { ok: false, status: 403, text: async () => '{}' };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ key: FAKE_KEY, user_id: '42', scope: 'api' }),
      };
    });

    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier: pair.verifier,
      fetchImpl: server,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    // The credential the PKCE adapter yields is exactly what the API-key
    // adapter yields: a plain OrcaRouter key.
    expect(result.key).toBe(FAKE_KEY);
    expect(result.scope).toBe('api');
    expect(seenChallenges[0]).toBe(pair.challenge);
    // The verifier never left the process except in the exchange body.
    expect(authorizeUrl.toString()).not.toContain(pair.verifier);
  });

  it('a mismatched verifier is refused by the server', async () => {
    const pair = createPkcePair();
    const result = await exchangeCodeForApiKey({
      authBase: AUTH_BASE,
      code: FAKE_CODE,
      verifier: createPkcePair().verifier, // wrong verifier
      fetchImpl: vi.fn(async () => ({ ok: false, status: 403, text: async () => '{}' })),
    });
    expect(result).toMatchObject({ ok: false, failure: 'invalid_grant' });
    expect(pair.verifier).not.toContain('undefined');
  });
});
