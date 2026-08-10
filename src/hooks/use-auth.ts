'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';
import { LOCAL_USER_ID, LOCAL_USER_NAME } from '@/lib/auth/local-user';
import { useFingerprint } from './use-fingerprint';

export function useAuth() {
  const session = useSession();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const { authEnabled, desktop } = useRuntimeConfig();

  if (authEnabled) {
    return {
      user: session.data?.user
        ? {
            id: session.data.user.id || '',
            name: session.data.user.name,
            email: session.data.user.email,
            avatarUrl: session.data.user.image,
            authType: 'oauth' as const,
          }
        : null,
      isLoading: session.status === 'loading',
      isAuthenticated: session.status === 'authenticated',
      signIn: () => signIn('google'),
      signOut: () => signOut(),
    };
  }

  // Desktop has no auth and no fingerprint identity — resolveUser() on the
  // server always returns the single local user (see use-fingerprint.ts),
  // so mirror that here instead of synthesizing a fingerprint-mode user
  // that would show as "Anonymous User" in the UI.
  if (desktop) {
    return {
      user: {
        id: LOCAL_USER_ID,
        name: LOCAL_USER_NAME,
        email: null,
        avatarUrl: null,
        authType: 'local' as const,
      },
      isLoading: fpLoading,
      isAuthenticated: !fpLoading,
      signIn: () => {},
      signOut: () => {},
    };
  }

  return {
    user: fingerprint
      ? {
          id: `fp_${fingerprint}`,
          name: 'Anonymous User',
          email: null,
          avatarUrl: null,
          authType: 'fingerprint' as const,
        }
      : null,
    isLoading: fpLoading,
    isAuthenticated: !!fingerprint,
    signIn: () => {},
    signOut: () => {},
  };
}
