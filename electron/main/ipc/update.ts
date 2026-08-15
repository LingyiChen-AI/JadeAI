import { BrowserWindow, ipcMain, shell } from 'electron';
import { downloadFile } from '../download-installer';
import type { SettingsStore } from '../settings-store';
import type { AvailableUpdate } from '../update-check';

/**
 * Update UI backing, driven from the renderer's in-app notice.
 *
 * Every handler here takes NO arguments, on purpose. The renderer needs to open
 * an installer, reveal it in the file manager, and open a release page — all
 * three are operations that hand a path or URL to the OS, and accepting those
 * across the bridge would let page JavaScript open any file or URL it liked.
 * Instead the main process keeps the update it found and the file it wrote, and
 * the renderer only says *which action*, never *on what*.
 */

export interface UpdateStatus {
  update: { version: string; url: string } | null;
  /** Set once a download has finished, so a remounted UI knows to offer "open". */
  downloadedFileName: string | null;
}

export const UPDATE_CHANNELS = {
  available: 'jade:update:available',
  progress: 'jade:update:progress',
} as const;

export class UpdateCoordinator {
  private pending: AvailableUpdate | null = null;
  private downloadedPath: string | null = null;
  private downloading = false;

  constructor(
    private readonly store: SettingsStore,
    private readonly downloadsDir: string,
  ) {}

  /** Record an update and tell the renderer, if it is already listening. */
  announce(update: AvailableUpdate, window: BrowserWindow): void {
    this.pending = update;
    this.downloadedPath = null;
    if (!window.isDestroyed()) {
      window.webContents.send(UPDATE_CHANNELS.available, this.status());
    }
  }

  status(): UpdateStatus {
    return {
      update:
        this.pending === null
          ? null
          : { version: this.pending.version, url: this.pending.url },
      downloadedFileName: this.downloadedPath === null ? null : basename(this.downloadedPath),
    };
  }

  async download(window: BrowserWindow): Promise<{ fileName: string } | { error: string }> {
    const asset = this.pending?.asset;
    if (asset === undefined) return { error: 'no-update' };
    // A second click while the first download runs would write the same .part
    // file from two streams at once.
    if (this.downloading) return { error: 'in-progress' };

    this.downloading = true;
    try {
      const path = await downloadFile(
        {
          url: asset.url,
          fileName: asset.name,
          expectedSize: asset.size,
          directory: this.downloadsDir,
        },
        {
          fetch,
          onProgress: (fraction) => {
            if (!window.isDestroyed()) {
              window.webContents.send(UPDATE_CHANNELS.progress, fraction);
            }
          },
        },
      );
      this.downloadedPath = path;
      return { fileName: basename(path) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.downloading = false;
    }
  }

  skip(): void {
    if (this.pending === null) return;
    this.store.patch({ skippedUpdateVersion: this.pending.version });
    this.pending = null;
  }

  async openInstaller(): Promise<void> {
    if (this.downloadedPath !== null) await shell.openPath(this.downloadedPath);
  }

  revealInstaller(): void {
    if (this.downloadedPath !== null) shell.showItemInFolder(this.downloadedPath);
  }

  async openReleasePage(): Promise<void> {
    if (this.pending !== null) await shell.openExternal(this.pending.url);
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function registerUpdateIpc(
  coordinator: UpdateCoordinator,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle('jade:update:status', (): UpdateStatus => coordinator.status());

  ipcMain.handle('jade:update:download', async () => {
    const window = getWindow();
    if (window === null || window.isDestroyed()) return { error: 'no-window' };
    return coordinator.download(window);
  });

  ipcMain.handle('jade:update:skip', (): void => coordinator.skip());
  ipcMain.handle('jade:update:open-installer', () => coordinator.openInstaller());
  ipcMain.handle('jade:update:reveal-installer', (): void => coordinator.revealInstaller());
  ipcMain.handle('jade:update:open-release', () => coordinator.openReleasePage());
}
