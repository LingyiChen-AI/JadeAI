# 桌面客户端 · 阶段二：Electron 壳与内嵌 Next 服务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `pnpm dev:desktop` 开出一个 Electron 窗口，里面跑着完整的 JadeAI——Next 服务由主进程拉起并只绑 `127.0.0.1`，数据落在 `userData` 下，窗口尺寸与 locale 持久化，启动失败有可重试的错误页。

**Architecture:** 主进程做四件事：把 userData 路径一次性捕获下来（dev 重定向到 `JadeAI-dev`）；用原子写维护 `jade-settings.json`；预分配一个 loopback 端口后把 Next 作为子进程拉起（dev 跑 `next dev`，生产跑 standalone `server.js`），轮询 `/api/health` 等就绪；就绪后 `loadURL` 到带 locale 前缀的地址。渲染层就是 Next 本身，preload 只暴露一个很小的设置/外壳契约。

**Tech Stack:** Electron 43、esbuild、TypeScript、vitest 4

**前置条件：** 阶段一（`docs/superpowers/plans/2026-08-10-desktop-client-data-layer.md`）已全部完成并通过验收。本阶段依赖它引入的 `JADE_RUNTIME=desktop` 与 `JADE_MIGRATIONS_DIR`。

**前置阅读：** `docs/superpowers/specs/2026-08-10-desktop-client-design.md` 的「进程模型」「开发工作流」「数据存储」三节。

---

## 与 spec 的一处偏离（已同步回 spec）

spec 原先写「子进程以 `PORT=0` 启动，通过 `process.send()` 把实际端口回传 main」。这条不成立：Next 的 standalone `server.js` 和 `next dev` 都不会调用 `process.send`——orca 能那么做是因为它 fork 的是自己写的 `daemon-entry.js`，并且它是靠**解析 stdout** 拿状态的。

本计划改为：**主进程预分配一个 loopback 空闲端口**（`net.createServer().listen(0)` 拿到端口后立刻关闭），把 `PORT=<port>` 显式传给子进程，再轮询 `/api/health` 判断就绪。好处是 dev 与生产两种模式走完全一样的代码路径，且不需要解析 stdout。分配与实际 bind 之间理论上有 TOCTOU 窗口，但对本机回环上的单实例桌面应用可以忽略；bind 失败会被就绪轮询的超时捕获并进入错误页。

---

## 提交信息的写法（每个任务都会踩）

本计划里的提交信息都是**多行中文、含括号与 `|` `^` 等字符**。用 `git commit -m "…"` 直接传会被 shell 解析截断（Task 1 的执行者实测踩到，信息被 eval 掉一段）。一律改用 heredoc：

```bash
git commit -F - <<'EOF'
type(scope): 标题

正文
EOF
```

`<<'EOF'` 的单引号很关键——它关闭变量展开与命令替换。

---

## 背景：这个仓库你需要先知道的几件事

- 这是一个 Next.js 16 App Router 项目，`output: 'standalone'` 已在 `next.config.ts` 里配好。
- 路由带 locale 前缀（`/zh/...`、`/en/...`），由 `src/middleware.ts` 里的 next-intl middleware 处理。所以首屏 `loadURL` **必须带前缀**，`loadURL('http://127.0.0.1:port/')` 会被重定向，但直接给出前缀更快也更可控。
- 根 `tsconfig.json` 的 `include` 是 `["**/*.ts", ...]`，所以新建的 `electron/` 目录会被现有的 `pnpm type-check` 自动覆盖，**不需要**第二个 tsconfig。
- vitest 的 `include` 是 `src/**/*.test.ts`，需要扩到 `electron/`（Task 1 做）。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `scripts/build-electron.mjs` | 新建 | esbuild 打 main + preload 两个 CJS bundle；`--watch` 时兼做重启 electron 的 dev 循环 |
| `electron/main/index.ts` | 新建 | 应用生命周期、窗口、splash/错误页、启动与退出时序 |
| `electron/main/app-paths.ts` | 新建 | 打包/开发两种布局下解析资源路径 |
| `electron/main/app-paths.test.ts` | 新建 | 上者单测 |
| `electron/main/data-path.ts` | 新建 | userData 一次性捕获 + dev 重定向 |
| `electron/main/data-path.test.ts` | 新建 | 纯解析函数的单测 |
| `electron/main/durable-file-write.ts` | 新建 | 原子持久化原语（异步 + 同步两版）与带 `.bak` 回退的读取 |
| `electron/main/durable-file-write.test.ts` | 新建 | 上者单测 |
| `electron/main/settings-store.ts` | 新建 | `jade-settings.json` 的读写与规范化 |
| `electron/main/settings-store.test.ts` | 新建 | `normalizeSettings` 单测 |
| `electron/main/next-server-host.ts` | 新建 | 端口分配、子进程命令解析、拉起、就绪轮询、回收 |
| `electron/main/next-server-host.test.ts` | 新建 | 端口分配 / 命令解析 / 就绪轮询的单测 |
| `electron/main/ipc/settings.ts` | 新建 | 设置与"打开数据目录"的 IPC handler |
| `electron/preload/index.ts` | 新建 | 唯一 IPC 契约 |
| `electron/preload/api.d.ts` | 新建 | `window.jade` 的类型声明，供 `src/` 侧引用 |
| `resources/splash.html` | 新建 | 启动占位页 |
| `resources/startup-error.html` | 新建 | 启动失败页，带重试按钮 |
| `src/app/api/health/route.ts` | 新建 | 就绪探针，不碰数据库 |
| `package.json` | 改 | 加 `main` 字段、Electron 依赖、`dev:desktop` / `start:desktop` script |
| `vitest.config.ts` | 改 | `include` 扩到 `electron/` |

---

### Task 1: 装依赖、写 esbuild 构建脚本、跑通一个空窗口

先把工具链跑通再写业务代码——否则后面每个任务都要在"是我的代码错了还是构建配置错了"之间猜。

> **为什么不是 electron-vite（初版计划选的是它）。** `electron-vite@5` 已是最新版，peer 要求 `vite ^5 || ^6 || ^7`；本项目通过 `vitest@4.1.8` 已带 **vite 8**，硬不兼容。实测症状有两个：`tsc` 报 `outDir` 不存在于 `MainBuildOptions`（因为该接口 extends 自 vite 的 `BuildEnvironmentOptions`，版本不匹配），以及 `vitest` 自己报 `Cannot find package 'vite'`（peer 解析被冲突破坏）。
>
> 注意排查时的一个陷阱：`outDir` 报错**看起来**像配置写错了，容易让人去改一个本来正确的配置。真正的原因在 peer 版本。
>
> electron-vite 的核心价值（renderer HMR）在这里用不上——renderer 就是主进程拉起的 Next 服务。改用 esbuild：已在依赖树内，零新增 peer 约束，`electron-builder` 只读 `out/`，打包环节不受影响。

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Create: `scripts/build-electron.mjs`
- Create: `electron/main/index.ts`（本任务里只是最小可启动版本，Task 9 会重写）
- Create: `electron/preload/index.ts`（占位，Task 8 会重写）

- [ ] **Step 1: 安装依赖**

```bash
pnpm add -D electron@^43.3.0 electron-builder@^26.15.3 esbuild
pnpm add electron-updater@^6.8.9
```

`electron-updater` 是运行时依赖（主进程要 require 它），其余是构建期依赖。**不要**装 electron-vite。

electron 的二进制约 300MB，在慢网络下可能要十几分钟；若 `pnpm add` 卡住，可单独跑 `node node_modules/electron/install.js`（幂等，已装则秒退）。装好后 `node_modules/electron/path.txt` 应存在。

- [ ] **Step 2: 允许 electron 跑安装脚本**

在 `package.json` 的 `pnpm.onlyBuiltDependencies` 数组里加上 `"electron"`。

- [ ] **Step 3: 加 `main` 字段与 scripts**

在 `package.json` 里，紧跟 `"private": true,` 之后加：

```json
  "main": "./out/main/index.js",
```

并在 `scripts` 里加三行：

```json
    "build:electron": "node scripts/build-electron.mjs",
    "dev:desktop": "node scripts/build-electron.mjs --watch",
    "build:desktop": "pnpm build && pnpm build:electron",
```

Next 自己不读顶层 `main` 字段，加上它不影响 `pnpm dev` / `pnpm build`。

- [ ] **Step 4: 让 vitest 也收 electron 目录的测试**

把 `vitest.config.ts` 的 `include` 改为：

```ts
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
```

- [ ] **Step 5: 写 esbuild 构建脚本**

创建 `scripts/build-electron.mjs`：

