#!/usr/bin/env node
// Builds the two Electron entry points (main, preload) with esbuild.
//
// Why esbuild instead of electron-vite: electron-vite@5 peers on vite ^5|^6|^7,
// but this repo already carries vite 8 via vitest@4. That mismatch breaks both
// `tsc` (MainBuildOptions extends vite's BuildEnvironmentOptions) and vitest
// (`Cannot find package 'vite'`). electron-vite's main selling point — renderer
// HMR — doesn't apply here anyway, since the "renderer" is just the Next.js
// server the main process spawns. esbuild is already in the tree and adds no
// new peer constraints.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

// This file is ESM (.mjs), so top-level `require` isn't available — but CJS
// packages can still be pulled in via createRequire. That matters here because
// `require('electron')` (run from a plain Node process, not one launched BY
// Electron) resolves to the absolute path of the Electron binary, which is
// exactly what we need to spawn it. `import electron from 'electron'` would
// instead try to load electron's real JS API surface, which throws outside of
// an Electron-launched process.
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const APP_NAME = 'JadeAI';
// A dev-only bundle id. Without changing it from Electron's own, LaunchServices
// keeps serving the name it cached for `com.github.Electron` and the dock still
// hovers as "Electron" even with CFBundleName patched.
const DEV_BUNDLE_ID = 'com.jadeai.desktop.dev';

/**
 * Give the dev app its own name in the dock and menu bar.
 *
 * `app.setName()` only changes what Electron itself reports (and where userData
 * lands) — macOS reads the dock tooltip and menu-bar title from the *bundle's*
 * Info.plist, which in development is Electron's own. Without this the app
 * hovers as "Electron".
 *
 * Patched in place rather than by copying the bundle (which is what a fuller
 * setup does when it also needs a distinct bundle id): we only need the display
 * name. Verified the plist is not hardlinked into the pnpm store, so this cannot
 * leak into other projects; a `pnpm install` resets it and the next launch
 * re-applies it. Packaged builds get the name from electron-builder instead.
 */
function nameDevBundle() {
  if (process.platform !== 'darwin') return;
  const plist = join(dirname(dirname(electronPath)), 'Info.plist');
  if (!existsSync(plist)) return;
  try {
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('/usr/bin/plutil', ['-replace', key, '-string', APP_NAME, plist]);
    }
    execFileSync('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', DEV_BUNDLE_ID, plist]);
    // Re-register so LaunchServices picks the new identity up instead of serving
    // whatever it cached for the previous bundle id.
    execFileSync(
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-f', dirname(dirname(plist))],
    );
  } catch (error) {
    // Cosmetic only — a wrong dock tooltip must never block the dev loop.
    console.warn(`[dev] could not rename the electron bundle: ${error.message}`);
  }
}

const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24', // Electron 43.3.0 ships Node 24.18.1
  sourcemap: true,
  logLevel: 'info',
  external: [
    // Injected by the Electron runtime at launch; bundling it in would pull a
    // meaningless stub into the output and break `require('electron')`.
    'electron',
    // Does dynamic/native requires (platform-specific update mechanisms) that
    // esbuild's static bundler resolves incorrectly when inlined.
    'electron-updater',
  ],
};

const targets = [
  { name: 'main', entry: 'electron/main/index.ts', outfile: 'out/main/index.js' },
  { name: 'preload', entry: 'electron/preload/index.ts', outfile: 'out/preload/index.js' },
];

