'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, ExternalLink, FolderOpen, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';

interface UpdateInfo {
  version: string;
  url: string;
}

type Phase =
  | { name: 'idle' }
  | { name: 'downloading'; fraction: number }
  | { name: 'done'; fileName: string }
  | { name: 'failed'; message: string };

/**
 * In-app notice that a newer desktop release exists.
 *
 * Deliberately not a native dialog. A modal would seize the window the instant
 * the app opens, before the user has done anything, which is far too much
 * weight for "there is a newer version" — this sits in the corner and can be
 * ignored, collapsed, or dismissed.
 *
 * Renders nothing outside the Electron shell: the same Next app also serves the
 * web deployment, where there is no installer to offer and no bridge to call.
 */
export function UpdateNotice() {
  const { desktop } = useRuntimeConfig();
  const t = useTranslations('desktopUpdate');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    const bridge = window.jade;
    if (!bridge) return;

    // Pull as well as subscribe: the check runs at launch and usually finishes
    // before this component mounts, so a push-only design would miss it every
    // time and only work on the rare slow-network launch.
    void bridge.getUpdateStatus().then((status) => {
      if (status.update) setInfo(status.update);
      if (status.downloadedFileName) {
        setPhase({ name: 'done', fileName: status.downloadedFileName });
      }
    });

    const offAvailable = bridge.onUpdateAvailable((status) => {
      if (status.update) setInfo(status.update);
    });
    const offProgress = bridge.onUpdateProgress((fraction) => {
      setPhase({ name: 'downloading', fraction });
    });
    return () => {
      offAvailable();
      offProgress();
    };
  }, [desktop]);

  const startDownload = useCallback(async () => {
    const bridge = window.jade;
    if (!bridge) return;
    setPhase({ name: 'downloading', fraction: 0 });
    const result = await bridge.downloadUpdate();
    if ('error' in result) {
      setPhase({ name: 'failed', message: result.error });
      return;
    }
    setPhase({ name: 'done', fileName: result.fileName });
  }, []);

  const skip = useCallback(async () => {
    await window.jade?.skipUpdate();
    setDismissed(true);
  }, []);

  if (!desktop || info === null || dismissed) return null;

  const percent = phase.name === 'downloading' ? Math.round(phase.fraction * 100) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{t('found', { version: info.version })}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={t(collapsed ? 'expand' : 'collapse')}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('close')}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {phase.name === 'downloading' && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-brand transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('downloading', { percent })}</p>
            </div>
          )}

          {phase.name === 'done' && (
            <>
              <p className="text-xs text-muted-foreground">{t('downloaded')}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void window.jade?.openInstaller()}>
                  {t('openInstaller')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void window.jade?.revealInstaller()}
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t('reveal')}
                </Button>
              </div>
            </>
          )}

          {phase.name === 'failed' && (
            <>
              <p className="text-xs text-destructive">{t('failed', { message: phase.message })}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void window.jade?.openReleasePage()}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t('openReleasePage')}
              </Button>
            </>
          )}

          {phase.name === 'idle' && (
            <div className="flex flex-wrap gap-2">
              {/* Always downloadable: the main process only reports an update
                  that ships an installer for this machine. */}
              <Button size="sm" onClick={() => void startDownload()}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t('download')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void skip()}>
                {t('skipVersion')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
