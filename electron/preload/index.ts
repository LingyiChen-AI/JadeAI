import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire renderer → main surface. Keep it small and explicit: everything
 * here is reachable from page JavaScript.
 */
export interface UpdateStatus {
  update: { version: string; url: string } | null;
  downloadedFileName: string | null;
}

/**
 * None of the update methods take arguments, and that is the point: opening an
 * installer, revealing it, and opening the release page all hand a path or URL
 * to the OS. The main process keeps those; the renderer names an action, never
 * a target. See electron/main/ipc/update.ts.
 */
const jade = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('jade:settings:get'),
  patchSettings: (patch: unknown) => ipcRenderer.invoke('jade:settings:patch', patch),
  openDataDir: () => ipcRenderer.invoke('jade:shell:open-data-dir'),
  retryStartup: () => ipcRenderer.send('jade:startup:retry'),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('jade:update:status'),
  downloadUpdate: (): Promise<{ fileName: string } | { error: string }> =>
    ipcRenderer.invoke('jade:update:download'),
  skipUpdate: (): Promise<void> => ipcRenderer.invoke('jade:update:skip'),
  openInstaller: (): Promise<void> => ipcRenderer.invoke('jade:update:open-installer'),
  revealInstaller: (): Promise<void> => ipcRenderer.invoke('jade:update:reveal-installer'),
  openReleasePage: (): Promise<void> => ipcRenderer.invoke('jade:update:open-release'),

  /**
   * Both subscriptions return an unsubscribe function. React effects re-run,
   * and an ipcRenderer listener that is never removed accumulates one copy per
   * run — each firing a setState on a component that may be unmounted.
   */
  onUpdateAvailable: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => callback(status);
    ipcRenderer.on('jade:update:available', listener);
    return () => ipcRenderer.removeListener('jade:update:available', listener);
  },
  onUpdateProgress: (callback: (fraction: number) => void): (() => void) => {
    const listener = (_event: unknown, fraction: number) => callback(fraction);
    ipcRenderer.on('jade:update:progress', listener);
    return () => ipcRenderer.removeListener('jade:update:progress', listener);
  },
};

export type JadeBridge = typeof jade;

contextBridge.exposeInMainWorld('jade', jade);
