import { spawn as spawnProcess, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';

export type ServerMode = 'development' | 'production';

export interface ServerPaths {
  appRoot: string;
  assetRoot: string;
  /**
   * Absolute path to resources/next-title-guard.js, preloaded into the child.
   * Passed in rather than derived: only the caller knows whether resources live
   * in the repo or in Contents/Resources (see app-paths.resolveResourceFile).
   */
  titleGuardScript: string;
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

/** Resolves true if this process can bind `port` on loopback right now. */
export async function isLoopbackPortBindable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * The port a fresh install serves on.
 *
 * Picked out of 30000–32767 on purpose. That band sits **below** every
 * mainstream OS's ephemeral range (macOS and Windows start at 49152, Linux at
 * 32768), so the kernel never hands this number out to some other process's
 * outbound connection — which is exactly what could steal the OS-assigned port
 * we used to start on. It is also well above the crowd of dev-server defaults
 * (3000 / 5173 / 8000 / 8080 / 9000 …) and the popular local AI servers
 * (11434 Ollama, 7860 Gradio, 8188 ComfyUI), and 32400 (Plex) is the only
 * well-known service nearby.
 *
 * The exact digits are arbitrary — the requirement is only "fixed, in that
 * band, not somebody else's default".
 */
export const PREFERRED_SERVER_PORT = 30567;

/** How many ports after the preferred one to try before giving up on a fixed number. */
const PORT_SCAN_RANGE = 10;

export interface ServerPortDeps {
  isLoopbackPortBindable: (port: number) => Promise<boolean>;
  allocateLoopbackPort: () => Promise<number>;
}

/**
 * Pick the port to serve on: last launch's port, then the fixed preferred one,
 * then whatever the OS will give us.
 *
 * The port is part of the page's origin, and Chromium partitions localStorage,
 * IndexedDB and cookies by origin — so a fresh port every launch handed the
 * renderer an empty storage area each time, silently discarding the saved API
 * keys and the "tour already seen" flag. Keeping the port stable keeps the
 * storage stable.
 *
 * A stored port still wins over the preferred one. Existing installs are
 * already serving on an OS-assigned port with an API key sitting in that
 * origin's localStorage; moving them to the new port to make things tidy would
 * throw that key away.
 *
 * If the preferred port is busy we walk a few neighbours before falling back to
 * `listen(0)`. Both fallbacks exist so a port conflict can never stop the app
 * from starting — losing web storage for a session beats not launching.
 */
export async function resolveServerPort(
  storedPort: number | null,
  deps: ServerPortDeps,
): Promise<number> {
  if (storedPort !== null && (await deps.isLoopbackPortBindable(storedPort))) {
    return storedPort;
  }
  for (let port = PREFERRED_SERVER_PORT; port < PREFERRED_SERVER_PORT + PORT_SCAN_RANGE; port++) {
    if (await deps.isLoopbackPortBindable(port)) {
      return port;
    }
  }
  return deps.allocateLoopbackPort();
}

export function resolveNextServerCommand(
  mode: ServerMode,
  paths: ServerPaths,
  port: number,
): NextServerCommand {
  // Preload first: the guard has to neutralise process.title before Next's own
  // code runs and assigns it. See resources/next-title-guard.js for why.
  //
  // `--require=x` as ONE argv element, not `-r x`. `next dev` re-execs node and
  // forwards these flags through NODE_OPTIONS, where the short form arrives as
  // `--r=x` and node rejects it outright ("--r= is not allowed in NODE_OPTIONS"),
  // killing the dev server on startup. The long form is on NODE_OPTIONS'
  // allowlist, so it survives the round-trip — and reaches next dev's
  // next-server grandchild, which is the process that sets the title in dev.
  const preload = [`--require=${paths.titleGuardScript}`];
  if (mode === 'development') {
    return {
      args: [
        ...preload,
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
  return { args: [...preload, join(standaloneDir, 'server.js')], cwd: standaloneDir };
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
  /**
   * Port from the previous launch, reused when still bindable to keep the page
   * origin — and therefore the renderer's localStorage — stable. null on a
   * first launch. See resolveServerPort.
   */
  preferredPort: number | null;
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

export interface KillTreeDeps {
  platform: NodeJS.Platform;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  spawn: typeof spawnProcess;
}

/**
 * Terminate `pid` AND its descendants.
 *
 * `next dev` does not serve requests itself — it forks `next-server` as a
 * grandchild. Signalling only the direct child left that grandchild alive,
 * still holding the port, and nothing ever reaped it.
 *
 * POSIX: the child is spawned `detached: true`, which makes it the leader of a
 * new process group, so a negative pid signals the whole group in one call.
 * That is also why `detached` is not optional — without it the child shares
 * OUR group and a negative pid would signal the main process too.
 *
 * Windows has no process groups to signal; `process.kill` with a negative pid
 * throws there, and a plain `child.kill()` documentedly leaves descendants
 * running. `taskkill /T` is the platform's equivalent.
 */
export function killProcessTree(pid: number, deps: KillTreeDeps): void {
  if (deps.platform === 'win32') {
    deps.spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    deps.kill(-pid, 'SIGTERM');
  } catch (error) {
    // ESRCH means no such process group: `detached` did not take effect, or the
    // group is already gone. Fall back to the single pid — killing one process
    // beats killing none. Any other error is real and should surface.
    if ((error as NodeJS.ErrnoException)?.code !== 'ESRCH') throw error;
    try {
      deps.kill(pid, 'SIGTERM');
    } catch {
      // Already dead. Nothing left to reap.
    }
  }
}

/**
 * Collaborators `NextServerHost` calls out to, injectable purely so
 * `start()`'s failure-cleanup path (see the class doc comment) and the
 * process-tree teardown can be exercised without spawning a real Next
 * process or waiting out a real timeout. Production code always uses the
 * defaults.
 */
export interface NextServerHostDeps {
  spawn: typeof spawnProcess;
  waitForHealthy: typeof waitForHealthy;
  allocateLoopbackPort: typeof allocateLoopbackPort;
  isLoopbackPortBindable: typeof isLoopbackPortBindable;
  killProcessTree: (pid: number) => void;
}

const defaultDeps: NextServerHostDeps = {
  spawn: spawnProcess,
  waitForHealthy,
  allocateLoopbackPort,
  isLoopbackPortBindable,
  killProcessTree: (pid) =>
    killProcessTree(pid, {
      platform: process.platform,
      kill: (target, signal) => {
        process.kill(target, signal);
      },
      spawn: spawnProcess,
    }),
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

    const port = await resolveServerPort(options.preferredPort, {
      isLoopbackPortBindable: this.deps.isLoopbackPortBindable,
      allocateLoopbackPort: this.deps.allocateLoopbackPort,
    });
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
      // Own process group, so killOwnedChild() can signal the whole tree —
      // `next dev`'s next-server grandchild included. See killProcessTree.
      // Deliberately NOT followed by child.unref(): we still want to track it.
      detached: process.platform !== 'win32',
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
    if (child.pid === undefined) {
      // Spawn failed outright, so there is no group to signal — and no pid to
      // negate, which would make killProcessTree signal something arbitrary.
      child.kill('SIGTERM');
      return;
    }
    this.deps.killProcessTree(child.pid);
  }

  /** Kill the child. Called on quit so no orphan keeps holding the port. */
  stop(): void {
    this.killOwnedChild();
  }
}
