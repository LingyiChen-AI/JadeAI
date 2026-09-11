'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, ExternalLink, KeyRound, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ORCAROUTER_KEY_CONSOLE_URL,
  ORCAROUTER_LOGO_URL,
  type OrcaCapability,
} from '@/lib/ai/orcarouter';
import { useSettingsStore, type AIProvider } from '@/stores/settings-store';

/**
 * "Connect with OrcaRouter" — OAuth 2.0 + PKCE, Flow B (out-of-band code).
 *
 * Flow B is used because JadeAI is self-hosted software whose install address
 * differs on every deployment: the browser that approves the request is often
 * not the process holding the verifier (Docker, Electron, LAN dev server), so a
 * loopback listener is not reachable. The consent screen shows a code, the user
 * pastes it back, and the server exchanges it with the verifier it never let go
 * of.
 *
 * The API key this produces is an ordinary OrcaRouter key. It is handed to the
 * same `saveOrcaCredential` seam the manual key field uses, so nothing
 * downstream knows or cares which path produced it.
 */

type ConnectStatus = 'idle' | 'starting' | 'waiting' | 'exchanging' | 'done' | 'error';

interface StartResponse {
  authorizeUrl?: string;
  generation?: number;
  expiresInSeconds?: number;
  error?: string;
}

interface ExchangeResponse {
  key?: string;
  scope?: string;
  scopeInsufficient?: boolean;
  requiredScope?: string;
  error?: string;
  message?: string;
}

export interface OrcaRouterConnectProps {
  provider: AIProvider;
  capability: OrcaCapability;
  /** Called after a successful exchange, before the credential is stored. */
  onConnected?: () => void;
}

