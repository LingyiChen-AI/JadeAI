import { join } from 'node:path';
import { app } from 'electron';

export interface AssetRootInput {
  isPackaged: boolean;
  resourcesPath: string;
  appRoot: string;
}

/**
 * Root that `resources/`-relative and `drizzle/`-relative assets hang off.
 *
 * Packaged: electron-builder copies them into Contents/Resources via
 * extraResources. Development: they sit in the repo as-is.
 */
export function resolveAssetRoot(input: AssetRootInput): string {
  return input.isPackaged ? input.resourcesPath : input.appRoot;
}

/** The repo root in development; the app directory when packaged. */
export function getAppRoot(): string {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

export function getAssetRoot(): string {
  return resolveAssetRoot({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appRoot: getAppRoot(),
  });
}

/** Absolute path to a file under `resources/` (dev) or `Resources/` (packaged). */
export function resolveResourceFile(...segments: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, ...segments)
    : join(getAppRoot(), 'resources', ...segments);
}

/** Absolute path to the drizzle migrations directory, for JADE_MIGRATIONS_DIR. */
export function resolveMigrationsDirectory(): string {
  return join(getAssetRoot(), 'drizzle', 'migrations');
}
