'use client';

import Image from 'next/image';
import { Settings, Menu } from 'lucide-react';
import { LocaleSwitcher } from './locale-switcher';
import { UserMenu } from './user-menu';
import { Link, usePathname } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useUIStore } from '@/stores/ui-store';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const NAV_ITEMS: { href: string; i18nKey: string; match: string; tourId?: string }[] = [
  { href: '/dashboard', i18nKey: 'dashboard.nav', match: '/dashboard' },
  { href: '/templates', i18nKey: 'templates.nav', match: '/templates', tourId: 'dash-templates' },
  { href: '/interview', i18nKey: 'interview.nav', match: '/interview' },
  { href: '/recruit', i18nKey: 'recruit.nav', match: '/recruit' },
];

export function Header() {
  const { openModal } = useUIStore();
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-background/95 dark:supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-1">
            <Image src="/logo.svg" alt="JadeAI" width={120} height={36} priority />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={item.tourId}
                  className={cn(
                    'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  )}
                >
                  {t(item.i18nKey)}
                  {isActive && (
                    <span className="absolute bottom-[-9px] left-1/2 h-[2px] w-4/5 -translate-x-1/2 rounded-full bg-brand" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openModal('settings')}
            className="cursor-pointer text-zinc-500"
            title={t('settings.title')}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <UserMenu />
          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <nav className="flex flex-col gap-2 pt-8">
                  {NAV_ITEMS.map((item) => {
                    const isActive = pathname.startsWith(item.match);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-tour={item.tourId}
                        className={cn(
                          'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                        )}
                      >
                        {t(item.i18nKey)}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
