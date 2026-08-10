import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  allocateLoopbackPort,
  NextServerHost,
  resolveNextServerCommand,
  waitForHealthy,
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
  const paths = { appRoot: '/repo', assetRoot: '/Resources' };

  // Path expectations go through join() for the same cross-platform reason as
  // data-path.test.ts — the flags and port are plain strings and stay literal.
  it('runs next dev bound to loopback in development', () => {
    const command = resolveNextServerCommand('development', paths, 41234);
    expect(command.args).toEqual([
      join('/repo', 'node_modules', 'next', 'dist', 'bin', 'next'),
      'dev',
      '--turbopack',
      '-H',
      '127.0.0.1',
      '-p',
      '41234',
    ]);
    expect(command.cwd).toBe('/repo');
  });

  it('runs the standalone server in production', () => {
    const command = resolveNextServerCommand('production', paths, 41234);
    expect(command.args).toEqual([join('/Resources', 'standalone', 'server.js')]);
    expect(command.cwd).toBe(join('/Resources', 'standalone'));
  });
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
// 'exit' event, kill(), exitCode) for NextServerHost to drive.
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.kill = vi.fn();
  return child;
}

describe('NextServerHost start() failure cleanup', () => {
  const options = {
    mode: 'production' as const,
    paths: { appRoot: '/repo', assetRoot: '/Resources' },
    databaseFile: '/data/app.sqlite',
    migrationsDir: '/Resources/drizzle/migrations',
    onUnexpectedExit: vi.fn(),
  };

  // Pins the Step 5 decision: a start() that spawns successfully but never
  // becomes healthy must not leave an unmanaged live child behind — otherwise
  // a second start() (without an intervening stop()) overwrites the
  // instance's only reference to it and it leaks forever, still holding its
  // port. See the "killOwnedChild" call in the catch branch of start().
  it('kills the spawned child when the health probe times out, so it is not orphaned', async () => {
    const fakeChild = makeFakeChild();
    const spawnImpl = vi.fn().mockReturnValue(fakeChild);
    const waitForHealthyImpl = vi.fn().mockRejectedValue(new Error('did not become healthy'));
    const allocateLoopbackPortImpl = vi.fn().mockResolvedValue(41234);

    const host = new NextServerHost({
      spawn: spawnImpl as never,
      waitForHealthy: waitForHealthyImpl,
      allocateLoopbackPort: allocateLoopbackPortImpl,
    });

    await expect(host.start(options)).rejects.toThrow(/did not become healthy/);

    expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
    // The self-inflicted kill must not be reported as an unexpected exit.
    fakeChild.emit('exit', null, 'SIGTERM');
    expect(options.onUnexpectedExit).not.toHaveBeenCalled();

    // A follow-up stop() must be a safe no-op — the failed attempt already
    // cleaned up its own child, so there is nothing left to kill again.
    fakeChild.kill.mockClear();
    host.stop();
    expect(fakeChild.kill).not.toHaveBeenCalled();
  });
});
