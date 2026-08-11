import { spawn as spawnProcess, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';

export type ServerMode = 'development' | 'production';

export interface ServerPaths {
  appRoot: string;
  assetRoot: string;
}

export interface NextServerCommand {
  args: string[];
  cwd: string;
}

/**
 * Reserve a free loopback port by binding to 0 and immediately releasing it.
 *
 * Next needs PORT handed to it up front: neither `next dev` nor the standalone
 * server reports back which port it chose. There is a TOCTOU window between
 * release and the child's bind; on single-instance loopback that is acceptable,
 * and a lost race surfaces as the readiness timeout rather than silent breakage.
 */
export async function allocateLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a loopback port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

export function resolveNextServerCommand(
  mode: ServerMode,
  paths: ServerPaths,
  port: number,
): NextServerCommand {
  if (mode === 'development') {
    return {
      args: [
        join(paths.appRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
        'dev',
        '--turbopack',
        '-H',
        '127.0.0.1',
        '-p',
        String(port),
      ],
      cwd: paths.appRoot,
    };
  }
  const standaloneDir = join(paths.assetRoot, 'standalone');
  return { args: [join(standaloneDir, 'server.js')], cwd: standaloneDir };
}

export interface HealthDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface HealthOptions {
  timeoutMs: number;
  intervalMs: number;
}

export async function waitForHealthy(
  url: string,
  deps: HealthDeps,
  options: HealthOptions,
): Promise<void> {
  const deadline = deps.now() + options.timeoutMs;
  for (;;) {
    try {
      const response = await deps.fetch(url);
      if (response.ok) return;
    } catch {
      // Connection refused while the server is still booting — keep polling.
    }
    if (deps.now() >= deadline) {
      throw new Error(`Next server did not become healthy within ${options.timeoutMs}ms`);
    }
    await deps.sleep(options.intervalMs);
  }
}

export interface StartOptions {
  mode: ServerMode;
  paths: ServerPaths;
  databaseFile: string;
  migrationsDir: string;
  /** Called if the child exits before stop() was requested. */
  onUnexpectedExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface RunningNextServer {
  port: number;
  origin: string;
}

const READINESS_TIMEOUT_MS = 30_000;
const READINESS_INTERVAL_MS = 250;

/**
 * Executable to run the Next server with.
 *
 * `ELECTRON_RUN_AS_NODE` makes Electron's own binary behave as plain Node, which
 * is what production must use — a packaged app has no other Node available. But
 * `next dev` forks its actual server (`next-server`) as a grandchild and does
 * NOT propagate that variable, so the grandchild launches the Electron binary in
 * full GUI mode and macOS gives it a second dock icon (labelled `exec`).
 *
 * In development we therefore run the child under the real Node that started the
 * dev loop, handed down by scripts/build-electron.mjs as JADE_DEV_NODE_PATH.
 * Its grandchildren are then plain Node too. Falls back to process.execPath when
 * the variable is absent, which keeps `electron .` usable on its own.
 */
export function resolveNodeExecutable(
  mode: ServerMode,
  env: Record<string, string | undefined>,
  electronExecPath: string,
): string {
  if (mode === 'development' && env.JADE_DEV_NODE_PATH) {
    return env.JADE_DEV_NODE_PATH;
  }
  return electronExecPath;
}

/**
 * Collaborators `NextServerHost` calls out to, injectable purely so
 * `start()`'s failure-cleanup path (see the class doc comment) can be
 * exercised without spawning a real Next process or waiting out a real
 * timeout. Production code always uses the defaults.
 */
export interface NextServerHostDeps {
  spawn: typeof spawnProcess;
  waitForHealthy: typeof waitForHealthy;
  allocateLoopbackPort: typeof allocateLoopbackPort;
}

const defaultDeps: NextServerHostDeps = {
  spawn: spawnProcess,
  waitForHealthy,
  allocateLoopbackPort,
};

export class NextServerHost {
  private readonly deps: NextServerHostDeps;
  private child: ChildProcess | null = null;
  private stopping = false;

  constructor(deps: Partial<NextServerHostDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async start(options: StartOptions): Promise<RunningNextServer> {
    // A previous attempt may still be alive: the retry button fires while the
    // old child is dying, and on macOS `activate` re-enters after
    // window-all-closed without quitting. Reap it before spawning, or its
    // reference is overwritten and it survives as an orphan past quit.
    this.killOwnedChild();

    const port = await this.deps.allocateLoopbackPort();
    const command = resolveNextServerCommand(options.mode, options.paths, port);

    this.stopping = false; // must come after killOwnedChild(), which sets it true
    // ELECTRON_RUN_AS_NODE makes Electron's bundled Node run the script as a
    // plain Node process — no Chromium, no Electron APIs in the child. In dev we
    // prefer the real Node instead; see resolveNodeExecutable for why.
    const executable = resolveNodeExecutable(options.mode, process.env, process.execPath);
    const child = this.deps.spawn(executable, command.args, {
      cwd: command.cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: options.mode,
        JADE_RUNTIME: 'desktop',
        // NextAuth throws MissingSecret on every /api/auth/session call without
        // one, and SessionProvider in the layout calls it on every page load.
        // Desktop never issues a NextAuth session (resolveUser returns the single
        // local user), so the value is irrelevant — it only has to exist. Per
        // launch is therefore fine: there is no session to keep valid across runs.
        AUTH_SECRET: process.env.AUTH_SECRET ?? randomUUID(),
        SQLITE_PATH: options.databaseFile,
        JADE_MIGRATIONS_DIR: options.migrationsDir,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    child.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[next] ${chunk.toString()}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[next] ${chunk.toString()}`);
    });
    child.on('exit', (code, signal) => {
      // Only act if this child is still the owned one. stop() kills
      // asynchronously, so a superseded attempt's exit routinely arrives after
      // a newer start() has already taken over this.child — without the guard
      // it nulls the *live* child's reference, turning every later stop() into
      // a no-op and leaving a Next server running past app quit.
      if (this.child !== child) return;
      this.child = null;
      if (!this.stopping) {
        options.onUnexpectedExit(code, signal);
      }
    });

    const origin = `http://127.0.0.1:${port}`;
    try {
      await this.deps.waitForHealthy(
        `${origin}/api/health`,
        {
          fetch,
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
        },
        { timeoutMs: READINESS_TIMEOUT_MS, intervalMs: READINESS_INTERVAL_MS },
      );
    } catch (error) {
      // The child spawned but never became healthy. Without this, `this.child`
      // keeps pointing at a live, orphaned process: a caller that retries
      // start() (rather than calling stop() first) would overwrite the
      // reference and leak it forever, still holding its port.
      this.killOwnedChild();
      throw error;
    }

    return { port, origin };
  }

  private killOwnedChild(): void {
    const child = this.child;
    if (!child) return;
    // Mark as an intentional stop first so the 'exit' handler above does not
    // report this self-inflicted kill as an unexpected exit.
    this.stopping = true;
    this.child = null;
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
  }

  /** Kill the child. Called on quit so no orphan keeps holding the port. */
  stop(): void {
    this.killOwnedChild();
  }
}
