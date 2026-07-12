'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ResumePreview } from '@/components/preview/resume-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Lock, FileX2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { Resume } from '@/types/resume';

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations('publicView');

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchResume = useCallback(async (pwd?: string) => {
    setLoading(true);
    setPasswordError(false);

    try {
      const url = pwd
        ? `/api/share/${token}?password=${encodeURIComponent(pwd)}`
        : `/api/share/${token}`;

      const res = await fetch(url);

      if (res.status === 404 || res.status === 403) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (res.status === 401) {
        const data = await res.json();
        if (data.passwordRequired) {
          if (pwd) {
            setPasswordError(true);
          }
          setNeedsPassword(true);
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResume(data);
      setNeedsPassword(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, [token]);

  useEffect(() => {
    fetchResume();
  }, [fetchResume]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    fetchResume(password);
  };

  // Loading state
  if (loading && !needsPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  // Not found
  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <FileX2 className="h-16 w-16 text-zinc-300 dark:text-zinc-600 mb-4" />
        <h1 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
          {t('notFound')}
        </h1>
        <Link href="/dashboard" className="mt-4 text-sm text-brand hover:text-brand">
          {t('viewOnBrand')}
        </Link>
      </div>
    );
  }

  // Password required
  if (needsPassword) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted dark:bg-brand-muted">
              <Lock className="h-6 w-6 text-brand" />
            </div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {t('passwordRequired')}
            </h1>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-sm"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-500">{t('invalidPassword')}</p>
            )}
            <Button
              type="submit"
              disabled={submitting || !password.trim()}
              className="w-full cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t('submit')}
            </Button>
          </form>
        </div>

        <Link href="/dashboard" className="mt-6 text-sm text-brand hover:text-brand">
          {t('viewOnBrand')}
        </Link>
      </div>
    );
  }

  // Resume loaded
  if (resume) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm font-semibold text-brand">小逆offer</span>
            <span className="shrink-0 text-xs text-zinc-400">|</span>
            <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">{resume.title}</span>
          </div>
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-medium text-brand hover:text-brand"
          >
            {t('viewOnBrand')}
          </Link>
        </div>

        {/* Resume preview */}
        <div className="mx-auto max-w-4xl px-4">
          <div className="border border-zinc-200 bg-white shadow-lg overflow-hidden dark:border-zinc-700 dark:bg-zinc-900">
            <ResumePreview resume={resume} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
