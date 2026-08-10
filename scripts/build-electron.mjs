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

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
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

// esbuild's `context().watch()` has no "rebuild finished" callback of its own,
// so completion is observed via a plugin's `onEnd` hook instead. Each of the
// two entry points gets its own context/watcher, so `onEnd` fires once per
// bundle — including once for each bundle's *initial* build. We must not treat
// those two initial firings as "rebuilds", or Electron gets launched twice at
// startup (once when `main` finishes, once when `preload` finishes).
const firstBuildDone = new Set();

function launchElectron() {
  console.log('[dev] launching electron');
  electronChild = spawn(electronPath, ['.'], { stdio: 'inherit' });
}

function killElectron() {
  if (electronChild && !electronChild.killed) {
    electronChild.kill();
    electronChild = null;
  }
}

function scheduleRestart() {
  // Debounce: a single file edit only triggers one of the two contexts to
  // rebuild, but coalescing guards against both settling in the same tick
  // (e.g. touching both entry files at once) causing a double restart.
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    killElectron();
    launchElectron();
  }, 50);
}

function onEndPlugin(name) {
  return {
    name: `dev-restart-${name}`,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) return; // don't restart on a broken build

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

function shutdown() {
  killElectron();
  Promise.all(contexts.map((ctx) => ctx.dispose())).finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
