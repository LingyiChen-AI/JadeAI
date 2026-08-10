import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { app } from 'electron';

const DEV_SUFFIX = '-dev';

export function resolveUserDataDir(defaultDir: string, isDevelopment: boolean): string {
  if (!isDevelopment) {
    return defaultDir;
  }
  const name = basename(defaultDir);
  if (name.endsWith(DEV_SUFFIX)) {
    return defaultDir;
  }
  return join(dirname(defaultDir), `${name}${DEV_SUFFIX}`);
}

// Why captured once instead of resolved per call: app.setName() changes how
// app.getPath('userData') resolves, and re-resolving later can point at a
// differently-cased directory — which on a case-sensitive filesystem reads as
// "all my data vanished". This is orca's initDataPath() lesson.
let capturedUserDataDir: string | null = null;

/**
 * Redirect and capture the userData directory.
 *
 * MUST be called after app.setName() and before anything reads a data path.
 */
export function initDataPath(isDevelopment: boolean): string {
  const redirected = resolveUserDataDir(app.getPath('userData'), isDevelopment);
  app.setPath('userData', redirected);
  mkdirSync(redirected, { recursive: true });
  capturedUserDataDir = redirected;
  return redirected;
}

export function getCanonicalUserDataPath(): string {
  if (!capturedUserDataDir) {
    throw new Error('initDataPath() must be called before reading the data path');
  }
  return capturedUserDataDir;
}

export function getDatabaseFile(): string {
  return join(getCanonicalUserDataPath(), 'jade.db');
}

export function getSettingsFile(): string {
  return join(getCanonicalUserDataPath(), 'jade-settings.json');
}
