import { ipcMain, shell } from 'electron';
import { getCanonicalUserDataPath } from '../data-path';
import type { JadeSettings, SettingsStore } from '../settings-store';

export function registerSettingsIpc(store: SettingsStore): void {
  ipcMain.handle('jade:settings:get', (): JadeSettings => store.get());

  ipcMain.handle('jade:settings:patch', (_event, patch: unknown): JadeSettings => {
    // The renderer is our own code, but it is still the untrusted side of this
    // boundary. normalizeSettings() inside patch() is what makes this safe.
    if (typeof patch !== 'object' || patch === null) {
      return store.get();
    }
    return store.patch(patch as Partial<JadeSettings>);
  });

  ipcMain.handle('jade:shell:open-data-dir', async (): Promise<void> => {
    await shell.openPath(getCanonicalUserDataPath());
  });
}
