import { join } from 'node:path';

/**
 * Where drizzle should look for migration SQL.
 *
 * In a packaged desktop build the process cwd is not the repo root, so the
 * Electron main process passes JADE_MIGRATIONS_DIR pointing at the copy under
 * process.resourcesPath. Everywhere else we fall back to the repo layout.
 */
export function resolveMigrationsDir(
  env: Record<string, string | undefined>,
  cwd: string,
): string {
  const override = env.JADE_MIGRATIONS_DIR;
  if (override) {
    return override;
  }
  return join(cwd, 'drizzle', 'migrations');
}
