'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Menu, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';

const GITHUB_REPO = 'twwch/JadeAI';

function useGitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.stargazers_count === 'number') setStars(d.stargazers_count);
      })
      .catch(() => {});
  }, []);
  return stars;
}

function formatStars(n: number): string {
  return n.toLocaleString('en-US');
}

export function LandingHeader() {
  const t = useTranslations('landing.header');
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const stars = useGitHubStars();
  const { authEnabled } = useRuntimeConfig();

  const isLoggedIn = authEnabled && !!session?.user;
  const ctaLabel = isLoggedIn ? t('dashboard') : t('getStarted');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
        scrolled
          ? 'border-zinc-200 bg-white/80 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-950/80'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="JadeAI" width={120} height={36} priority />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              { href: '#features', label: t('features') },
              { href: '#templates', label: t('templates') },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/interview"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {t('interview')}
            </Link>
            <Link
              href="/recruit"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {t('recruit')}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-full bg-brand-muted px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-brand-muted dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 sm:flex"
          >
            <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
            <span>Star on GitHub</span>
            {stars !== null && (
              <>
                <span className="mx-0.5 text-zinc-300 dark:text-zinc-600">|</span>
                <span>{formatStars(stars)}</span>
              </>
            )}
          </a>
          <LocaleSwitcher />
          <Button
            asChild
            className="hidden cursor-pointer bg-brand text-white hover:bg-brand-hover sm:inline-flex"
          >
            <Link href="/dashboard">{ctaLabel}</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-l border-zinc-200 bg-white p-0 dark:border-zinc-800 dark:bg-zinc-950">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="flex h-14 items-center border-b border-zinc-100 px-5 dark:border-zinc-900">
                  <Image src="/logo.svg" alt="JadeAI" width={104} height={32} />
                </div>
                <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
                  {[
                    { href: '#features', label: t('features') },
                    { href: '#templates', label: t('templates') },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-zinc-700 transition-colors hover:bg-brand-muted hover:text-brand dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-brand"
                    >
                      {item.label}
                    </a>
                  ))}
                  <Link
                    href="/interview"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-zinc-700 transition-colors hover:bg-brand-muted hover:text-brand dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-brand"
                  >
                    {t('interview')}
                  </Link>
                  <Link
                    href="/recruit"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-zinc-700 transition-colors hover:bg-brand-muted hover:text-brand dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-brand"
                  >
                    {t('recruit')}
                  </Link>
                </nav>
                <div className="border-t border-zinc-100 p-4 dark:border-zinc-900">
                  <a
                    href={`https://github.com/${GITHUB_REPO}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-3 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
                    <span>Star on GitHub</span>
                    {stars !== null && (
                      <>
                        <span className="mx-0.5 text-zinc-300 dark:text-zinc-600">|</span>
                        <span>{formatStars(stars)}</span>
                      </>
                    )}
                  </a>
                  <Button
                    asChild
                    className="h-11 w-full cursor-pointer rounded-lg bg-brand text-[15px] font-medium text-white shadow-sm shadow-brand/20 hover:bg-brand-hover"
                  >
                    <Link href="/dashboard" onClick={() => setOpen(false)}>{ctaLabel}</Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
