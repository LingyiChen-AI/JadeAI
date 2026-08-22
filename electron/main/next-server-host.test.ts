import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  allocateLoopbackPort,
  isLoopbackPortBindable,
  killProcessTree,
  NextServerHost,
  resolveNextServerCommand,
  resolveNodeExecutable,
  resolveServerPort,
  waitForHealthy,
  PREFERRED_SERVER_PORT,
} from './next-server-host';

describe('allocateLoopbackPort', () => {
  it('returns a usable port number', async () => {
    const port = await allocateLoopbackPort();
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThan(65536);
  });

  it('does not hand out the same port twice in a row', async () => {
    const [first, second] = await Promise.all([allocateLoopbackPort(), allocateLoopbackPort()]);
    expect(first).not.toBe(second);
  });
});

describe('resolveNextServerCommand', () => {
  const GUARD = join('/Resources', 'next-title-guard.js');
  const PRELOAD = `--require=${GUARD}`;
  const paths = { appRoot: '/repo', assetRoot: '/Resources', titleGuardScript: GUARD };

  // Path expectations go through join() for the same cross-platform reason as
  // data-path.test.ts — the flags and port are plain strings and stay literal.
  it('runs next dev bound to loopback in development', () => {
    const command = resolveNextServerCommand('development', paths, 41234);
    expect(command.args).toEqual([
      PRELOAD,
      join('/repo', 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      '--turbopack',
      '-H',
      '127.0.0.1',
      '-p',
      String(41234),
    ]);
    expect(command.cwd).toBe('/repo');
  });

  it('runs the standalone server in production', () => {
    const command = resolveNextServerCommand('production', paths, 41234);
    expect(command.args).toEqual([PRELOAD, join('/Resources', 'standalone', 'server.js')]);
    expect(command.cwd).toBe(join('/Resources', 'standalone'));
  });

  // Ordering is the point of the guard: Next assigns process.title while its own
  // entry script runs, so a preload landing after the script is too late and the
  // child still registers a dock icon.
  it.each(['development', 'production'] as const)(
    'preloads the title guard before the entry script in %s',
    (mode) => {
      const { args } = resolveNextServerCommand(mode, paths, 41234);
      expect(args[0]).toBe(PRELOAD);
      expect(args.length).toBeGreaterThan(1);
    },
  );

  // Regression: the short `-r <path>` form killed `next dev` outright. Next
  // re-execs node and forwards these flags through NODE_OPTIONS, which receives
  // the short form as `--r=<path>` and refuses it ("--r= is not allowed in
  // NODE_OPTIONS"). Only the single-element long form survives that round-trip.
  it.each(['development', 'production'] as const)(
    'uses the NODE_OPTIONS-safe --require= form in %s, never -r',
    (mode) => {
      const { args } = resolveNextServerCommand(mode, paths, 41234);
      expect(args).not.toContain('-r');
      expect(args.filter((arg) => arg.includes('next-title-guard.js'))).toEqual([
        `--require=${GUARD}`,
      ]);
    },
  );
});

describe('waitForHealthy', () => {
  const sleep = () => Promise.resolve();

  it('resolves as soon as the probe returns ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await expect(
      waitForHealthy('http://127.0.0.1:1/api/health', { fetch: fetchImpl, sleep, now: () => 0 }, {
        timeoutMs: 1000,
        intervalMs: 10,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // `next dev` refuses connections for a second or two before it listens, so
  // a thrown fetch must be a retry, not a failure.
  it('retries while the connection is refused', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ ok: true });
    await waitForHealthy('http://127.0.0.1:1/api/health', { fetch: fetchImpl, sleep, now: () => 0 }, {
      timeoutMs: 1000,
      intervalMs: 10,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects once the deadline passes', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    let clock = 0;
    await expect(
      waitForHealthy(
        'http://127.0.0.1:1/api/health',
        {
          fetch: fetchImpl,
          sleep: () => {
            clock += 500;
            return Promise.resolve();
          },
          now: () => clock,
        },
        { timeoutMs: 1000, intervalMs: 500 },
      ),
    ).rejects.toThrow(/did not become healthy/);
  });

  it('treats a non-ok response as not ready yet', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    await waitForHealthy('http://127.0.0.1:1/api/health', { fetch: fetchImpl, sleep, now: () => 0 }, {
      timeoutMs: 1000,
      intervalMs: 10,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// Minimal ChildProcess stand-in: just enough surface (stdout/stderr streams,
// 'exit' event, kill(), exitCode, pid) for NextServerHost to drive.
//
// `pid` matters: killOwnedChild() falls back to child.kill() when it is
// undefined (the spawn-failed path). A fake without one would keep the old
// child.kill() assertions green while never exercising the process-tree kill
// that teardown actually uses now.
function makeFakeChild(pid = 4242) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    pid: number | undefined;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.pid = pid;
  child.kill = vi.fn();
  return child;
}

describe('NextServerHost start() failure cleanup', () => {
  const options = {
    mode: 'production' as const,
    paths: { appRoot: '/repo', assetRoot: '/Resources', titleGuardScript: '/Resources/next-title-guard.js' },
    databaseFile: '/data/app.sqlite',
    migrationsDir: '/Resources/drizzle/migrations',
    preferredPort: null,
    onUnexpectedExit: vi.fn(),
  };

  // Pins the Step 5 decision: a start() that spawns successfully but never
  // becomes healthy must not leave an unmanaged live child behind — otherwise
  // a second start() (without an intervening stop()) overwrites the
  // instance's only reference to it and it leaks forever, still holding its
  // port. See the "killOwnedChild" call in the catch branch of start().
  it('kills the spawned child when the health probe times out, so it is not orphaned', async () => {
    const fakeChild = makeFakeChild(4242);
    const spawnImpl = vi.fn().mockReturnValue(fakeChild);
    const waitForHealthyImpl = vi.fn().mockRejectedValue(new Error('did not become healthy'));
    const allocateLoopbackPortImpl = vi.fn().mockResolvedValue(41234);
    const killProcessTreeImpl = vi.fn();

    const host = new NextServerHost({
      spawn: spawnImpl as never,
      waitForHealthy: waitForHealthyImpl,
      allocateLoopbackPort: allocateLoopbackPortImpl,
      killProcessTree: killProcessTreeImpl,
    });

    await expect(host.start(options)).rejects.toThrow(/did not become healthy/);

    expect(killProcessTreeImpl).toHaveBeenCalledWith(4242);
    // The self-inflicted kill must not be reported as an unexpected exit.
    fakeChild.emit('exit', null, 'SIGTERM');
    expect(options.onUnexpectedExit).not.toHaveBeenCalled();

    // A follow-up stop() must be a safe no-op — the failed attempt already
    // cleaned up its own child, so there is nothing left to kill again.
    killProcessTreeImpl.mockClear();
    host.stop();
    expect(killProcessTreeImpl).not.toHaveBeenCalled();
  });

  // Guards the negation in killProcessTree: process.kill(-pid) with no pid to
  // negate would signal an arbitrary group, so the spawn-failed case must stay
  // on the plain child.kill() path.
  it('falls back to child.kill when the spawn produced no pid', async () => {
    const fakeChild = makeFakeChild(4242);
    fakeChild.pid = undefined;
    const killProcessTreeImpl = vi.fn();

    const host = new NextServerHost({
      spawn: vi.fn().mockReturnValue(fakeChild) as never,
      waitForHealthy: vi.fn().mockRejectedValue(new Error('did not become healthy')),
      allocateLoopbackPort: vi.fn().mockResolvedValue(41234),
      killProcessTree: killProcessTreeImpl,
    });

    await expect(host.start(options)).rejects.toThrow(/did not become healthy/);

    expect(killProcessTreeImpl).not.toHaveBeenCalled();
    expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
  });

  // `next dev` serves from a forked next-server grandchild. Signalling only the
  // direct child left it alive holding the port, so the child must be spawned
  // into its own process group for a group kill to be possible at all.
  it('spawns the child detached on posix so its whole group can be signalled', async () => {
    const spawnImpl = vi.fn().mockReturnValue(makeFakeChild());

    const host = new NextServerHost({
      spawn: spawnImpl as never,
      waitForHealthy: vi.fn().mockResolvedValue(undefined),
      allocateLoopbackPort: vi.fn().mockResolvedValue(41234),
      killProcessTree: vi.fn(),
    });
    await host.start(options);

    expect(spawnImpl.mock.calls[0][2]).toMatchObject({
      detached: process.platform !== 'win32',
    });
  });
});

describe('killProcessTree', () => {
  const posix = { platform: 'darwin' as NodeJS.Platform };

  it('signals the negated pid so the whole process group dies', () => {
    const kill = vi.fn();
    killProcessTree(4242, { ...posix, kill, spawn: vi.fn() as never });
    expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  // ESRCH means the group is gone or `detached` never took effect. Killing the
  // one process we know about beats killing nothing.
  it('falls back to the single pid when the group does not exist', () => {
    const kill = vi.fn().mockImplementationOnce(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });
    killProcessTree(4242, { ...posix, kill, spawn: vi.fn() as never });
    expect(kill).toHaveBeenNthCalledWith(1, -4242, 'SIGTERM');
    expect(kill).toHaveBeenNthCalledWith(2, 4242, 'SIGTERM');
  });

  // Any other errno is a real fault (EPERM, for instance) and must not be
  // quietly downgraded into a single-process kill that also fails.
  it('rethrows errors other than ESRCH', () => {
    const kill = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
    });
    expect(() => killProcessTree(4242, { ...posix, kill, spawn: vi.fn() as never })).toThrow(
      /EPERM/,
    );
    expect(kill).toHaveBeenCalledTimes(1);
  });

  // Windows has no process group to signal and child.kill() documentedly
  // leaves descendants running; /T is what reaches them.
  it('uses taskkill /T on windows', () => {
    const spawn = vi.fn();
    const kill = vi.fn();
    killProcessTree(4242, { platform: 'win32', kill, spawn: spawn as never });
    expect(kill).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4242', '/T', '/F'],
      expect.objectContaining({ stdio: 'ignore' }),
    );
  });
});

describe('resolveServerPort', () => {
  // The point of the whole mechanism: the port is part of the page origin, and
  // Chromium keys localStorage on the origin. Reusing it is what keeps the
  // renderer's saved API keys and "tour seen" flag alive across launches.
  it('reuses the stored port when it is still bindable', async () => {
    const allocate = vi.fn();
    const port = await resolveServerPort(41234, {
      isLoopbackPortBindable: vi.fn().mockResolvedValue(true),
      allocateLoopbackPort: allocate,
    });
    expect(port).toBe(41234);
    expect(allocate).not.toHaveBeenCalled();
  });

  // A fixed port below every OS's ephemeral range: the kernel can never hand it
  // to another process's outbound connection, so it stays ours between launches.
  it('uses the preferred port on a first launch', async () => {
    const allocate = vi.fn();
    const port = await resolveServerPort(null, {
      isLoopbackPortBindable: vi.fn().mockResolvedValue(true),
      allocateLoopbackPort: allocate,
    });
    expect(port).toBe(PREFERRED_SERVER_PORT);
    expect(allocate).not.toHaveBeenCalled();
  });

  it('walks past the preferred port when something already holds it', async () => {
    const port = await resolveServerPort(null, {
      isLoopbackPortBindable: vi
        .fn()
        .mockImplementation(async (p: number) => p === PREFERRED_SERVER_PORT + 2),
      allocateLoopbackPort: vi.fn(),
    });
    expect(port).toBe(PREFERRED_SERVER_PORT + 2);
  });

  // Failing to start is worse than losing web storage for one session.
  it('falls back to an OS-assigned port when the whole preferred range is taken', async () => {
    const port = await resolveServerPort(41234, {
      isLoopbackPortBindable: vi.fn().mockResolvedValue(false),
      allocateLoopbackPort: vi.fn().mockResolvedValue(51000),
    });
    expect(port).toBe(51000);
  });

  it('keeps an existing install on its stored port, API key and all', async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const port = await resolveServerPort(41234, {
      isLoopbackPortBindable: probe,
      allocateLoopbackPort: vi.fn(),
    });
    expect(port).toBe(41234);
    expect(probe).toHaveBeenCalledTimes(1); // 没去试首选端口
  });

  it('preferred port sits below every OS ephemeral range and above the dev-server crowd', () => {
    expect(PREFERRED_SERVER_PORT).toBeGreaterThanOrEqual(30000);
    // Linux 的临时端口从 32768 起，整段扫描都必须留在它下面
    expect(PREFERRED_SERVER_PORT + 10).toBeLessThan(32768);
  });
});

describe('isLoopbackPortBindable', () => {
  it('reports true for a free port and false while it is held', async () => {
    const free = await allocateLoopbackPort();
    expect(await isLoopbackPortBindable(free)).toBe(true);

    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(free, '127.0.0.1', resolve));
    try {
      expect(await isLoopbackPortBindable(free)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });
});

describe('NextServerHost stale exit handling across retries', () => {
  const makeOptions = (onUnexpectedExit: (code: number | null, signal: NodeJS.Signals | null) => void) => ({
    mode: 'production' as const,
    paths: { appRoot: '/repo', assetRoot: '/Resources', titleGuardScript: '/Resources/next-title-guard.js' },
    databaseFile: '/data/app.sqlite',
    migrationsDir: '/Resources/drizzle/migrations',
    preferredPort: null,
    onUnexpectedExit,
  });

  // Reproduces the cross-start() race: stop() kills the child asynchronously
  // (SIGTERM delivery + process teardown take real wall-clock time), so a
  // retried start() routinely installs a new child *before* the old child's
  // 'exit' event arrives. Without an identity check in the 'exit' handler,
  // that stale event nulls out the reference to the *live* new child —
  // silently turning every later stop() into a no-op and leaving the live
  // Next server running past app quit (an orphan).
  it('does not let a stale exit from a superseded child clear the live child, so stop() still kills it', async () => {
    const child1 = makeFakeChild(4001);
    const child2 = makeFakeChild(4002);
    const spawnImpl = vi.fn().mockReturnValueOnce(child1).mockReturnValueOnce(child2);
    const waitForHealthyImpl = vi.fn().mockResolvedValue(undefined);
    const allocateLoopbackPortImpl = vi
      .fn()
      .mockResolvedValueOnce(41001)
      .mockResolvedValueOnce(41002);
    const onUnexpectedExit = vi.fn();
    const killProcessTreeImpl = vi.fn();

    const host = new NextServerHost({
      spawn: spawnImpl as never,
      waitForHealthy: waitForHealthyImpl,
      allocateLoopbackPort: allocateLoopbackPortImpl,
      killProcessTree: killProcessTreeImpl,
    });

    await host.start(makeOptions(onUnexpectedExit));

    // Retry: stop() signals child1's group, but — matching the real
    // ChildProcess contract — the 'exit' event has not landed yet.
    host.stop();
    expect(killProcessTreeImpl).toHaveBeenCalledWith(4001);

    // A second start() happens before that stale exit arrives (this is
    // exactly what the retry button, and macOS `activate`, do).
    await host.start(makeOptions(onUnexpectedExit));
    expect(spawnImpl).toHaveBeenCalledTimes(2);

    // Now child1's exit finally lands, after this.child already points at
    // child2.
    child1.exitCode = 0;
    child1.emit('exit', 0, 'SIGTERM');

    // A superseded attempt dying is not "the current server exited
    // unexpectedly" — it must not surface as such.
    expect(onUnexpectedExit).not.toHaveBeenCalled();

    // Quit-time stop() must still kill the live (child2) process, not no-op
    // because a stale event already cleared the reference.
    killProcessTreeImpl.mockClear();
    host.stop();
    expect(killProcessTreeImpl).toHaveBeenCalledWith(4002);
  });
});

describe('resolveNodeExecutable', () => {
  const ELECTRON = '/Apps/JadeAI.app/Contents/MacOS/JadeAI';
  const REAL_NODE = '/Users/me/.nvm/versions/node/v24.12.0/bin/node';

  // `next dev` forks next-server as a grandchild WITHOUT propagating
  // ELECTRON_RUN_AS_NODE. Under Electron's binary that grandchild starts as a
  // full GUI app and macOS gives it a second dock icon. Real Node avoids it.
  it('uses the real node handed down by the dev loop in development', () => {
    expect(
      resolveNodeExecutable('development', { JADE_DEV_NODE_PATH: REAL_NODE }, ELECTRON),
    ).toBe(REAL_NODE);
  });

  // A packaged app has no Node other than Electron's own binary.
  it('always uses the electron binary in production', () => {
    expect(
      resolveNodeExecutable('production', { JADE_DEV_NODE_PATH: REAL_NODE }, ELECTRON),
    ).toBe(ELECTRON);
  });

  // `electron .` run by hand has no dev loop to hand the path down.
  it('falls back to the electron binary when the dev path is absent', () => {
    expect(resolveNodeExecutable('development', {}, ELECTRON)).toBe(ELECTRON);
  });
});