```js
// Builds the Electron main and preload bundles. With --watch it also runs the
// dev loop: rebuild on change, then restart Electron.
//
// esbuild rather than electron-vite: electron-vite@5 peers on vite ^5|^6|^7 and
// this repo already carries vite 8 via vitest 4. See the plan for the full story.
import { spawn } from 'node:child_process';
import { context } from 'esbuild';

const watch = process.argv.includes('--watch');

/** Electron 43.3.0 ships Node 24, so nothing needs downleveling. */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
  // `electron` is injected by the runtime and must never be bundled.
  // electron-updater pulls in native/dynamic requires that break when inlined.
  external: ['electron', 'electron-updater'],
};

const targets = [
  { ...shared, entryPoints: ['electron/main/index.ts'], outfile: 'out/main/index.js' },
  { ...shared, entryPoints: ['electron/preload/index.ts'], outfile: 'out/preload/index.js' },
];

const contexts = await Promise.all(targets.map((options) => context(options)));

if (!watch) {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  process.exit(0);
}

await Promise.all(contexts.map((ctx) => ctx.watch()));

let electronChild = null;
let restartTimer = null;
// Distinguishes an intentional kill (restart) from the developer closing the
// window. Cannot be inferred from `electronChild === null`: killElectron()
// clears that reference before the process has actually exited.
let restarting = false;

function launchElectron() {
  console.log('[dev] launching electron');
  const child = spawn(electronPath, ['.'], { stdio: 'inherit' });
  electronChild = child;

  child.on('exit', (code) => {
    if (child === electronChild) electronChild = null;
    // Only a real exit ends the dev loop; a restart kills the child on purpose.
    if (!restarting) {
      console.log('[dev] electron exited — stopping the watch loop');
      void shutdown(code ?? 0);
    }
  });
}

/**
 * Resolve once the child has actually exited, not merely been signalled.
 *
 * Waiting on the real `exit` event rather than a fixed delay: kill() only sends
 * SIGTERM, and spawning the replacement while the old process is still alive
 * leaves two instances briefly coexisting. Harmless while main is a stub, but a
 * real bug once it takes a single-instance lock or binds the Next server's port.
 */
function killElectron() {
  const child = electronChild;
  electronChild = null;
  // exitCode, not `killed`: the latter only records that kill() was called.
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    restarting = true;
    await killElectron();
    restarting = false;
    launchElectron();
  }, 50);
}

async function shutdown(code = 0) {
  restarting = true; // suppress the child exit handler
  await killElectron();
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
```

`onEnd` 的错误分支要给开发者一句解释，否则首次构建失败时只有 esbuild 的报错块、没有窗口，很难把两件事联系起来：

```js
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          if (!firstBuildDone.has(name)) {
            console.warn(`[dev] ${name} failed to build — electron will not launch until this is fixed`);
          }
          return;
        }
        // ... first-build guard, then scheduleRestart()
      });
```

注意 `require('electron')` 在 ESM 的 `.mjs` 里不可直接用——实现时改用 `createRequire(import.meta.url)`，或用 `await import('electron')` 取 `default`。执行者应自行确认哪种在本环境可行，并说明选了哪种、为什么。

`--watch` 模式下 esbuild 的 watch 是异步回调，重建后需要触发 `restart()`。esbuild 的 `context.watch()` 本身不提供"重建完成"钩子，需要用 `plugins: [{ name: 'restart', setup(build) { build.onEnd(() => …) } }]`。实现时把这个 plugin 加进 `shared`（仅 watch 模式），并注意**首次构建也会触发 onEnd**，不要在首次就重启。

- [ ] **Step 6: 写一个最小可启动的 main**

创建 `electron/main/index.ts`：

```ts
import { app, BrowserWindow } from 'electron';

app.setName('JadeAI');

app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1280, height: 860 });
  void window.loadURL('data:text/html,<h1>JadeAI shell alive</h1>');
});

app.on('window-all-closed', () => {
  app.quit();
});
```

- [ ] **Step 7: 写一个占位 preload**

创建 `electron/preload/index.ts`：

```ts
// Placeholder — the real contract lands in Task 8.
export {};
```

- [ ] **Step 8: 验证一次性构建**

```bash
pnpm build:electron
ls -la out/main/index.js out/preload/index.js
node -e "const s=require('fs').readFileSync('out/main/index.js','utf8'); console.log('bundled electron?', s.includes('require(\"electron\")')||s.includes("require('electron')"))"
```

Expected: 两个产物存在；第二条命令输出 `true`（证明 `electron` 是外部 require，没被打进 bundle）。

- [ ] **Step 9: 验证窗口能起来**

没有图形界面可点，所以用后台启动 + 程序化取证：

```bash
pnpm dev:desktop > /tmp/p2t1-dev.log 2>&1 &
sleep 20
pgrep -fl "Electron" | head -3
cat /tmp/p2t1-dev.log
```

Expected: 有 Electron 进程；日志里 esbuild 报告两个 bundle 构建成功，无 `Cannot find module`。

清理：

```bash
pkill -f "Electron|build-electron" || true
sleep 2
pgrep -fl Electron | head -3   # 应无输出
```

- [ ] **Step 10: 类型检查与测试**

```bash
pnpm type-check && pnpm test
```

Expected: 都通过（当前 40 个测试）。

`scripts/build-electron.mjs` 是 `.mjs`，根 tsconfig 的 `include` 含 `**/*.mts` 但不含 `.mjs`，所以它不进类型检查——这是刻意的，构建脚本不值得为它引入类型体操。

- [ ] **Step 11: 确认 gitignore**

确认 `.gitignore` 里有 `out/`。若没有，追加一行 `out/`。

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "build(desktop): add esbuild-based electron toolchain with a bootable shell