export function OrcaRouterConnect({ provider, capability, onConnected }: OrcaRouterConnectProps) {
  const t = useTranslations('settings');
  const saveOrcaCredential = useSettingsStore((s) => s.saveOrcaCredential);

  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [authorizeUrl, setAuthorizeUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  /**
   * The official logo is loaded from OrcaRouter's own host. Deployments behind
   * a restrictive network policy (or an offline desktop client) cannot reach
   * it, so fall back to a built-in mark rather than showing a broken image.
   */
  const [logoFailed, setLogoFailed] = useState(false);

  /**
   * Monotonic attempt id. Every async response must confirm it still belongs to
   * the current attempt before it is allowed to touch state or credentials.
   */
  const generationRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /**
   * Tell the server to drop the pending attempt. `keepalive` lets this survive
   * a page unload, which is the only reliable way to release the server-side
   * login lock during `pagehide`.
   */
  const cancelOnServer = useCallback((generation: number, keepalive: boolean) => {
    try {
      void fetch('/api/ai/orcarouter/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', generation }),
        keepalive,
      }).catch(() => { /* best effort */ });
    } catch { /* best effort */ }
  }, []);

  /** Reset every piece of visible login state without touching the server. */
  const resetLocalState = useCallback(() => {
    setStatus('idle');
    setAuthorizeUrl('');
    setCode('');
    setError('');
    setNotice('');
    setCopied(false);
  }, []);

  const cancel = useCallback(() => {
    const generation = generationRef.current;
    // Bump first so any in-flight response is already stale.
    generationRef.current += 1;
    clearTimer();
    cancelOnServer(generation, false);
    resetLocalState();
  }, [cancelOnServer, clearTimer, resetLocalState]);

  // -- Page lifecycle -------------------------------------------------------
  // A page put into the back-forward cache never runs a cleanup effect. If we
  // relied on the guarded `finally` of the in-flight request to clear the busy
  // flag, the restored page would stay permanently busy — the guard correctly
  // refuses to mutate state, which is exactly the problem. So clear the visible
  // state synchronously here, then release the server lock with keepalive.
  useEffect(() => {
    const onPageHide = () => {
      const generation = generationRef.current;
      generationRef.current += 1;
      clearTimer();
      try {
        // Still mounted: it is safe (and necessary) to clear state synchronously
        // so a bfcache restore is usable.
        setStatus('idle');
        setAuthorizeUrl('');
        setCode('');
        setError('');
        setNotice('');
      } catch { /* ignore */ }
      cancelOnServer(generation, true);
    };

    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [cancelOnServer, clearTimer]);

  // Real unmount, or switching provider/capability: release the server lock.
  // No component state is written on the unmount path.
  useEffect(() => {
    return () => {
      const generation = generationRef.current;
      generationRef.current += 1;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      cancelOnServer(generation, true);
    };
  }, [provider, capability, cancelOnServer]);

  // -- Flow ---------------------------------------------------------------

  const start = useCallback(async () => {
    // A new attempt supersedes whatever came before it.
    generationRef.current += 1;
    const generation = generationRef.current;
    clearTimer();
    resetLocalState();
    setStatus('starting');

    let started: StartResponse;
    try {
      const res = await fetch('/api/ai/orcarouter/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', capability }),
      });
      started = (await res.json()) as StartResponse;
      if (!res.ok) throw new Error(started.error || 'start_failed');
    } catch {
      if (generationRef.current !== generation) return;
      setStatus('error');
      setError(t('ai.orca.connectError'));
      return;
    }

    if (generationRef.current !== generation) return;

    const url = started.authorizeUrl;
    if (!url) {
      setStatus('error');
      setError(t('ai.orca.connectError'));
      return;
    }

    setAuthorizeUrl(url);
    setStatus('waiting');

    // Open the consent screen. Popup blockers may refuse; the URL is always
    // shown and copyable so the flow never depends on the window opening.
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { /* the visible URL is the fallback */ }

    // Expire the attempt locally in step with the server TTL.
    const ttl = (started.expiresInSeconds ?? 900) * 1000;
    pollTimerRef.current = setTimeout(() => {
      if (generationRef.current !== generation) return;
      setStatus('error');
      setError(t('ai.orca.expired'));
    }, ttl);
  }, [capability, clearTimer, resetLocalState, t]);

  const submitCode = useCallback(async () => {
    const generation = generationRef.current;
    if (status !== 'waiting') return;
    if (!code.trim()) return;

    setStatus('exchanging');
    setError('');
    clearTimer();

    let payload: ExchangeResponse;
    try {
      const res = await fetch('/api/ai/orcarouter/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange', code: code.trim(), generation }),
      });
      payload = (await res.json()) as ExchangeResponse;

      // A response for a superseded attempt must not install a credential.
      if (generationRef.current !== generation) return;

      if (!res.ok || !payload.key) {
        setStatus('error');
        setError(payload.message || t('ai.orca.connectError'));
        return;
      }
    } catch {
      if (generationRef.current !== generation) return;
      setStatus('error');
      setError(t('ai.orca.networkError'));
      return;
    }

    // Hand the key to the shared credential seam. This is the same call the
    // manual API-key field makes; only `source` differs.
    saveOrcaCredential({
      key: payload.key,
      source: 'pkce',
      scope: payload.scope,
    });

    setStatus('done');
    setCode('');
    setNotice(
      payload.scopeInsufficient
        ? t('ai.orca.scopeDowngraded', {
            granted: payload.scope || t('ai.orca.scopeUnknown'),
            required: payload.requiredScope || 'api',
          })
        : t('ai.orca.connected')
    );
    onConnected?.();
  }, [code, clearTimer, onConnected, saveOrcaCredential, status, t]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(authorizeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the URL is selectable regardless */ }
  }, [authorizeUrl]);


  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {/* Official OrcaRouter asset; the title below carries the meaning,
              so the mark is decorative in both its loaded and fallback forms. */}
          {logoFailed ? (
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
          ) : (
            <img
              src={ORCAROUTER_LOGO_URL}
              alt=""
              aria-hidden="true"
              width={20}
              height={20}
              className="mt-0.5 h-5 w-5 rounded"
              data-testid="orca-logo"
              onError={() => setLogoFailed(true)}
            />
          )}
          <div>
            <p className="text-sm font-medium leading-tight">{t('ai.orca.connectTitle')}</p>
            <p className="text-xs text-zinc-500 leading-snug">{t('ai.orca.connectDescription')}</p>
          </div>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
      </div>

      {status === 'idle' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full cursor-pointer"
          onClick={start}
          data-testid="orca-connect-button"
        >
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          {t('ai.orca.connectButton')}
        </Button>
      )}

      {(status === 'starting' || status === 'exchanging') && (
        <div className="flex items-center gap-2 text-xs text-zinc-500" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {status === 'starting' ? t('ai.orca.starting') : t('ai.orca.exchanging')}
        </div>
      )}

      {status === 'waiting' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('ai.orca.authorizeUrlLabel')}</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={authorizeUrl}
                aria-label={t('ai.orca.authorizeUrlLabel')}
                className="h-8 text-xs"
                onFocus={(e) => e.currentTarget.select()}
                data-testid="orca-authorize-url"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="shrink-0 cursor-pointer"
                onClick={copyUrl}
                aria-label={t('ai.orca.copyUrl')}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-zinc-400">{t('ai.orca.authorizeHint')}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="orca-oob-code" className="text-xs">
              {t('ai.orca.codeLabel')}
            </Label>
            <Input
              id="orca-oob-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submitCode(); }}
              placeholder={t('ai.orca.codePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="h-8 text-xs"
              data-testid="orca-code-input"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1 cursor-pointer"
              onClick={submitCode}
              disabled={!code.trim()}
              data-testid="orca-code-submit"
            >
              {t('ai.orca.submitCode')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={cancel}
              data-testid="orca-cancel"
            >
              {t('ai.orca.cancel')}
            </Button>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400" role="status">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400" role="alert">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={start}
              data-testid="orca-retry"
            >
              {t('ai.orca.retry')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={cancel}
              data-testid="orca-cancel"
            >
              {t('ai.orca.cancel')}
            </Button>
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-zinc-400">
        <KeyRound className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {t('ai.orca.revokeHint')}{' '}
          <a
            href={ORCAROUTER_KEY_CONSOLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {t('ai.orca.revokeLink')}
          </a>
        </span>
      </p>
    </div>
  );
}