if (!isWatch) {
  await Promise.all(
    targets.map((t) =>
      esbuild.build({ ...sharedOptions, entryPoints: [t.entry], outfile: t.outfile })
    )
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Watch mode: keep esbuild watching both bundles and run an Electron dev loop
// that relaunches the app after every successful rebuild.
// ---------------------------------------------------------------------------

let electronChild = null;
let restartTimer = null;
// Distinguishes an intentional kill (restart) from the developer closing the
// window / the process dying on its own. Cannot be inferred from
// `electronChild === null`: killElectron() clears that reference before the
// process has actually exited, so the exit handler needs its own signal.
let restarting = false;

// esbuild's `context().watch()` has no "rebuild finished" callback of its own,
// so completion is observed via a plugin's `onEnd` hook instead. Each of the
// two entry points gets its own context/watcher, so `onEnd` fires once per
// bundle — including once for each bundle's *initial* build. We must not treat
// those two initial firings as "rebuilds", or Electron gets launched twice at
// startup (once when `main` finishes, once when `preload` finishes).
const firstBuildDone = new Set();

function launchElectron() {
  nameDevBundle();
  console.log('[dev] launching electron');
  const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    // `next dev` forks its real server as a grandchild without propagating
    // ELECTRON_RUN_AS_NODE, so if the child ran under Electron's binary that
    // grandchild would start as a full GUI app and take a second dock icon.
    // Hand down the real Node that is running this script so the whole subtree
    // stays plain Node in development.
    env: { ...process.env, JADE_DEV_NODE_PATH: process.execPath },
  });
  electronChild = child;

  // If Electron exits on its own — the developer closed the last window,
  // which triggers `app.quit()` in electron/main/index.ts — the watch loop
  // has nothing left to serve and must stop, rather than sit there silently
  // holding a dead child reference until the next rebuild "resurrects" it.
  // A restart-triggered kill sets `restarting` first, so that path is a
  // no-op here.
  child.on('exit', (code) => {
    if (child === electronChild) electronChild = null;
    if (!restarting) {
      console.log('[dev] electron exited — stopping the watch loop');
      void shutdown(code ?? 0);
    }
  });
}

/**
 * Kill the current Electron child and resolve only once it has actually
 * exited (not merely been signalled) — `child.kill()` sends SIGTERM
 * asynchronously, so returning immediately would let scheduleRestart() spawn
 * a replacement while the old process is still alive. That window matters
 * once the main process holds resources a new instance also needs (single-
 * instance lock, the Next server's port — both land in later tasks).
 */
function killElectron() {
  const child = electronChild;
  electronChild = null;
  // `child.exitCode !== null` reflects a confirmed exit; `child.killed` only
  // means `.kill()` was called, which is not the same thing.
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

function scheduleRestart() {
  // Debounce: a single file edit only triggers one of the two contexts to
  // rebuild, but coalescing guards against both settling in the same tick
  // (e.g. touching both entry files at once) causing a double restart.
  clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    restarting = true;
    await killElectron();
    restarting = false;
    launchElectron();
  }, 50);
}

function onEndPlugin(name) {
  return {
    name: `dev-restart-${name}`,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          // Without this the developer sees no window and no explanation —
          // just esbuild's error block, which is easy to not connect to the
          // missing app. Only worth calling out on the *first* build, since
          // a broken rebuild after Electron is already running just leaves
          // the last-good instance in place.
          if (!firstBuildDone.has(name)) {
            console.warn(
              `[dev] ${name} failed to build — electron will not launch until this is fixed`
            );
          }
          return; // don't restart on a broken build
        }

        if (!firstBuildDone.has(name)) {
          firstBuildDone.add(name);
          // Launch only once both bundles have completed their first build —
          // this is the guard described above.
          if (firstBuildDone.size === targets.length) {
            launchElectron();
          }
          return;
        }

        scheduleRestart();
      });
    },
  };
}

const contexts = await Promise.all(
  targets.map((t) =>
    esbuild.context({
      ...sharedOptions,
      entryPoints: [t.entry],
      outfile: t.outfile,
      plugins: [onEndPlugin(t.name)],
    })
  )
);

await Promise.all(contexts.map((ctx) => ctx.watch()));

async function shutdown(code = 0) {
  restarting = true; // suppress the child exit handler on the SIGINT/SIGTERM path
  await killElectron();
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
