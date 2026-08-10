'use client';

import { useEffect, useState } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';
import { generateId } from '@/lib/utils';
import { LOCAL_USER_ID } from '@/lib/auth/local-user';

export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { authEnabled, desktop } = useRuntimeConfig();

  useEffect(() => {
    if (authEnabled) {
      setIsLoading(false);
      return;
    }

    // Desktop ignores the fingerprint server-side (resolveUser always returns
    // the single local user), so computing one would burn CPU for nothing.
    if (desktop) {
      setFingerprint(LOCAL_USER_ID);
      setIsLoading(false);
      return;
    }

    async function getFingerprint() {
      try {
        // Check localStorage first
        const stored = localStorage.getItem('jade_fingerprint');
        if (stored) {
          setFingerprint(stored);
          setIsLoading(false);
          return;
        }

        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const visitorId = result.visitorId;

        localStorage.setItem('jade_fingerprint', visitorId);
        setFingerprint(visitorId);
      } catch {
        // Fallback: generate a random ID
        const fallbackId = generateId();
        localStorage.setItem('jade_fingerprint', fallbackId);
        setFingerprint(fallbackId);
      } finally {
        setIsLoading(false);
      }
    }

    getFingerprint();
  }, [authEnabled, desktop]);

  return { fingerprint, isLoading };
}
