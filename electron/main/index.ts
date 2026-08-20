import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron';
import {
  getAppRoot,
  getAssetRoot,
  resolveMigrationsDirectory,
  resolveResourceFile,
} from './app-paths';
import { getDatabaseFile, getSettingsFile, initDataPath } from './data-path';
import { registerSettingsIpc } from './ipc/settings';
import { registerUpdateIpc, UpdateCoordinator } from './ipc/update';
import { NextServerHost, type ServerMode } from './next-server-host';
import { SettingsStore } from './settings-store';
import { fetchDesktopReleases, selectAvailableUpdate } from './update-check';

// Must run before any path is resolved: app.setName() changes how
// app.getPath('userData') resolves, and data-path.ts captures that value once.
app.setName('JadeAI');

const isDevelopment = !app.isPackaged;
const serverMode: ServerMode = isDevelopment ? 'development' : 'production';

const serverHost = new NextServerHost();
let settings: SettingsStore;
let updates: UpdateCoordinator;
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
    // Open the workspace, not the marketing homepage. `/${locale}` is the
    // landing page — a hero, a GitHub star button, and a nav that only lists
    // what the website sells (功能特色 / 模板库 / 模拟面试). Someone who already
    // installed the app has nothing to gain there, and the app-wide nav —
    // which is where 工作台 / 模板 / 面试模拟 / 招聘 live — only renders inside
    // /dashboard and friends, so landing on the homepage made whole modules
    // look missing from the desktop build.
    await window.loadURL(`${running.origin}/${locale}/dashboard`);
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

  // Hand it to the in-app notice rather than a native dialog. A modal seizes
  // the window the moment the app opens, before the user has done anything —
  // too heavy for "there is a newer version". The renderer shows a dismissible
  // panel instead, and can also pull this state itself on mount, which covers
  // the case where the check finishes before the page is listening.
  updates.announce(update, window);
}

/**
 * Only one instance may own the data directory.
 *
 * Without this, a second launch is not a harmless duplicate window — it starts
 * a SECOND Next server on a different port and opens a SECOND handle on the
 * same SQLite file. Three things go wrong at once:
 *
 *  - Two windows stack on screen, each with its own update panel showing its
 *    own download progress, which reads as a rendering bug rather than as two
 *    apps.
 *  - The port is part of the page origin, and Chromium keys localStorage on the
 *    origin. The instance that loses the stored port gets a different one, so
 *    it silently sees an empty storage area — the saved API keys are "gone"
 *    for that window (see the serverPort note in settings-store.ts).
 *  - Both run migrations against one database file and can race each other,
 *    the same way `next build`'s workers did.
 *
 * The loser quits before touching any of it. The winner brings its window
 * forward, which is what someone re-launching an already-running app wants.
 */
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  // Before initDataPath, before the settings store, before any server: this
  // process must not open anything the running instance owns.
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  // whenReady still resolves in the losing instance; quitting is asynchronous.
  if (!hasSingleInstanceLock) return;

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
  updates = new UpdateCoordinator(settings, app.getPath('downloads'));
  registerUpdateIpc(updates, () => mainWindow);

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
