import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import {
  getAppRoot,
  getAssetRoot,
  resolveMigrationsDirectory,
  resolveResourceFile,
} from './app-paths';
import { getDatabaseFile, getSettingsFile, initDataPath } from './data-path';
import { registerSettingsIpc } from './ipc/settings';
import { NextServerHost, type ServerMode } from './next-server-host';
import { SettingsStore } from './settings-store';

// Must run before any path is resolved: app.setName() changes how
// app.getPath('userData') resolves, and data-path.ts captures that value once.
app.setName('JadeAI');

const isDevelopment = !app.isPackaged;
const serverMode: ServerMode = isDevelopment ? 'development' : 'production';

const serverHost = new NextServerHost();
let settings: SettingsStore;
let mainWindow: BrowserWindow | null = null;

// Guards against two loadFile('startup-error.html') calls racing the same
// window (see the "boot generation" comment on bootServerInto for why a
// plain boolean is not enough).
let bootGeneration = 0;
let errorShownForGeneration = -1;

function createWindow(): BrowserWindow {
  const { window: bounds } = settings.get();
  const created = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'JadeAI',
    webPreferences: {
      // main bundles to out/main/index.js, so this lands on out/preload/index.js.
      // NOT resolveResourceFile(): the preload is build output, not a resource.
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (bounds.maximized) created.maximize();
  created.once('ready-to-show', () => created.show());

  // Keep external links out of the app window.
  created.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  created.on('close', () => {
    persistWindowState(created);
  });

  created.on('closed', () => {
    mainWindow = null;
  });

  return created;
}

function persistWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  const maximized = window.isMaximized();
  // getNormalBounds(), not getBounds(): a maximized window would otherwise
  // persist the screen size and never restore its real size again.
  const bounds = window.getNormalBounds();
  settings.setWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized,
  });
}

async function showStartupError(
  window: BrowserWindow,
  error: unknown,
  generation: number,
): Promise<void> {
  // Two failure paths can both try to show the error page for the same boot
  // attempt: NextServerHost's onUnexpectedExit callback (fires the moment the
  // child dies) and bootServerInto's own catch (fires later, once
  // waitForHealthy's poll loop times out). Without this guard the second
  // loadFile would race/clobber the first — same generation, so only the
  // first call wins.
  if (errorShownForGeneration === generation) return;
  errorShownForGeneration = generation;

  const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  await window.loadFile(resolveResourceFile('startup-error.html'), {
    search: new URLSearchParams({ detail }).toString(),
  });
  window.show();
}

/**
 * Boot the Next server and load it into `window`, showing the splash page
 * while waiting and the error page on failure.
 *
 * Each call gets its own "generation" number. The retry IPC handler can
 * invoke this again before a prior call's `serverHost.start()` promise has
 * settled (that promise is not cancelled, only its owning child process is
 * stopped) — the generation check keeps that stale, superseded attempt from
 * loading a startup-error page over a window that has since moved on (either
 * showing the app or a newer error).
 */
async function bootServerInto(window: BrowserWindow): Promise<void> {
  const generation = ++bootGeneration;

  await window.loadFile(resolveResourceFile('splash.html'));
  window.show();

  try {
    const running = await serverHost.start({
      mode: serverMode,
      paths: { appRoot: getAppRoot(), assetRoot: getAssetRoot() },
      databaseFile: getDatabaseFile(),
      migrationsDir: resolveMigrationsDirectory(),
      onUnexpectedExit: (code, signal) => {
        if (generation !== bootGeneration) return;
        console.error(`[next] server exited unexpectedly (code=${code} signal=${signal})`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          void showStartupError(
            mainWindow,
            new Error(`本地服务意外退出（code=${code} signal=${signal}）`),
            generation,
          );
        }
      },
    });
    if (generation !== bootGeneration) return;
    const { locale } = settings.get();
    await window.loadURL(`${running.origin}/${locale}`);
  } catch (error) {
    if (generation !== bootGeneration) return;
    console.error('[startup] failed to bring up the Next server:', error);
    await showStartupError(window, error, generation);
  }
}

app.whenReady().then(async () => {
  initDataPath(isDevelopment);
  settings = new SettingsStore(getSettingsFile());
  registerSettingsIpc(settings);

  ipcMain.on('jade:startup:retry', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    serverHost.stop();
    void bootServerInto(mainWindow);
  });

  mainWindow = createWindow();
  await bootServerInto(mainWindow);

  // macOS: re-open a window when the dock icon is clicked with none open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createWindow();
    void bootServerInto(mainWindow);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Flush synchronously — the event loop is about to stop. Then reap the child
  // unconditionally, or an orphaned Next server keeps holding its port.
  settings?.flushSync();
  serverHost.stop();
});
