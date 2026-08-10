import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire renderer → main surface. Keep it small and explicit: everything
 * here is reachable from page JavaScript.
 */
const jade = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('jade:settings:get'),
  patchSettings: (patch: unknown) => ipcRenderer.invoke('jade:settings:patch', patch),
  openDataDir: () => ipcRenderer.invoke('jade:shell:open-data-dir'),
  retryStartup: () => ipcRenderer.send('jade:startup:retry'),
};

export type JadeBridge = typeof jade;

contextBridge.exposeInMainWorld('jade', jade);