不用 electron-vite：它 peer 要求 vite ^5|^6|^7，而本仓库通过 vitest 4 已带
vite 8，硬不兼容（tsc 报 outDir 不存在于 MainBuildOptions，vitest 报找不到
vite）。它的核心价值 renderer HMR 在这里也用不上——renderer 就是主进程拉起
的 Next 服务。esbuild 已在依赖树内，零新增 peer 约束。"
```

IMPORTANT: 提交信息里**不要**加任何 `Co-Authored-By:` 后缀。确认 `out/` 与 electron 二进制没被提交。

---

### Task 2: `/api/health` 就绪探针

主进程需要一个"Next 起来了吗"的判据。这个路由**刻意不碰数据库**：如果它连库，数据库故障会被误报成"服务没起来"，而这两类故障的处理方式完全不同。

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: 创建路由**

```ts
/**
 * Readiness probe for the Electron main process.
 *
 * Deliberately does NOT touch the database: a DB failure must surface as a DB
 * failure, not as "the server never came up".
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: 验证**

```bash
pnpm dev
```

另开一个终端：

```bash
curl -s http://localhost:3000/api/health
```

Expected: `{"ok":true}`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat(api): add /api/health readiness probe

不碰数据库——数据库故障必须表现为数据库故障，而不是'服务没起来'。"
```

---

### Task 3: 资源路径解析

打包后 `resources/` 下的静态文件在 `process.resourcesPath` 下；开发时在仓库根。这个差异会在 splash 页、错误页、迁移目录、standalone 入口四处用到，所以抽成一个函数。

**Files:**
- Create: `electron/main/app-paths.ts`
- Create: `electron/main/app-paths.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `electron/main/app-paths.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { resolveAssetRoot } from './app-paths';

describe('resolveAssetRoot', () => {
  it('uses resourcesPath when packaged', () => {
    expect(
      resolveAssetRoot({
        isPackaged: true,
        resourcesPath: '/Applications/JadeAI.app/Contents/Resources',
        appRoot: '/repo',
      }),
    ).toBe('/Applications/JadeAI.app/Contents/Resources');
  });

  it('uses the repo root when not packaged', () => {
    expect(
      resolveAssetRoot({
        isPackaged: false,
        resourcesPath: '/somewhere/electron/dist/resources',
        appRoot: '/repo',
      }),
    ).toBe('/repo');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run electron/main/app-paths.test.ts
```

Expected: FAIL，`Failed to resolve import "./app-paths"`。

- [ ] **Step 3: 写实现**

创建 `electron/main/app-paths.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run electron/main/app-paths.test.ts
```

Expected: PASS，2 个用例。

注意测试只覆盖 `resolveAssetRoot`——其余几个函数直接依赖 `app`，在单测里 mock `electron` 的收益低于成本，它们在 Task 10 的手动验收里被真实覆盖。

- [ ] **Step 5: Commit**

```bash
git add electron/main/app-paths.ts electron/main/app-paths.test.ts
git commit -m "feat(desktop): resolve asset paths across packaged and dev layouts"
```

---

### Task 4: userData 路径一次性捕获与 dev 隔离

抄 orca 的 `initDataPath()` / `getCanonicalUserDataPath()`：在启动的确定时机捕获一次，之后所有子系统读这个捕获值。orca 踩过的坑是 `app.setName()` 之后 `app.getPath('userData')` 的解析会变，在大小写敏感文件系统上会导致数据"消失"。

**Files:**
- Create: `electron/main/data-path.ts`
- Create: `electron/main/data-path.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `electron/main/data-path.test.ts`：

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUserDataDir } from './data-path';

// Built with join() so the expectations hold on Windows too, where join()
// yields backslashes. A hardcoded POSIX literal would fail there, and this app
// packages for win/linux/mac.
const SUPPORT_DIR = join('/Users/me/Library/Application Support');
const PROD_DIR = join(SUPPORT_DIR, 'JadeAI');
const DEV_DIR = join(SUPPORT_DIR, 'JadeAI-dev');

describe('resolveUserDataDir', () => {
  it('returns the platform directory unchanged in production', () => {
    expect(resolveUserDataDir(PROD_DIR, false)).toBe(PROD_DIR);
  });

  // A dev session must never write into the directory a released build owns.
  it('appends -dev as a sibling directory in development', () => {
    expect(resolveUserDataDir(PROD_DIR, true)).toBe(DEV_DIR);
  });

  it('does not double-suffix a directory that is already -dev', () => {
    expect(resolveUserDataDir(DEV_DIR, true)).toBe(DEV_DIR);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run electron/main/data-path.test.ts
```

Expected: FAIL，`Failed to resolve import "./data-path"`。

- [ ] **Step 3: 写实现**

创建 `electron/main/data-path.ts`：

```ts
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
```

`getCanonicalUserDataPath()` 在未初始化时**抛出**而不是懒解析——懒解析正是 orca 那个 bug 的形状。

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run electron/main/data-path.test.ts
```

Expected: PASS，3 个用例。

- [ ] **Step 5: Commit**

```bash
git add electron/main/data-path.ts electron/main/data-path.test.ts
git commit -m "feat(desktop): capture userData once, isolate dev into JadeAI-dev

未初始化时抛出而不是懒解析——懒解析正是 orca 那个丢数据 bug 的形状。"
```

---

### Task 5: 原子文件写入

`jade-settings.json` 每次窗口移动都可能重写。断电或崩溃时，普通的 `writeFileSync` 会留下截断或空文件。抄 orca 的 `durable-file-write.ts`：写临时文件 → fsync → rename → fsync 目录，外加一份 `.bak`。

> **临时文件名必须唯一，这一点初版计划抄漏了。** orca 的 `durableWriteTempPath()` 是带唯一后缀的，而初版计划里简化成了固定的 `${finalPath}.tmp`。质量审查实测复现了后果：两个重叠写入（典型场景是退出时的 `flushSync` 撞上一个进行中的窗口移动保存——sync 变体的存在理由就是这个）在没有 `O_EXCL` 的情况下会 `open()` 到**同一个 inode**，慢的那个把字节写进快的那个已经 rename 走的文件里。`finalPath` 于是被一个从未走过自己原子 rename、且 promise 已 reject 的写入就地改写——正是本模块要防止的撕裂。
>
> 用 `${finalPath}.${process.pid}.${randomUUID()}.tmp`。这样最坏情况降级为普通的"最后 rename 者胜"丢更新：`finalPath` 永远是某一次写入的完整内容。**不要**额外加 per-path promise 队列——`writeFileDurableSync` 是同步的、无法 await 进行中的 async 写，队列解决不了这个竞态；而 last-writer-wins 对 `SettingsStore` 是正确语义（它自己串行化 async 写，退出时 `flushSync` 写最新内存状态）。
>
> `.bak` 路径仍用固定的 `${finalPath}.bak`——备份必须单一且可读回，只有临时文件需要唯一。
>
> **照抄成熟实现时的一条通用教训。** orca 的 `durableWriteTempPath()` 本来就是 `${finalPath}.${process.pid}.${Date.now()}.${random}.tmp`；那串后缀看起来像过度设计，我"简化"掉了，于是把一个承重属性当装饰扔了。后续阶段还要继续借鉴 orca（阶段三的 safeStorage、阶段五的打包纪律），原则是：**看不出用途的复杂度先假定它是承重的**，要么照抄、要么先查清它为什么存在再决定简化。orca 那串后缀里 `pid` 防跨进程、`Date.now()+random` 防同进程并发——三段各有分工。

**Files:**
- Create: `electron/main/durable-file-write.ts`
- Create: `electron/main/durable-file-write.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `electron/main/durable-file-write.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonWithBackup, writeFileDurable, writeFileDurableSync } from './durable-file-write';

let dir: string;
let target: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jade-durable-'));
  target = join(dir, 'state.json');
});

afterEach(() => {
  chmodSync(dir, 0o700);
  rmSync(dir, { recursive: true, force: true });
});

describe('writeFileDurable', () => {
  it('writes the payload and leaves no temp file behind', async () => {
    await writeFileDurable(target, '{"a":1}');
    expect(readFileSync(target, 'utf-8')).toBe('{"a":1}');
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });

  it('keeps the previous contents in a .bak sidecar', async () => {
    await writeFileDurable(target, '{"gen":1}');
    await writeFileDurable(target, '{"gen":2}');
    expect(readFileSync(target, 'utf-8')).toBe('{"gen":2}');
    expect(readFileSync(`${target}.bak`, 'utf-8')).toBe('{"gen":1}');
  });

  // The failure mode this whole module exists to prevent: a write that dies
  // partway must not damage what was already on disk.
  it('leaves the existing file intact when the write cannot start', async () => {
    writeFileSync(target, '{"gen":1}');
    chmodSync(dir, 0o500); // read + execute only: no new files may be created
    await expect(writeFileDurable(target, '{"gen":2}')).rejects.toThrow();
    chmodSync(dir, 0o700);
    expect(readFileSync(target, 'utf-8')).toBe('{"gen":1}');
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });

  // Induces a failure AFTER the temp file exists — something the chmod fixture
  // above cannot do, because it blocks creating the temp file at all. Without
  // this case the catch block's temp-file cleanup is untested: deleting it
  // changes nothing observable.
  it('removes the temp file when the rename fails', async () => {
    // A directory sitting at the target path makes rename() fail with EISDIR
    // while the temp write itself succeeds.
    mkdirSync(target);
    await expect(writeFileDurable(target, '{"gen":2}')).rejects.toThrow();
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });
});

describe('writeFileDurableSync', () => {
  it('writes the payload synchronously', () => {
    writeFileDurableSync(target, '{"sync":true}');
    expect(readFileSync(target, 'utf-8')).toBe('{"sync":true}');
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });
});

describe('readJsonWithBackup', () => {
  it('returns the fallback when nothing exists', () => {
    expect(readJsonWithBackup(target, { fallback: true })).toEqual({ fallback: true });
  });

  it('reads the main file when it is valid', () => {
    writeFileSync(target, '{"from":"main"}');
    expect(readJsonWithBackup(target, {})).toEqual({ from: 'main' });
  });

  it('falls back to the .bak sidecar when the main file is corrupt', () => {
    writeFileSync(target, '{ this is not json');
    writeFileSync(`${target}.bak`, '{"from":"backup"}');
    expect(readJsonWithBackup(target, {})).toEqual({ from: 'backup' });
  });

  it('returns the fallback when both files are corrupt', () => {
    writeFileSync(target, 'garbage');
    writeFileSync(`${target}.bak`, 'also garbage');
    expect(readJsonWithBackup(target, { fallback: true })).toEqual({ fallback: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run electron/main/durable-file-write.test.ts
```

Expected: FAIL，`Failed to resolve import "./durable-file-write"`。

- [ ] **Step 3: 写实现**

创建 `electron/main/durable-file-write.ts`：

```ts
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * fsync a directory so a rename inside it is durable.
 *
 * Best-effort by design: Windows cannot open a directory for fsync and some
 * filesystems reject it. The file fsync is the load-bearing part; this only
 * closes the "rename recorded but not persisted" window where the OS allows it.
 */
async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch {
    // Expected on Windows and on filesystems without directory fsync.
  } finally {
    await handle?.close().catch(() => {});
  }
}

function syncDirectorySync(directory: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(directory, 'r');
    fsyncSync(fd);
  } catch {
    // Same platform caveats as syncDirectory.
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // The fsync already happened or the open failed; nothing actionable.
      }
    }
  }
}

function backupExisting(finalPath: string): void {
  if (!existsSync(finalPath)) return;
  try {
    copyFileSync(finalPath, `${finalPath}.bak`);
  } catch {
    // A missing backup is survivable; failing the write over it is not.
  }
}

