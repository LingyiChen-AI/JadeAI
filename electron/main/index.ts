import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
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
import { downloadFile } from './download-installer';
import {
  type AvailableUpdate,
  fetchDesktopReleases,
  resolveUpdatePromptAction,
  selectAvailableUpdate,
  UPDATE_PROMPT_BUTTONS,
} from './update-check';

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
    // Window/taskbar icon. On macOS the dock icon comes from the bundle instead,
    // which in development is Electron's own — app.dock.setIcon() below fixes that.
    icon: resolveResourceFile('build', 'icon.png'),
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
      paths: {
        appRoot: getAppRoot(),
        assetRoot: getAssetRoot(),
        titleGuardScript: resolveResourceFile('next-title-guard.js'),
      },
      databaseFile: getDatabaseFile(),
      migrationsDir: resolveMigrationsDirectory(),
      preferredPort: settings.get().serverPort,
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
    // Remember the port BEFORE loading the page. It is part of the origin the
    // renderer's localStorage is keyed on, so persisting it is what lets the
    // next launch land on the same storage area.
    if (running.port !== settings.get().serverPort) {
      settings.patch({ serverPort: running.port });
    }
    const { locale } = settings.get();
    await window.loadURL(`${running.origin}/${locale}`);
  } catch (error) {
    if (generation !== bootGeneration) return;
    console.error('[startup] failed to bring up the Next server:', error);
    await showStartupError(window, error, generation);
  }
}

/** Where releases are published. The `ds-v*` filtering lives in update-check. */
const RELEASE_REPOSITORY = 'LingyiChen-AI/JadeAI';

/**
 * Tell the user about a newer release, if there is one.
 *
 * Notifies rather than installs — see the note at the top of update-check.ts for
 * why silent updates are not possible with an ad-hoc signature and a releases
 * list shared with the web app.
 *
 * Never awaited by startup and never surfaces an error: a machine with no
 * network must launch exactly as fast as one with it.
 */
async function checkForUpdates(window: BrowserWindow): Promise<void> {
  if (!settings.get().updateCheckEnabled) return;

  const releases = await fetchDesktopReleases({ fetch, repository: RELEASE_REPOSITORY });
  const update = selectAvailableUpdate(
    releases,
    app.getVersion(),
    settings.get().skippedUpdateVersion,
  );
  if (update === null || window.isDestroyed()) return;

  const { response } = await dialog.showMessageBox(window, {
    type: 'info',
    message: `JadeAI ${update.version} 可以下载了`,
    detail: `当前版本 ${app.getVersion()}。下载后覆盖安装即可，本机数据不受影响。`,
    buttons: [...UPDATE_PROMPT_BUTTONS],
    defaultId: UPDATE_PROMPT_BUTTONS.indexOf('立即下载'),
    cancelId: UPDATE_PROMPT_BUTTONS.indexOf('稍后再说'),
  });

  switch (resolveUpdatePromptAction(response)) {
    case 'open':
      await downloadUpdate(window, update);
      break;
    case 'skip':
      settings.patch({ skippedUpdateVersion: update.version });
      break;
    case 'dismiss':
      break;
  }
}

/**
 * Fetch the installer for this machine into the user's Downloads folder.
 *
 * Downloading is as far as this can go: applying the update would need
 * Squirrel, which will not accept an ad-hoc signed app (see update-check.ts).
 * So the app gets the right file — no picking between three on a release page —
 * and hands off to the installer the user already knows how to drive.
 *
 * Falls back to opening the release page whenever anything is off: no matching
 * asset for this platform, or a download that failed. The user is never left
 * with only an error.
 */
