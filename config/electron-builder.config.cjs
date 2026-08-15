// electron-builder configuration for the JadeAI desktop client.
//
// Layout contract with the main process (electron/main/app-paths.ts):
//   resolveResourceFile(...s)      -> join(process.resourcesPath, ...s)
//   resolveMigrationsDirectory()   -> <Resources>/drizzle/migrations
//   resolveNextServerCommand(prod) -> <Resources>/standalone/server.js
// Every extraResources entry below exists to satisfy one of those, so a rename
// here breaks startup at runtime rather than at build time. Keep them in sync.

const { cpSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Copy the standalone server's node_modules into the packaged Resources tree.
 *
 * extraResources refuses to carry node_modules — electron-builder assumes it owns
 * dependency packing — and does so silently: the first build produced a
 * standalone tree with zero of its 83 traced packages, packaged cleanly, and only
 * failed when the app tried to load better-sqlite3 at runtime. Copying here in
 * afterPack sidesteps that filter entirely.
 */
function copyStandaloneNodeModules(resourcesDir, projectDir) {
  const from = join(projectDir, '.next', 'standalone', 'node_modules');
  const to = join(resourcesDir, 'standalone', 'node_modules');
  if (!existsSync(from)) {
    throw new Error(`Missing traced standalone node_modules at ${from} — run \`next build\` first`);
  }
  // verbatimSymlinks: pnpm's default isolated layout is relative symlinks into
  // .pnpm, which keep resolving once the whole tree is copied. Following them
  // instead would resolve to absolutes and bake this machine's paths into the
  // shipped app. CI sidesteps the question entirely with node-linker=hoisted —
  // Windows links these as junctions, which are absolute and would not survive
  // the copy at all.
  cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}

// electron-builder hands afterPack an `Arch` enum member, not a string.
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

/** prebuildify names its binaries `<platform>-<arch>.node`. */
function prebuildTriple(electronPlatformName, arch) {
  const archName = ARCH_NAMES[arch];
  if (archName === undefined) throw new Error(`Unknown electron-builder arch: ${arch}`);
  return `${electronPlatformName}-${archName}`;
}

/**
 * Locate better-sqlite3's prebuilt binary under either node_modules layout.
 *
 * CI installs with `node-linker=hoisted` so the tree copied into the app has no
 * symlinks to survive (Windows junctions are absolute and would bake in the
 * build machine's paths); a local `pnpm dist:mac` keeps pnpm's default isolated
 * layout. Both have to pass, and neither may hardcode a version.
 */
function findSqlitePrebuild(nodeModulesDir, triple) {
  const hoisted = join(nodeModulesDir, 'better-sqlite3', 'prebuilds', `${triple}.node`);
  if (existsSync(hoisted)) return hoisted;

  const pnpmDir = join(nodeModulesDir, '.pnpm');
  if (!existsSync(pnpmDir)) return null;
  const packageDir = readdirSync(pnpmDir).find((name) => name.startsWith('better-sqlite3@'));
  if (packageDir === undefined) return null;

  const isolated = join(
    pnpmDir,
    packageDir,
    'node_modules',
    'better-sqlite3',
    'prebuilds',
    `${triple}.node`,
  );
  return existsSync(isolated) ? isolated : null;
}

/**
 * Fail the build for the "packages fine, cannot start" class of defect.
 *
 * Every entry here is a path the main process resolves at runtime, so a silent
 * copy failure would otherwise only surface as a broken app on a user's machine.
 */
function verifyPackagedLayout(resourcesDir, electronPlatformName, arch) {
  const required = [
    'standalone/server.js',
    'standalone/.next/static',
    'standalone/public',
    'standalone/node_modules',
    'drizzle/migrations',
    'splash.html',
    'startup-error.html',
    // `node -r <missing>` aborts before the entry script, so omitting this would
    // stop the server from ever starting. Catch it at build time instead.
    'next-title-guard.js',
  ];
  const missing = required.filter((entry) => !existsSync(join(resourcesDir, entry)));
  if (missing.length > 0) {
    throw new Error(`Packaged app is missing required resources: ${missing.join(', ')}`);
  }

  const migrations = readdirSync(join(resourcesDir, 'drizzle', 'migrations')).filter((name) =>
    name.endsWith('.sql'),
  );
  if (migrations.length === 0) {
    throw new Error('Packaged app has no migration SQL — the app would start with no tables');
  }

  // better-sqlite3 ships prebuildify N-API binaries; without the one matching
  // the target platform AND arch the database cannot open at all. Checking the
  // target rather than the host is what makes a cross-arch mistake loud: an
  // arm64 binary in an x64 dmg builds cleanly and crashes on first launch.
  const triple = prebuildTriple(electronPlatformName, arch);
  const prebuild = findSqlitePrebuild(join(resourcesDir, 'standalone', 'node_modules'), triple);
  if (prebuild === null) {
    throw new Error(`Missing better-sqlite3 prebuild for ${triple} in the packaged app`);
  }
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  afterPack: async (context) => {
    const resourcesDir =
      context.electronPlatformName === 'darwin'
        ? join(
            context.appOutDir,
            `${context.packager.appInfo.productFilename}.app`,
            'Contents',
            'Resources',
          )
        : join(context.appOutDir, 'resources');

    copyStandaloneNodeModules(resourcesDir, context.packager.projectDir);
    verifyPackagedLayout(resourcesDir, context.electronPlatformName, context.arch);
    console.log(`  • packaged layout verified (${prebuildTriple(context.electronPlatformName, context.arch)})`);
  },

  appId: 'com.jadeai.desktop',
  productName: 'JadeAI',
  directories: {
    buildResources: 'resources/build',
    output: 'release',
  },

  // Only the compiled main/preload bundles belong in the asar. Everything the
  // Next child process reads goes through extraResources instead: it runs as a
  // separate process and cannot read from inside an asar archive.
  files: [
    'out/main/**',
    'out/preload/**',
    'package.json',
    '!**/*.map',
    '!src{,/**/*}',
    '!electron{,/**/*}',
    '!scripts{,/**/*}',
    '!docs{,/**/*}',
    '!config{,/**/*}',
    '!drizzle{,/**/*}',
    '!test{,/**/*}',
    '!images{,/**/*}',
    '!data{,/**/*}',
    '!jadeai-data{,/**/*}',
    '!.next{,/**/*}',
    '!release{,/**/*}',
    '!{README.md,README.zh-CN.md,ARCHITECTURE.md,FEATURE-IDEAS.md,Dockerfile,docker_run_local.sh}',
    '!{blog-zh.md,blog-zh-2.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml,pnpm-workspace.yaml}',
    '!{tsconfig.json,tsconfig.tsbuildinfo,eslint.config.mjs,vitest.config.ts,postcss.config.mjs}',
    '!{drizzle.config.ts,next.config.ts,components.json,next-env.d.ts}',
  ],

  extraResources: [
    // The Next standalone server, forked by the main process in production.
    // node_modules is copied separately in afterPack — extraResources drops it.
    { from: '.next/standalone', to: 'standalone' },
    // Next requires these two beside the standalone server; it does not copy
    // them itself (documented Next behaviour, not an oversight here).
    { from: '.next/static', to: 'standalone/.next/static' },
    { from: 'public', to: 'standalone/public' },
    // Drizzle migrations, handed to the child as JADE_MIGRATIONS_DIR. Phase 1
    // made a missing migrations dir throw loudly, so getting this path wrong
    // fails the app at startup instead of silently leaving an empty database.
    { from: 'drizzle/migrations', to: 'drizzle/migrations' },
    // Splash and error pages are resolved at the resource ROOT, without a
    // `resources/` prefix — resolveResourceFile() joins straight onto
    // process.resourcesPath.
    { from: 'resources/splash.html', to: 'splash.html' },
    { from: 'resources/startup-error.html', to: 'startup-error.html' },
    // Preloaded into the Next child via `node -r`; see the file for why.
    { from: 'resources/next-title-guard.js', to: 'next-title-guard.js' },
    { from: 'resources/build/icon.png', to: 'build/icon.png' },
  ],

  // better-sqlite3 13 ships prebuildify N-API binaries for 8 platform triples,
  // so there is nothing to compile. Leaving this on would try to rebuild it
  // against Electron's V8 headers, which fails outright for this package.
  npmRebuild: false,

  // No arch here on purpose: it comes from the CLI (`--mac --arm64`, `--mac
  // --x64`), because each arch must be built on a runner of that arch. Native
  // modules cannot be cross-packaged — an arm64 better-sqlite3 in an x64 dmg
  // builds cleanly and crashes on first launch, which afterPack now catches.
  mac: {
    icon: 'resources/build/icon.icns',
    category: 'public.app-category.productivity',
    target: ['dmg'],
    // No Developer ID in this environment: ship an ad-hoc signature so the app
    // runs locally after the user clears Gatekeeper once. A release build would
    // set hardenedRuntime + notarize and sign with a real identity.
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },

  dmg: {
    artifactName: 'JadeAI-${version}-mac-${arch}.${ext}',
  },

  win: {
    // Generated from the 1024px png; there is no separate .ico to keep in sync.
    icon: 'resources/build/icon.png',
    target: ['nsis'],
  },

  nsis: {
    // Per-user install with a directory choice, not a silent one-click: this is
    // an unsigned installer, and a visible install flow is less alarming than a
    // one-click that writes somewhere the user never chose. Per-user also means
    // no UAC prompt, which an unsigned binary would make people refuse.
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'JadeAI',
    artifactName: 'JadeAI-${version}-win-${arch}-setup.${ext}',
  },
};