/** Write `payload` durably: temp file → fsync → rename → fsync directory. */
export async function writeFileDurable(finalPath: string, payload: string): Promise<void> {
  const tmpPath = `${finalPath}.tmp`;
  backupExisting(finalPath);
  try {
    const handle = await open(tmpPath, 'w');
    try {
      await handle.writeFile(payload, 'utf-8');
      // fsync BEFORE rename. A rename that lands first can expose a zero-length file.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, finalPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  await syncDirectory(dirname(finalPath));
}

/** Synchronous variant, for the quit path where there is no time to await. */
export function writeFileDurableSync(finalPath: string, payload: string): void {
  const tmpPath = `${finalPath}.tmp`;
  backupExisting(finalPath);
  try {
    const fd = openSync(tmpPath, 'w');
    try {
      writeFileSync(fd, payload, 'utf-8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, finalPath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
  syncDirectorySync(dirname(finalPath));
}

function tryParse<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** Read JSON, falling back to the `.bak` sidecar and then to `fallback`. */
export function readJsonWithBackup<T>(finalPath: string, fallback: T): T {
  return tryParse<T>(finalPath) ?? tryParse<T>(`${finalPath}.bak`) ?? fallback;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run electron/main/durable-file-write.test.ts
```

Expected: PASS，8 个用例全绿。

若 “leaves the existing file intact” 这条失败并显示写入居然成功了，检查你是不是以 root 跑测试——root 会绕过目录权限位。用 `id -u` 确认（非 0 才对）。

> **这个模块有一条不变式测不到，记录在此以免误判覆盖率。** 变异测试实测：删掉 `writeFileDurable` 里的 `await handle.sync()`（即去掉 fsync）后，**9 个用例全绿**。原因是 fsync 的作用只在断电时体现——测试进程正常退出时，页缓存里的数据照样能读回来。所以"fsync 必须在 rename 之前"这条只靠代码注释保护，没有任何测试会在它被删掉时变红。
>
> 承认这个缺口比假装覆盖更有用：否则后人看到全绿会以为 fsync 有保护，顺手删掉也不会有人发现，而故障只在真实断电时暴露一次、且极难归因。
>
> 另外记两条变异测试纠正的预测偏差：
> - "leaves the existing file intact" 那条**不能**保护失败清理路径。`chmod 0o500` 阻止了临时文件的**创建**，所以 `open()` 在临时文件存在前就抛错，`rm()` 本就是空操作，`expect(existsSync(tmp)).toBe(false)` 是平凡通过。这正是上面新增 "removes the temp file when the rename fails" 那条的原因。
> - "falls back to the .bak sidecar" 那条对 `backupExisting` 不敏感——它用 `writeFileSync` 直接写 `.bak` 作为夹具。这是**恰当的**：它测的是 `readJsonWithBackup` 的读取行为，本就不该依赖写入侧是否正确。`backupExisting` 由 "keeps the previous contents in a .bak sidecar" 覆盖。

- [ ] **Step 5: Commit**

```bash
git add electron/main/durable-file-write.ts electron/main/durable-file-write.test.ts
git commit -m "feat(desktop): add durable file write primitives

写临时文件 → fsync → rename → fsync 目录，外加 .bak 回退。fsync 必须在
rename 之前：先 rename 会暴露一个零长度文件。"
```

---

### Task 6: 设置存储

**Files:**
- Create: `electron/main/settings-store.ts`
- Create: `electron/main/settings-store.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `electron/main/settings-store.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings-store';

describe('normalizeSettings', () => {
  it('returns defaults for a missing file', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for a non-object payload', () => {
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a recognised locale and rejects an unknown one', () => {
    expect(normalizeSettings({ locale: 'en' }).locale).toBe('en');
    expect(normalizeSettings({ locale: 'fr' }).locale).toBe(DEFAULT_SETTINGS.locale);
    expect(normalizeSettings({ locale: 42 }).locale).toBe(DEFAULT_SETTINGS.locale);
  });

  // A window persisted from a since-disconnected monitor can be absurdly small
  // or huge; restoring it verbatim gives an unusable or offscreen window.
  it('clamps window size into a usable range', () => {
    expect(normalizeSettings({ window: { width: 10, height: 10 } }).window.width).toBe(940);
    expect(normalizeSettings({ window: { width: 10, height: 10 } }).window.height).toBe(600);
    expect(normalizeSettings({ window: { width: 1400, height: 900 } }).window).toMatchObject({
      width: 1400,
      height: 900,
    });
  });

  it('drops non-numeric window coordinates instead of restoring NaN', () => {
    const settings = normalizeSettings({ window: { x: 'left', y: null } });
    expect(settings.window.x).toBeUndefined();
    expect(settings.window.y).toBeUndefined();
  });

  it('keeps lastResumeId only when it is a string', () => {
    expect(normalizeSettings({ lastResumeId: 'abc' }).lastResumeId).toBe('abc');
    expect(normalizeSettings({ lastResumeId: 7 }).lastResumeId).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run electron/main/settings-store.test.ts
```

Expected: FAIL，`Failed to resolve import "./settings-store"`。

- [ ] **Step 3: 写实现**

创建 `electron/main/settings-store.ts`：

```ts
import { readJsonWithBackup, writeFileDurable, writeFileDurableSync } from './durable-file-write';

export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Below this a window is unusable; the editor needs both panes to fit. */
const MIN_WINDOW_WIDTH = 940;
const MIN_WINDOW_HEIGHT = 600;

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface JadeSettings {
  version: 1;
  locale: Locale;
  window: WindowState;
  lastResumeId: string | null;
}

export const DEFAULT_SETTINGS: JadeSettings = {
  version: 1,
  locale: 'zh',
  window: { width: 1280, height: 860, maximized: false },
  lastResumeId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: unknown, min: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.round(value));
}

function optionalCoordinate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

/** Coerce anything read off disk into a usable JadeSettings. Never throws. */
export function normalizeSettings(raw: unknown): JadeSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window } };

  const rawWindow = isRecord(raw.window) ? raw.window : {};
  const locale = LOCALES.includes(raw.locale as Locale)
    ? (raw.locale as Locale)
    : DEFAULT_SETTINGS.locale;

  return {
    version: 1,
    locale,
    window: {
      width: clamp(rawWindow.width, MIN_WINDOW_WIDTH, DEFAULT_SETTINGS.window.width),
      height: clamp(rawWindow.height, MIN_WINDOW_HEIGHT, DEFAULT_SETTINGS.window.height),
      x: optionalCoordinate(rawWindow.x),
      y: optionalCoordinate(rawWindow.y),
      maximized: rawWindow.maximized === true,
    },
    lastResumeId: typeof raw.lastResumeId === 'string' ? raw.lastResumeId : null,
  };
}

export class SettingsStore {
  private settings: JadeSettings;
  private writeChain: Promise<void> = Promise.resolve();
  // flushSync() publishes the final state on the quit path. Any write still
  // queued behind it carries an older snapshot and would roll that back.
  private sealed = false;

  constructor(private readonly filePath: string) {
    this.settings = normalizeSettings(readJsonWithBackup<unknown>(filePath, undefined));
  }

  get(): JadeSettings {
    return this.settings;
  }

  /** Merge a shallow patch and persist it. Writes are serialised, not raced. */
  patch(patch: Partial<JadeSettings>): JadeSettings {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    const payload = JSON.stringify(this.settings, null, 2);
    this.writeChain = this.writeChain
      .then(() => {
        if (this.sealed) return;
        return writeFileDurable(this.filePath, payload);
      })
      .catch((error) => {
        console.error('[settings] durable write failed:', error);
      });
    return this.settings;
  }

  setWindowState(window: WindowState): void {
    this.patch({ window });
  }

  /**
   * Flush synchronously on the quit path and seal the store.
   *
   * Terminal by design: a write still queued behind this carries an older
   * snapshot, and durable-file-write's last-rename-wins semantics mean it would
   * roll this final state back. Sealing drops those queued writes instead.
   * The only caller is the `will-quit` handler in Task 9.
   */
  flushSync(): void {
    this.sealed = true;
    try {
      writeFileDurableSync(this.filePath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('[settings] synchronous flush failed:', error);
    }
  }

  /**
   * Resolve once every queued write has settled.
   *
   * patch() is deliberately fire-and-forget so callers on the UI path never
   * await disk. Tests and deterministic teardown need a way to join, though —
   * without it a write outlives its test and races the fixture cleanup, which
   * shows up as an intermittent ENOTEMPTY from rmSync.
   */
  async whenIdle(): Promise<void> {
    await this.writeChain;
  }
}
```

> **`sealed` 与 `whenIdle()` 都是补上来的，初版计划两个都没有。** 症状先从测试暴露：`patch()` 的 fire-and-forget 写入活得比用例长，`afterEach` 的 `rmSync` 删目录时它又创建了一个唯一名的 `.tmp`，于是间歇性 ENOTEMPTY（实测连跑 3 次挂 1 次）。
>
> 顺着同一个未受管理的生命周期查下去，生产路径上有个更实在的 bug：`patch(A)` → `patch(B)` → `flushSync()` 写入 B → 队列里的 write(A) 落盘把 B 覆盖回 A。用户调完窗口尺寸立刻退出，下次启动拿到的是倒数第二次的值。`sealed` 让 `flushSync()` 之后排队的旧快照直接丢弃。
>
> **钉住 `sealed` 的测试必须看调用次数，不能看最终内容。** 我最初写的是 `patch('older')` → `patch('newer')` → `flushSync()` → 断言磁盘上是 `'newer'`——这条**两边都绿**、毫无区分力：`writeChain` 是严格 FIFO，`write(older)` 先跑、`write(newer)` 后跑，而 `newer` 恰好与 `flushSync` 的 payload 相同，所以不管有没有 `sealed`，最后落盘的都是 `newer`。有区分力的写法是对 `writeFileDurable` 做 spy 断言"封印后不再被调用"，变异后会精确报 `expected "writeFileDurable" to not be called at all, but actually been called 2 times`。
>
> `sealed` 的能力边界也记一下：它是同步布尔量，只能拦住**尚未进入 `.then()` 回调**的排队写入，无法取消已经派发到 libuv 线程池、真正在飞的那次 I/O。这对唯一调用点是够的——Task 9 的 `will-quit` 里 `setWindowState()` 与 `flushSync()` 在同一个同步 tick 内相继调用，中间没有 await。

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run electron/main/settings-store.test.ts
```

Expected: PASS，6 个用例全绿。

- [ ] **Step 5: Commit**

```bash
git add electron/main/settings-store.ts electron/main/settings-store.test.ts
git commit -m "feat(desktop): add settings store over durable writes

normalizeSettings 永不抛出：从磁盘读到的任何东西都被强制成可用值，且窗口
尺寸会被夹到可用范围——从已拔掉的显示器上存下来的尺寸会给出不可用窗口。"
```

---

### Task 7: Next 服务宿主

**Files:**
- Create: `electron/main/next-server-host.ts`
- Create: `electron/main/next-server-host.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `electron/main/next-server-host.test.ts`：

```ts
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { allocateLoopbackPort, resolveNextServerCommand, waitForHealthy } from './next-server-host';

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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run electron/main/next-server-host.test.ts
```

Expected: FAIL，`Failed to resolve import "./next-server-host"`。

- [ ] **Step 3: 写实现**

创建 `electron/main/next-server-host.ts`：

```ts
import { spawn, type ChildProcess } from 'node:child_process';
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

export class NextServerHost {
  private child: ChildProcess | null = null;
  private stopping = false;

  async start(options: StartOptions): Promise<RunningNextServer> {
    const port = await allocateLoopbackPort();
    const command = resolveNextServerCommand(options.mode, options.paths, port);

    this.stopping = false;
    // ELECTRON_RUN_AS_NODE makes Electron's bundled Node run the script as a
    // plain Node process — no Chromium, no Electron APIs in the child.
    this.child = spawn(process.execPath, command.args, {
      cwd: command.cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: options.mode,
        JADE_RUNTIME: 'desktop',
        SQLITE_PATH: options.databaseFile,
        JADE_MIGRATIONS_DIR: options.migrationsDir,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.child.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[next] ${chunk.toString()}`);
    });
    this.child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[next] ${chunk.toString()}`);
    });
    this.child.on('exit', (code, signal) => {
      this.child = null;
      if (!this.stopping) {
        options.onUnexpectedExit(code, signal);
      }
    });

    const origin = `http://127.0.0.1:${port}`;
    await waitForHealthy(
      `${origin}/api/health`,
      {
        fetch,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      },
      { timeoutMs: READINESS_TIMEOUT_MS, intervalMs: READINESS_INTERVAL_MS },
    );

    return { port, origin };
  }

  /** Kill the child. Called on quit so no orphan keeps holding the port. */
  stop(): void {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run electron/main/next-server-host.test.ts
```

Expected: PASS，8 个用例全绿。

- [ ] **Step 5: Commit**

```bash
git add electron/main/next-server-host.ts electron/main/next-server-host.test.ts
git commit -m "feat(desktop): host the Next server as a child process

预分配 loopback 端口后把 PORT 显式传给子进程，再轮询 /api/health——next dev
与 standalone server.js 都不会 process.send 端口回来，spec 原先的握手方案
不成立。dev 与生产因此走完全相同的代码路径。"
```

---

### Task 8: preload 契约

preload 是渲染层能碰到主进程的**唯一**入口。这一阶段只需要设置读写和"打开数据目录"；密钥与 PDF 在阶段三、四加。

**Files:**
- Create: `electron/preload/index.ts`（替换 Task 1 的占位版）
- Create: `electron/preload/api.d.ts`
- Create: `electron/main/ipc/settings.ts`

- [ ] **Step 1: 写 IPC handler**

创建 `electron/main/ipc/settings.ts`：

```ts
import { ipcMain, shell } from 'electron';
import { getCanonicalUserDataPath } from '../data-path';
import type { JadeSettings, SettingsStore } from '../settings-store';

export function registerSettingsIpc(store: SettingsStore): void {
  ipcMain.handle('jade:settings:get', (): JadeSettings => store.get());

  ipcMain.handle('jade:settings:patch', (_event, patch: unknown): JadeSettings => {
    // The renderer is our own code, but it is still the untrusted side of this
    // boundary. normalizeSettings() inside patch() is what makes this safe.
    if (typeof patch !== 'object' || patch === null) {
      return store.get();
    }
    return store.patch(patch as Partial<JadeSettings>);
  });

  ipcMain.handle('jade:shell:open-data-dir', async (): Promise<void> => {
    await shell.openPath(getCanonicalUserDataPath());
  });
}
```

- [ ] **Step 2: 写 preload**

把 `electron/preload/index.ts` 整个文件替换为：

```ts
import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire renderer → main surface. Keep it small and explicit: everything
 * here is reachable from page JavaScript.
 */
const jade = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('jade:settings:get'),
  patchSettings: (patch: unknown) => ipcRenderer.invoke('jade:settings:patch', patch),
  openDataDir: () => ipcRenderer.invoke('jade:shell:open-data-dir'),
  retryStartup: () => ipcRenderer.send('jade:startup:retry'),
};

export type JadeBridge = typeof jade;

contextBridge.exposeInMainWorld('jade', jade);
```

- [ ] **Step 3: 写类型声明**

创建 `electron/preload/api.d.ts`：

```ts
import type { JadeBridge } from './index';

declare global {
  interface Window {
    /** Present only inside the Electron shell; undefined under plain `next dev`. */
    jade?: JadeBridge;
  }
}
```

- [ ] **Step 4: 类型检查**

```bash
pnpm type-check
```

Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add electron/preload/index.ts electron/preload/api.d.ts electron/main/ipc/settings.ts
git commit -m "feat(desktop): add the preload IPC contract

保持小而显式——这里的每一项都能被页面 JS 直接调到。"
```

---

### Task 9: splash 页、错误页与完整启动接线

**Files:**
- Create: `resources/splash.html`
- Create: `resources/startup-error.html`
- Modify: `electron/main/index.ts`（替换 Task 1 的最小版本）

- [ ] **Step 1: 写 splash 页**

创建 `resources/splash.html`：

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>JadeAI</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        height: 100vh;
        display: grid;
        place-items: center;
        font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fafaf9;
        color: #57534e;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #1c1917; color: #a8a29e; }
      }
      .spinner {
        width: 28px; height: 28px; margin: 0 auto 16px;
        border: 2px solid currentColor; border-top-color: transparent;
        border-radius: 50%; animation: spin .8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div>
      <div class="spinner"></div>
      <div>正在启动 JadeAI…</div>
    </div>
  </body>
</html>
```

- [ ] **Step 2: 写错误页**

创建 `resources/startup-error.html`：

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>JadeAI 启动失败</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fafaf9; color: #292524;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #1c1917; color: #e7e5e4; }
        pre { background: #292524 !important; }
      }
      main { max-width: 34rem; padding: 2rem; }
      h1 { font-size: 1.1rem; margin: 0 0 .75rem; }
      pre {
        background: #f5f5f4; padding: .75rem; border-radius: 6px;
        white-space: pre-wrap; word-break: break-word; font-size: 12px;
        max-height: 12rem; overflow: auto;
      }
      button {
        font: inherit; padding: .45rem 1rem; border-radius: 6px;
        border: 1px solid currentColor; background: transparent;
        color: inherit; cursor: pointer; margin-right: .5rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>JadeAI 没能启动</h1>
      <p>本地服务未在预期时间内就绪。下面是错误详情：</p>
      <pre id="detail">（无详情）</pre>
      <button id="retry">重试</button>
      <button id="open-data">打开数据目录</button>
    </main>
    <script>
      const params = new URLSearchParams(location.search);
      const detail = params.get('detail');
      if (detail) document.getElementById('detail').textContent = detail;
      document.getElementById('retry').addEventListener('click', () => {
        window.jade?.retryStartup();
      });
      document.getElementById('open-data').addEventListener('click', () => {
        window.jade?.openDataDir();
      });
    </script>
  </body>
</html>
```

- [ ] **Step 3: 写完整的 main**

把 `electron/main/index.ts` 整个文件替换为：

```ts
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import {
  getAppRoot,
  getAssetRoot,
  resolveMigrationsDirectory,
  resolveResourceFile,
} from './app-paths';
import { getDatabaseFile, getSettingsFile, initDataPath } from './data-path';
import { registerSettingsIpc } from './ipc/settings';
import { NextServerHost, type ServerMode } from './next-server-host';
import { SettingsStore } from './settings-store';

// Must run before any path is resolved: app.setName() changes how
// app.getPath('userData') resolves, and data-path.ts captures that value once.
app.setName('JadeAI');

const isDevelopment = !app.isPackaged;
const serverMode: ServerMode = isDevelopment ? 'development' : 'production';

const serverHost = new NextServerHost();
let settings: SettingsStore;
let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const { window: bounds } = settings.get();
  const created = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'JadeAI',
    webPreferences: {
      // main bundles to out/main/index.js, so this lands on out/preload/index.js.
      // NOT resolveResourceFile(): the preload is build output, not a resource.
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (bounds.maximized) created.maximize();
  created.once('ready-to-show', () => created.show());

  // Keep external links out of the app window.
  created.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  created.on('close', () => {
    persistWindowState(created);
  });

  created.on('closed', () => {
    mainWindow = null;
  });

  return created;
}

function persistWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  const maximized = window.isMaximized();
  // getNormalBounds(), not getBounds(): a maximized window would otherwise
  // persist the screen size and never restore its real size again.
  const bounds = window.getNormalBounds();
  settings.setWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized,
  });
}

async function showStartupError(window: BrowserWindow, error: unknown): Promise<void> {
  const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  await window.loadFile(resolveResourceFile('startup-error.html'), {
    search: new URLSearchParams({ detail }).toString(),
  });
  window.show();
}

async function bootServerInto(window: BrowserWindow): Promise<void> {
  await window.loadFile(resolveResourceFile('splash.html'));
  window.show();

  try {
    const running = await serverHost.start({
      mode: serverMode,
      paths: { appRoot: getAppRoot(), assetRoot: getAssetRoot() },
      databaseFile: getDatabaseFile(),
      migrationsDir: resolveMigrationsDirectory(),
      onUnexpectedExit: (code, signal) => {
        console.error(`[next] server exited unexpectedly (code=${code} signal=${signal})`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          void showStartupError(
            mainWindow,
            new Error(`本地服务意外退出（code=${code} signal=${signal}）`),
          );
        }
      },
    });
    const { locale } = settings.get();
    await window.loadURL(`${running.origin}/${locale}`);
  } catch (error) {
    console.error('[startup] failed to bring up the Next server:', error);
    await showStartupError(window, error);
  }
}

app.whenReady().then(async () => {
  initDataPath(isDevelopment);
  settings = new SettingsStore(getSettingsFile());
  registerSettingsIpc(settings);

  ipcMain.on('jade:startup:retry', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    serverHost.stop();
    void bootServerInto(mainWindow);
  });

  mainWindow = createWindow();
  await bootServerInto(mainWindow);

  // macOS: re-open a window when the dock icon is clicked with none open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createWindow();
    void bootServerInto(mainWindow);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Flush synchronously — the event loop is about to stop. Then reap the child
  // unconditionally, or an orphaned Next server keeps holding its port.
  settings?.flushSync();
  serverHost.stop();
});
```

- [ ] **Step 4: 记下阶段五要用到的资源映射**

`resolveResourceFile('splash.html')` 在开发时解析为 `<repo>/resources/splash.html`，打包后解析为 `<resourcesPath>/splash.html`。因此阶段五的 electron-builder 配置里，`extraResources` 必须把 `resources/splash.html` 与 `resources/startup-error.html` 映射到资源根**而不是**保留 `resources/` 前缀。把这条写进 `docs/superpowers/specs/2026-08-10-desktop-client-design.md` 的「打包」一节，避免阶段五重新推导。

- [ ] **Step 5: 类型检查**

```bash
pnpm type-check
```

Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add resources/splash.html resources/startup-error.html electron/main/index.ts
git commit -m "feat(desktop): wire startup, splash, error page and quit teardown

app.setName() 必须在任何路径解析之前；窗口状态用 getNormalBounds() 存，
否则最大化过一次的窗口会把屏幕尺寸记成常态尺寸。"
```

---

### Task 10: 端到端手动验收

自动化的 Electron 冒烟测试留在阶段四（它依赖打包产物）。这一阶段用手动验收把接线确认清楚。

**Files:** 无（纯验证）

- [ ] **Step 1: 全量自动化检查**

```bash
pnpm type-check && pnpm test
```

Expected: 都通过，且包含本阶段新增的 5 个测试文件：`app-paths`、`data-path`、`durable-file-write`、`settings-store`、`next-server-host`。

- [ ] **Step 2: 冷启动**

```bash
rm -rf ~/Library/Application\ Support/JadeAI-dev
pnpm dev:desktop
```

Expected（按顺序）：
1. 窗口立刻出现，显示旋转的 “正在启动 JadeAI…”。
2. 终端出现 `[next]` 前缀的日志。
3. 几秒内窗口切换到 JadeAI 的落地页/仪表盘（中文）。

- [ ] **Step 3: 确认数据落在 userData 而非仓库**

```bash
ls -la ~/Library/Application\ Support/JadeAI-dev/
```

Expected: 看到 `jade.db`、`jade.db-wal`、`jade-settings.json`。

```bash
git status --short data/
```

Expected: 无输出——仓库里的 `data/` 没有被写。

- [ ] **Step 4: 确认只有一个本地用户**

```bash
sqlite3 ~/Library/Application\ Support/JadeAI-dev/jade.db "SELECT id, auth_type FROM users;"
```

Expected: 恰好一行 `local|local`。

- [ ] **Step 5: 确认服务没有对局域网暴露**

在应用运行时，先从终端拿到端口：

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -i electron
```

Expected: 监听地址是 `127.0.0.1:<port>`，**不是** `*:<port>` 或 `0.0.0.0:<port>`。若看到后者，`-H 127.0.0.1` / `HOSTNAME` 没生效，**停下来修好再继续**。

- [ ] **Step 6: 确认窗口状态持久化**

把窗口拖到屏幕另一侧并改变大小，关掉应用，再 `pnpm dev:desktop`。

Expected: 窗口回到上次的位置和大小。

```bash
cat ~/Library/Application\ Support/JadeAI-dev/jade-settings.json
```

Expected: `window` 里的数值与你调整后的一致。

- [ ] **Step 7: 确认启动失败会进错误页**

> **不能用 `JADE_MIGRATIONS_DIR=/nonexistent` 来制造这个失败**，初版计划写错了，两个原因：
> 1. `next-server-host.ts` 的 `env` 先展开 `...process.env` 再**显式覆盖** `JADE_MIGRATIONS_DIR: options.migrationsDir`（值来自主进程的 `resolveMigrationsDirectory()`），所以父进程设的那个环境变量根本传不到子进程。这个优先级是对的——路径应由主进程掌控。
> 2. 即使传进去了也不会进错误页：`/api/health` 刻意不碰数据库（Task 2 的设计），而 `next dev` 是懒编译，所以迁移坏掉时 health 照样 200、窗口正常加载，数据库故障只在访问 DB 路由时按路由浮现成 500。
>
> 这两点合起来意味着：**dev 模式下数据库故障不阻塞启动**。这是有意的分层——"服务没起来"与"数据库坏了"是两类故障，前者进错误页重试，后者应该在具体请求上暴露。

改用杀子进程来制造真实的启动失败——这同时覆盖 `onUnexpectedExit` 与 `waitForHealthy` 超时两条路径（它们都会走到 `showStartupError`，代际去重就是为这个场景加的）：

```bash
pnpm dev:desktop > /tmp/p2-err.log 2>&1 &
sleep 1
pkill -f "next dev" || true      # 在 waitForHealthy 还在轮询时杀掉子进程
sleep 35                          # 等 waitForHealthy 走到 30s 超时
grep -n "startup-error\|exited unexpectedly\|did not become healthy" /tmp/p2-err.log
```

Expected: 日志里同时出现 `server exited unexpectedly` 与 `did not become healthy`，但错误页**只被加载一次**（代际去重生效，无闪烁、无空白页）。

- [ ] **Step 8: 确认没有残留孤儿进程**

关掉应用后：

```bash
ps aux | grep -c "[n]ext dev"
```

Expected: `0`。若不是 0，`will-quit` 里的 `serverHost.stop()` 没生效。

- [ ] **Step 9: 确认裸 `next dev` 仍可用**

```bash
pnpm dev
```

打开 `http://localhost:3000/zh`。Expected: 正常渲染（此模式下 `window.jade` 为 undefined，属预期）。

- [ ] **Step 10: 记录验收结果并提交**

把本阶段的验收结论追加到 `docs/superpowers/plans/2026-08-10-desktop-client-electron-shell.md` 末尾（哪几步通过、有无偏差），然后：

```bash
git add -A
git commit -m "docs(desktop): record phase 2 acceptance results"
```

---

## 收尾时修的一个 Critical（最终整体审查发现）

`NextServerHost` 的 `this.child` 字段**没有身份归属**：子进程的 `'exit'` 处理器无条件 `this.child = null`，`killOwnedChild()` 也直接操作裸字段。

`stop()` 的 kill 是异步的，所以旧子进程的 `'exit'` 事件常常在新的 `start()` 已经把 `this.child` 指向新进程**之后**才到达。陈旧处理器于是清空引用，丢掉活着的新子进程——此后每次 `stop()` 都是空操作，Next 服务**活过 Electron 自己的退出**，成为孤儿。

触发条件是**点一次重试按钮**，而重试是 `jade:startup:retry` 唯一的 UI 入口，所以这是主路径。macOS 的 `app.on('activate')` 在旧服务仍活着时再次 `start()` 是同一根因的第二处。

修法：spawn 时捕获 `const child = ...`，在 exit 处理器与 `killOwnedChild()` 里都比对 `this.child === child` 再动手；`start()` 开头先 `killOwnedChild()` 回收上一个。陈旧子进程的退出也不再触发 `onUnexpectedExit`——一个已被取代的尝试死掉不是"当前服务意外退出"，报出去只会显示误导性的错误页。

> **这条最值得记住的不是 bug 本身，而是验收为什么放它过去。** Task 10 的验收**确实有**"退出后无孤儿进程"这一项，而且通过了——因为它只在**正常退出**之后检查，从未走过重试路径。验收项存在、也执行了，却测了错误的路径。
>
> 逐任务审查同样看不见它：单看 `NextServerHost` 一次 `start()` 的生命周期完全正确，缺陷只在**两次 `start()` 交叠**时显现，而那需要把 `index.ts` 的重试接线和 `next-server-host.ts` 的内部状态放在一起看。阶段五写打包验收时要记住这一点：**"检查了 X"不等于"在会产生 X 的路径上检查了 X"**。

## 运行时发现的遗留：孤儿临时文件无人清理

实际跑 `pnpm dev:desktop` 后检查 userData 目录，发现一个昨天验收时留下的孤儿：

```
jade-settings.json.85978.5a26c012-ff1f-474a-9461-14ffd68954de.tmp
```

**唯一临时文件名与陈旧临时文件清理是一对。** 固定名的时候，下一次写入会覆盖掉上次的残留；改成唯一名之后（Task 5 修 Critical 时的必要改动），进程被硬杀（SIGKILL）在"写完临时文件"与"rename"之间时，那个文件就永久留下了，且每次硬杀累积一个。

orca 有配套机制，注释写得很直白：

```ts
/** Temp path for a durable write. Shared shape so `removeStaleDurableWriteTempFiles` can reclaim orphans. */
export function durableWriteTempPath(finalPath: string): string { … }

/**
 * Sweep temp files orphaned by a death between write and rename — for multi-MB payloads they would
 * otherwise accumulate forever. Callers can require a minimum age to spare another live instance's
 * write. This process's own temps are always skipped because deleting one would fail its rename.
 */
export async function removeStaleDurableWriteTempFiles(finalPath, { minimumAgeMs }) { … }
```

它在 `persistence.ts` 启动时调用。两个设计细节值得照抄：**跳过本进程自己的临时文件**（删掉会让自己的 rename 失败），以及**可选的最小年龄门槛**（避免误删另一个活着的实例正在写的文件）。

> **这是同一个错误的第二次。** 第一次是抄漏了 `durableWriteTempPath` 的唯一后缀（审查抓到并修了）；这次是抄漏了它的**配套清理**。"看不出用途的复杂度先假定它是承重的"这条教训，我当时只应用到了被指出的那一处，没有回头看它还牵着什么。
>
> 另外这个 bug **永远不会让任何测试变红**：测试用临时目录、跑完就删，孤儿只在长期使用的真实 userData 里堆积。它只能靠真的把应用跑起来、去看那个目录才发现。

## 打包后修的四个问题（2026-08-11）

装出 dmg 实际使用后暴露的，四个都是**测试永远不会红**的类型。

### 1. Next 子进程自带一个 dock 图标（写着 "exec"）

Next 执行 `process.title = 'next-server (vX.Y.Z)'`（`start-server.js:182`）。macOS 上 libuv 是**通过 LaunchServices 实现这次赋值**的，而当前可执行文件位于 .app bundle 内时，这次调用会把进程注册成前台应用。打包后子进程跑的是 Electron 自己的二进制（在 JadeAI.app 里），于是它拿到独立的 dock tile。`ELECTRON_RUN_AS_NODE` 挡不住——它抑制的是 Chromium 启动，不是 libuv 这次调用。

用打包后的二进制直接验证：只 `setTimeout` 空转的脚本无 LaunchServices 记录；只加一行 `process.title = ...` 就产生一条 `bundle path=/Applications/JadeAI.app`。修法是预加载 `resources/next-title-guard.js` 把 `process.title` 换成普通 accessor。

**这解释了为什么 dev 那次"修好了"却没暴露这条**：dev 走真 node，不在 bundle 里，libuv 那条分支根本不走。同一个 bug 的两种表现，当时只治了一头。

> **`--require=<path>` 必须是单个 argv 元素，不能写 `-r <path>`。** `next dev` 会 re-exec node 并把这些 flag 透过 `NODE_OPTIONS` 传下去，短横线形式到那边变成 `--r=<path>`，node 直接拒绝（`--r= is not allowed in NODE_OPTIONS`），dev 服务当场起不来。长形式在 NODE_OPTIONS 白名单里，能活过这次往返——顺带也就到达了 dev 模式下真正设置 title 的 next-server 孙进程。
>
> 生产环境用 `-r` 是好的（standalone `server.js` 不 re-exec），所以这条**只在 dev 暴露**。先打包验证再跑 dev，才撞上。

### 2. 关窗不退出

macOS "关窗保持常驻"的惯例适合常驻成本低的应用；这个应用会为一个已经不存在的窗口留着一个 Next 服务和一个打开的 SQLite 句柄。`window-all-closed` 改为无条件 `app.quit()`，并删掉 `activate` 重开窗口的处理——留着它就等于宣称存在"活着但没窗口"的状态。

### 3. 信号绕过 `will-quit`

信号终止主进程时**根本不会触发 `will-quit`**，于是 `kill`、系统关机、dev 终端里的 Ctrl+C、以及 dev loop 自己的重启，全都跳过了设置落盘并留下 Next 服务。改为在 `SIGINT`/`SIGTERM`/`SIGHUP` 上走 `app.quit()`，配一个 3s 强制退出看门狗（装了 handler 就压掉了默认的"直接死"，卡住的退出会永久挂着，看门狗是装 handler 的代价）。

**这才是之前观察到残留 next-server 的真正原因**，见下条更正。

### 4. 端口每次启动都变 → 渲染进程的 localStorage 每次都是新的

用户报"新手引导第二次进入还在提示"。根因不在引导代码：

`allocateLoopbackPort()` 每次启动 `listen(0)` 拿一个新端口，而端口是页面 origin 的一部分，Chromium 按 origin 分区 localStorage / IndexedDB / cookie。所以每次启动渲染进程都拿到一块**全新的空存储**。丢掉的不只是 `jade_tour_dashboard_completed`，还有 `jade_dashboard_view` 和 **`settings-store` 里存的 AI API key**——后者用户还没注意到，但比引导重提示严重得多。

修法是把端口持久化进设置文件、下次启动仍可 bind 就复用（`resolveServerPort`）。存的端口被别人占了就换新的并覆盖掉：**起不来比丢一次 web 存储更糟**。

> 这条的教训是**症状和病因隔了很远**。"引导重复出现"看起来百分之百是引导代码的状态管理问题；真正的原因在 Electron 主进程分配端口的那一行，中间隔着 Chromium 的 origin 分区规则。先去读引导代码只会看到一段完全正确的实现。

### 5. 孤儿临时文件清理（补上前面记的遗留）

`sweepStaleDurableWriteTemps` 落地，用 orca 的形状：`opendirSync` + 有界游标（不是 `readdirSync`——它会把整个目录列表物化，而这在"目录里堆了几千个孤儿"这个正要清理的场景下恰好最糟）、1024 条硬上限、年龄门槛。

**一处刻意偏离 orca：没有抄"跳过本进程自己的临时文件"。** 年龄门槛已经覆盖了它想防的事（本模块的写入是毫秒级，5 分钟外的必然已被放弃），而 pid 会被 OS 复用——上一次运行留下的 `.1234.` 孤儿会因为本次运行恰好也是 1234 而被永久跳过，把可回收的孤儿变成永久泄漏。这是权衡后的取舍，不是又一次抄漏。

### 更正一条之前的报告

我之前把"杀 `next dev` 会留下 next-server 孙进程占着端口"报成独立缺陷。实测**不成立**：SIGTERM 给 `next dev`，它会转发给 next-server，两个都干净退出，端口释放。只有 SIGKILL（父进程来不及转发）才真的留下孙进程占着端口——已实测确认。

所以进程组 kill（`detached: true` + `kill(-pid)`）不是那个残留的解药，它是**冗余防线**：让拆除不再依赖 Next 自己的信号处理（父进程卡死或被硬杀时仍然有效）。当时真正看到的残留几乎肯定是第 3 条——那条路径下根本没人给子进程发过信号。

## 阶段二验收

- [ ] `pnpm type-check` 与 `pnpm test` 通过
- [ ] `pnpm dev:desktop` 冷启动能进到仪表盘，全程有 splash 遮挡，无白屏
- [ ] 数据写在 `JadeAI-dev` 下，仓库 `data/` 未被触碰
- [ ] `users` 表恰好一行 `local|local`
- [ ] 监听地址是 `127.0.0.1`，不是 `0.0.0.0`
- [ ] 窗口位置尺寸跨重启保持
- [ ] 启动失败进错误页，重试按钮可用
- [ ] 退出后无 `next dev` 孤儿进程
- [ ] `pnpm dev` 仍可用

## 后续阶段

- **阶段三**：密钥迁到 safeStorage（`secret-store.ts` + preload 契约扩展 + `settings-store.ts` 接入 + Linux 无 keyring 的降级）
- **阶段四**：PDF 改走 `printToPDF`（含请求/响应式 IPC 与页数一致性验收）
- **阶段五**：打包、自动更新、导入导出、Playwright(Electron) 冒烟

阶段三与阶段四的计划**故意留到阶段二落地之后再写**：它们的 preload 契约形状和 `extraResources` 路径必须与阶段二实际产出的文件布局对齐，现在写只能写成猜测。

## 验收执行记录（2026-08-10）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 自动化检查 | ✅ | `pnpm type-check` 无输出（clean）；`pnpm test` → 89 tests / 12 test files 全过 |
| 冷启动 | ✅ | `build:electron` 产出 `out/main/index.js`(17.6kb) 与 `out/preload/index.js`(1.3kb)；`dev:desktop` 后 `pgrep` 同时看到 `Electron .` 主进程与 `.../next dev --turbopack -H 127.0.0.1 -p <port>` 子进程；日志以 `[next] ✓ Ready in 1357ms` 及 `GET /zh 200` 结束，无 `Cannot find module` |
| 数据落在 userData | ✅ | `~/Library/Application Support/JadeAI-dev/` 下有 `jade.db`、`jade.db-wal`、`jade.db-shm`；`git status --short data/` 无输出 |
| 单本地用户 + 示例简历 | ✅（有时序说明） | `sqlite3 ... "SELECT id, auth_type, fingerprint FROM users;"` → `local\|local\|`（空指纹）；`resumes` 计数 `1`。注意：`ensureLocalUser()` 是懒创建（挂在 `resolveUser()` 上，随第一次需要鉴权的请求触发），Electron 主进程冷启动只加载 `/${locale}` 落地页，不会自动访问 dashboard/resume 路由；本记录中的用户与示例简历行是在执行第 6 项（`curl /api/resume`）之后才出现的，属预期的懒加载设计，非缺陷 |
| 只绑回环 | ✅ | `lsof` 显示 `Electron ... TCP 127.0.0.1:60053 (LISTEN)`，无 `*:` 或 `0.0.0.0:` 条目；`curl http://127.0.0.1:60053/api/health` → `200`；`curl http://192.168.2.22:60053/api/health`（局域网 IP）→ `000`（连接失败，非 200） |
| 应用真的可用 | ✅ | `curl .../api/resume -H 'x-fingerprint: irrelevant-value'` 返回 JSON，`userId":"local"`，标题为示例简历，证明 fingerprint 头被忽略；`curl .../zh/dashboard` → `200` |
| 窗口状态持久化 | ✅ | 全量退出（`kill -TERM` 主进程与 watcher）后 `jade-settings.json` 存在，内容含 `"locale":"zh"` 与 `"window":{"width":1280,"height":860,"x":116,"y":61,"maximized":false}`；重新 `pnpm dev:desktop` 后日志干净启动、无读取错误，正常到 `GET /zh 200` |
| 启动失败进错误页 | ✅（部分间接证据） | 通过轮询立即 `kill -9` 刚 spawn 出的 `next dev` 子进程，日志同时出现 `[next] server exited unexpectedly (code=null signal=SIGKILL)` 与 `[startup] failed to bring up the Next server: Error: Next server did not become healthy within 30000ms`，且各只出现 1 次（无重复/循环）。因无 GUI/CDP 可用，未能直接截屏确认 `startup-error.html` 只被 `loadFile` 一次；`errorShownForGeneration` 的代际去重逻辑经代码走读确认存在（`electron/main/index.ts` 中 `showStartupError` 首行即 `if (errorShownForGeneration === generation) return;`），日志无异常重复与本设计一致 |
| 退出后无孤儿进程 | ✅ | `pkill -f "build-electron\|Electron\|next dev"` 后 `pgrep -fl` 无匹配输出（排除无关的 Antigravity IDE 自身 Electron 进程） |
| 裸 `next dev` 仍可用 | ✅ | `curl http://localhost:3000/zh` → `200`；`curl http://localhost:3000/api/health` → `200`；`pkill -f "next dev"` 后无残留 |

偏差与遗留：
- 第 4 项的执行顺序与文档字面顺序有出入：按文档顺序在第 6 项之前查询 `users`/`resumes` 表会是空的，因为本机用户是懒创建的（见上表说明），需先触发一次鉴权请求（如第 6 项的 `curl /api/resume`）才会出现。这是既有设计（`user.repository.ts` 中 `ensureLocalUser()` 的注释已言明），不是本次验收发现的缺陷，但建议后续把该依赖顺序在文档里显式标注，避免下次验收误判为失败。
- 第 8 项用 `pkill -f "next dev"` 精确杀掉一次性子进程会有竞态：Next 在本机编译/就绪一般在 1.1～1.4s 内完成，如果杀进程的时机稍晚（如固定 `sleep 1`）会赶不上，导致服务已经健康、错误页路径不会触发。本次改用轮询立即 kill 规避了竞态,但这提示原计划里的固定 `sleep 1` 在更快的机器上可能不可靠。
- 第 7 项发现一个环境噪音：单独 `pkill -f Electron`（不含 `build-electron`/`next dev`）只会杀死 GPU/utility/renderer 等 Helper 子进程（并触发 `close` 事件写出设置文件），主进程 `Electron .` 本身可能不应声退出，Helper 会被 Chromium 自动重新拉起；同时该模式还会误杀同机运行的其他 Electron 应用（本例中是 Antigravity IDE）的 crashpad 进程。本次改用 `kill -TERM <主进程PID> <watcher PID>` 达成真正的完全退出。这是本次验收操作层面的经验，不是被测代码的缺陷。
- 冷启动与常规运行日志中持续出现 Chromium 磁盘缓存警告（`Failed to create directory: .../Shared Dictionary/cache`、`Unable to create cache`），不影响功能（后续请求均 200），判断为 Electron/Chromium 网络缓存在此 userData 目录下的已知无害噪音，非应用代码缺陷。