async function downloadUpdate(window: BrowserWindow, update: AvailableUpdate): Promise<void> {
  if (update.asset === null) {
    void shell.openExternal(update.url);
    return;
  }

  const directory = app.getPath('downloads');
  try {
    // Dock (macOS) / taskbar (Windows) progress. The app has no UI channel of
    // its own here — the renderer is showing the resume editor, not an
    // installer — and this is the one progress surface that needs no window.
    window.setProgressBar(0);
    const file = await downloadFile(
      {
        url: update.asset.url,
        fileName: update.asset.name,
        expectedSize: update.asset.size,
        directory,
      },
      {
        fetch,
        onProgress: (fraction) => {
          if (!window.isDestroyed()) window.setProgressBar(fraction);
        },
      },
    );
    if (!window.isDestroyed()) window.setProgressBar(-1);

    const { response } = await dialog.showMessageBox(window, {
      type: 'info',
      message: `${update.asset.name} 下载完成`,
      detail:
        process.platform === 'darwin'
          ? '打开后把 JadeAI 拖到"应用程序"覆盖安装。首次打开若被拦下，见 README 的说明。'
          : '打开安装程序，按提示覆盖安装即可。',
      buttons: ['打开安装包', '在文件夹中显示', '完成'],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 0) void shell.openPath(file);
    if (response === 1) shell.showItemInFolder(file);
  } catch (error) {
    if (!window.isDestroyed()) window.setProgressBar(-1);
    console.error('[update] download failed:', error);
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: '下载失败',
      detail: `${error instanceof Error ? error.message : String(error)}\n\n可以到发布页手动下载。`,
      buttons: ['打开发布页', '取消'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void shell.openExternal(update.url);
  }
}

app.whenReady().then(async () => {
  initDataPath(isDevelopment);

  // In development the dock icon comes from Electron's own bundle, so the app
  // shows Electron's atom until we override it at runtime. A packaged build gets
  // the icon from electron-builder's `icon` config instead and needs no override.
  if (isDevelopment && process.platform === 'darwin') {
    const dockIcon = nativeImage.createFromPath(resolveResourceFile('build', 'icon.png'));
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon);
    }
  }
  settings = new SettingsStore(getSettingsFile());
  registerSettingsIpc(settings);

  ipcMain.on('jade:startup:retry', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    serverHost.stop();
    void bootServerInto(mainWindow);
  });

  mainWindow = createWindow();
  await bootServerInto(mainWindow);

  // After the app is up, and deliberately not awaited: a slow or unreachable
  // GitHub must not hold the window. The catch covers the part fetch's own
  // error handling does not — a dialog that fails to open would otherwise
  // surface as an unhandled rejection, which is a poor way to learn that an
  // optional feature broke.
  void checkForUpdates(mainWindow).catch((error) => {
    console.error('[update] check failed:', error);
  });
});

// Quit with the last window on every platform, macOS included. The usual macOS
// convention (stay resident, re-open from the dock) exists for apps that are
// cheap to keep around; this one holds a Next server and an open SQLite handle
// for a window that is no longer there. There is deliberately no `activate`
// handler to re-open one: closing the window is the way to quit.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  // Flush synchronously — the event loop is about to stop. Then reap the child
  // unconditionally, or an orphaned Next server keeps holding its port.
  settings?.flushSync();
  serverHost.stop();
});

// A signal terminates the main process without ever emitting 'will-quit', so
// without these handlers `kill`, a system shutdown, Ctrl+C in the dev terminal,
// and the dev loop's own restart all skipped the flush above AND left the Next
// server behind. Routing them through app.quit() gives every exit path one
// teardown. Signals only — an uncaught exception is not a shutdown request.
const TERMINATION_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const FORCED_EXIT_GRACE_MS = 3_000;
let shuttingDown = false;

for (const signal of TERMINATION_SIGNALS) {
  process.on(signal, () => {
    // A second Ctrl+C must not restart the sequence — and installing a handler
    // at all suppresses the default "just die", so a wedged quit would hang
    // forever. The watchdog is the price of handling the signal.
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, quitting`);
    const watchdog = setTimeout(() => {
      console.error('[shutdown] quit did not finish in time, forcing exit');
      // will-quit has already flushed settings and signalled the child by now;
      // what remains is Chromium teardown, which is safe to cut short.
      process.exit(0);
    }, FORCED_EXIT_GRACE_MS);
    watchdog.unref();
    app.quit();
  });
}
