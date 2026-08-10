# JadeAI 桌面客户端设计

日期：2026-08-10
分支：`feat/desktop-client`
参考实现：`/Users/chenhao/codes/orca`（Electron + electron-vite + electron-builder）。本项目沿用它的进程模型与数据存储纪律，但**构建工具改用 esbuild** —— 原因见「打包」一节。

## 目标

把 JadeAI 从"部署在服务器上的 Next.js 应用"变成一个可分发的桌面客户端：数据全部落在本机、AI key 由用户自带、可打包成 mac/win/linux 安装包并自动更新。同时移除 PostgreSQL 支持路径，只保留 SQLite。

## 非目标

- 不做云端同步、多设备同步、账号体系。
- 不做多本地用户 / 配置档（profiles）。
- 不迁移仓库里已有的 `data/jade.db`、`jadeai-data/`（改用显式导入导出替代）。
- 不维护独立的 web 部署形态。web 生产部署不再作为交付目标；开发一律在 Electron 壳内进行（见「开发工作流」）。

## 从 orca 借鉴的部分

orca 的客户端骨架里，与本项目直接相关的四条：

1. **进程分工**：`main`(Node/Electron) + `preload`(唯一 IPC 契约，`contextBridge.exposeInMainWorld`) + `renderer`(UI)。重活全在 main。
2. **数据存储双轨制**：应用状态是单个 JSON 文件（`orca-data.json`），用「写临时文件 → fsync → rename → fsync 目录」做原子持久化并带 `.bak` 环形备份；结构化/追加型数据走 SQLite；密钥单独走加密 + 加固文件权限。
3. **数据路径一次性捕获**：`initDataPath()` 在启动的确定时机捕获一次 `app.getPath('userData')`，之后所有子系统读这个捕获值——避免 `app.setName()` 之后路径解析漂移（在大小写敏感文件系统上会丢数据）。
4. **打包纪律**：需要 `fork()` 的入口、原生模块、按路径读取的资源目录必须出 asar（`asarUnpack` / `extraResources`）；`npmRebuild: true` 按目标架构重编原生模块；`afterPack` 里跑校验脚本，让"能打包但跑不起来"在打包阶段就失败。

orca 用 `node:sqlite` 而非 `better-sqlite3`（刻意避开原生编译）。本项目**不跟随**：JadeAI 的 Drizzle schema、迁移和全部 repositories 都写在 `drizzle-orm/better-sqlite3` 上，而 drizzle 0.45 没有 `node:sqlite` 驱动。改驱动的收益远小于重写数据访问层的代价——而且自 `better-sqlite3` 13 起它也不再需要 `npmRebuild`（prebuildify 分发 N-API 产物），当初那条代价论据现在更站不住。

## 架构决策

### 决策 1：Next.js 以内嵌本地服务的形态保留

现状调查结果：33 个 `/api/*` 路由承载了全部数据访问，页面里**没有**任何 RSC 直连数据库（只有 `src/lib/auth/helpers.ts` 与 repositories 碰 db），`next.config.ts` 里 `output: 'standalone'` 已配置。

因此：`next build` 产出 standalone，Electron 主进程 fork 出一个本地 Next 服务监听 `127.0.0.1`，`BrowserWindow` 加载它。App Router、RSC、next-intl、33 个 API 路由、AI 流式对话全部零改动。

被否的备选：把 33 个路由的逻辑搬进 main 进程改走 IPC（最贴近 orca，启动最快包最小，但等于重写 UI 层的路由/i18n/数据获取，工作量按周计）；Next 静态导出 + IPC（静态导出禁用 API 路由，仍需同样的重写，却额外丢掉 RSC）。

### 决策 2：单本地用户，砍掉认证

桌面端只有一个用户。表结构不变（`userId` 外键全部保留），只是 `users` 表永远只有一行。

### 决策 3：密钥走 Electron safeStorage

AI key 现状已经是"客户端自带、随请求头下发"（`x-api-key` / `x-provider` / `x-base-url`，值存在 `localStorage`），不是服务端环境变量。所以这里是**换存储位置**，不是重做机制。

### 决策 4：PDF 导出改用 Electron 自带 Chromium

现状靠 `puppeteer-core` 去系统里搜 Chrome/Edge，搜不到就报错——这是 issue #85 与近期两个 commit 反复在补的失败模式。Electron 自带 Chromium，`webContents.printToPDF` 从结构上消除这个失败模式，并从依赖里拔掉 `puppeteer-core` 与 `@sparticuz/chromium-min`。

## 进程模型

```
Electron 主进程 (electron/main/index.ts)
├─ initDataPath()        一次性捕获 app.getPath('userData')
├─ SettingsStore         userData/jade-settings.json（durable write）
├─ SecretStore           userData/jade-secrets.bin（safeStorage 加密）
├─ NextServerHost        fork(ELECTRON_RUN_AS_NODE) → .next/standalone/server.js
│                        注入 SQLITE_PATH / JADE_MIGRATIONS_DIR / JADE_RUNTIME=desktop / PORT=0
├─ PdfRenderer           隐藏 BrowserWindow + printToPDF
├─ IPC handlers          secrets / settings / 导入导出 / 打开数据目录 / 更新
└─ BrowserWindow.loadURL(http://127.0.0.1:<port>/<locale>)
```

**为什么 fork 而不是在 main 里 require Next 服务**：Next 服务会替换全局 `fetch`/`Request`、装 AsyncLocalStorage、做大量 require。跑在 Electron 主进程里会污染主进程，并让两者的崩溃互相牵连。orca 的 `daemon-entry.js` 用 `fork()` 是同一个理由，也正是它必须进 `asarUnpack` 的原因。

**端口**：主进程先预分配一个 loopback 空闲端口（`net.createServer().listen(0, '127.0.0.1')` 拿到端口号后立刻 close），把 `PORT=<port>` 显式传给子进程，再轮询 `/api/health` 判断就绪。不写死端口。

> 初版设计写的是「子进程以 `PORT=0` 启动，通过 `process.send()` 回传实际端口」。那条不成立：Next 的 standalone `server.js` 和 `next dev` 都不会调用 `process.send`——orca 能那么做是因为它 fork 的是自己写的 `daemon-entry.js`，且它靠**解析 stdout** 拿状态。预分配的方案让 dev 与生产走完全相同的代码路径，也不需要解析 stdout。分配与子进程实际 bind 之间理论上有 TOCTOU 窗口，对本机回环上的单实例桌面应用可以忽略，且抢占失败会被就绪轮询的超时捕获、进入错误页。

**只绑 127.0.0.1**，不绑 `0.0.0.0`：这是一个本机私有服务，没有任何认证，绝不能对局域网可见。

**启动时序**：
1. main 捕获数据路径、加载 settings、确保数据目录存在。
2. 建 `BrowserWindow`，`loadFile(resources/splash.html)`。
3. fork Next 服务，等端口回传。
4. 收到端口后 `loadURL(http://127.0.0.1:<port>/<locale>)`，locale 取自 settings。
5. 超时 30s 未 ready，或子进程非零退出 → 窗口切到错误页，提供「重试」与「打开日志」两个动作。

**关闭时序**：窗口关闭 → 刷写 settings（同步 durable write）→ 关闭 SQLite 连接 → `kill` Next 子进程 → 退出。子进程必须挂在 `app.on('will-quit')` 上强制回收，避免残留孤儿进程占端口。

## 开发工作流

开发也在 Electron 壳内跑，这样 `window.jade` 与 main 进程的能力（safeStorage、printToPDF、IPC）在开发时与生产时一致，不存在"只有打包后才能测的功能"。

`NextServerHost` 按模式分叉，是它唯一的模式差异：

| | 命令 | Next 子进程 | 数据目录（macOS 为例） |
|---|---|---|---|
| 开发 | `pnpm dev:desktop` | fork `next dev`（带 turbopack，保留 HMR） | `…/Application Support/JadeAI-dev` |
| 预览 | `pnpm start:desktop` | fork `.next/standalone/server.js` | 同生产 |
| 生产 | 打包产物 | fork `extraResources` 里的 standalone | `…/Application Support/JadeAI` |

`pnpm dev`（裸 `next dev`，浏览器直连）保留用于纯 UI 调试。此模式下 `window.jade` 不存在，依赖 main 能力的功能按下述方式降级：密钥回退到 `localStorage`，PDF 导出返回明确的「仅桌面端可用」错误。这是**开发便利的降级路径，不是交付形态**。

## 数据存储

三层分工照抄 orca：

| 层 | 位置 | 写法 | 内容 |
|---|---|---|---|
| 业务数据 | `<userData>/jade.db`（SQLite WAL） | Drizzle + better-sqlite3 | resumes / resume_sections / chat / interview / analysis / shares / 单个 local user |
| 应用状态 | `<userData>/jade-settings.json` | 临时文件 → fsync → rename → fsync 目录，带 `.bak` | 窗口位置尺寸、locale、主题、上次打开的简历、自动保存开关、onboarding 状态 |
| 密钥 | `<userData>/jade-secrets.bin`（0600） | safeStorage 加密 | 各 provider 的 apiKey |

userData 路径（`productName = JadeAI`）：

- macOS `~/Library/Application Support/JadeAI`
- Windows `%APPDATA%\JadeAI`
- Linux `~/.config/JadeAI`

**dev/prod 隔离**：开发模式下把 userData 重定向到同级的 `JadeAI-dev` 目录（对应 orca 的 `configureDevUserDataPath`），避免开发调试写坏正式数据。这一步必须在 `initDataPath()` **之前**执行。

**为什么应用状态不进 SQLite**：窗口尺寸、上次打开的简历这类状态写入频率高、结构松散、丢失无害，塞进业务库会污染 schema 与迁移历史。orca 的分界线就是这条，本项目沿用。

### 必须修的两个现存缺陷

这两处目前都被 `try/catch` 静默吞掉，在打包环境下会表现为运行时"表不存在"，且日志里只有一行 warning：

1. `src/lib/db/adapters/sqlite.ts` 的 `migrate()` 用 `resolve(process.cwd(), 'drizzle/migrations')` 定位迁移目录。打包后 cwd 不是仓库根，迁移必然找不到。改为读 `JADE_MIGRATIONS_DIR` 环境变量（由 main 传 `process.resourcesPath/drizzle/migrations`），开发环境回退到 `process.cwd()`。**迁移失败必须抛出**，不能吞——一个没有表的数据库比一个启动失败的应用更难排查。
2. `initialize()` 的 auto-seed 依赖 `SELECT count(*) FROM users` 判断是否首次启动，迁移失败时同样被吞。改为：迁移成功后幂等确保本地用户存在（`INSERT ... ON CONFLICT DO NOTHING` 语义），不依赖计数。

## 单本地用户改造

`x-fingerprint` 请求头在 20+ 个客户端调用点铺开了，但**这些调用点一行都不用改**——认证收口在 `resolveUser()` 一个函数里，desktop 分支直接忽略传入的 fingerprint。

改动清单：

- `src/lib/config.ts` 增 `runtime: { desktop: process.env.JADE_RUNTIME === 'desktop' }`。
- `src/lib/auth/helpers.ts` 的 `resolveUser()` 加最前置分支：desktop → 返回幂等创建的本地用户。该用户 id 为常量 `'local'`（不用随机 UUID：导出的 JSON 里 `userId` 因此是稳定值，跨机器导入时不需要重写外键）。`authType: 'local'`、`email: null`、`fingerprint: null`。
- `src/lib/db/schema.ts` 的 `authType` enum 增加 `'local'`（需要一个新的 drizzle 迁移）。
- `src/hooks/use-fingerprint.ts` 在 desktop 下返回常量，不加载 FingerprintJS（省掉一次无意义的指纹计算）。
- `src/components/providers/runtime-config-provider.tsx` 的 `RuntimeConfig` 增加 `desktop: boolean`，供 UI 隐藏登录入口等桌面无关元素。
- NextAuth 代码保留不删：`AUTH_ENABLED` 不设为 `'true'`，`src/middleware.ts` 天然只跑 intl 分支，登录页在桌面端不可达。

## 密钥存储

`src/stores/settings-store.ts` 里只有两处碰 apiKey：`saveApiKeyLocally()`，以及 `loadProviderConfigs()` / `saveProviderConfigs()` 读写的 `ProviderConfig.apiKey` 字段。

抽出一个 `secretStore` 接口（`get(key)` / `set(key, value)` / `delete(key)`，全部 async）：

- desktop 实现走 `window.jade.secrets.*` → preload → IPC → main → `safeStorage.encryptString` / `decryptString` → `<userData>/jade-secrets.bin`（0600）。
- 非 desktop 实现退回 `localStorage`（保持 `next dev` 可用）。

因为接口变成 async，`settings-store` 的 `hydrate()` 需要 await 密钥读取；已有的 `_hydrated` 标记正好承担这个门闸。hydrate 之后 key 就在 store 内存里，**所有读取仍是同步的**——`getAIHeaders()` 这类同步调用点（`ai-chat-panel.tsx`、`create-resume-dialog.tsx` 等）不受影响，无需改造。

key 仍只在渲染进程内存中持有，随请求头发给本地 Next 服务，**不写入 `.db`、不写入 `jade-settings.json`**。

**safeStorage 不可用时**（典型场景：Linux 无 keyring）：降级为 0600 明文文件，并在设置页显示明确警示。不静默假装已加密。

## PDF 导出

新增 `electron/main/pdf/render.ts`：隐藏 `BrowserWindow({ show: false })` → 注入 HTML → `insertCSS` 注入压缩样式 → `webContents.printToPDF({ pageSize: 'A4', printBackground: true })`。

`src/lib/pdf/generate-pdf.ts` 的一页自适应迭代逻辑（`MAX_ITERATIONS = 20`、`buildShrinkCSS()`、A4 像素常量 794×1123）**算法不变**，只替换三个动作：

| puppeteer | Electron |
|---|---|
| `page.setContent()` | `loadURL('data:text/html,…')` 或 `executeJavaScript` 注入 |
| `page.addStyleTag()` | `webContents.insertCSS()` |
| `page.evaluate()` | `webContents.executeJavaScript()` |
| `page.pdf()` | `webContents.printToPDF()` |

**调用路径**：PDF 渲染必须在 main 进程完成（只有 main 能开 `BrowserWindow`），而导出请求从渲染进程发往 Next 服务的 `/api/resume/[id]/export`——Next 子进程本身也不能开窗口。所以链路是：

```
渲染进程 fetch /api/…/export?format=pdf
  → Next 子进程组装 HTML（复用现有 generateHtml + export CSS）
  → 把 HTML 通过 child_process IPC 交给 main
  → main 用隐藏 BrowserWindow printToPDF，把 Buffer 回传
  → Next 子进程作为响应体返回
```

迭代压缩需要多轮往返，因此这条 IPC 是请求/响应式的（带 requestId 与超时），不是单向通知。

`puppeteer-core` 与 `@sparticuz/chromium-min` 从 `package.json` 与 `next.config.ts` 的 `serverExternalPackages` 中一并移除。裸 `next dev` 模式下（无 main 进程可委托）该路由返回 501 与「仅桌面端可用」的说明——不保留第二套渲染实现，两套渲染路径长期共存会各自漂移。

验收标准：同一份简历，改造前后导出的 PDF 页数、字号、页边距一致。

## 移除 PostgreSQL

删除：`src/lib/db/adapters/postgresql.ts`、`src/lib/db/pg-schema.ts`、`drizzle-pg.config.ts`、`drizzle/pg-migrations/`、`package.json` 的 `db:generate:pg` script、`postgres` 依赖。

简化：`src/lib/db/index.ts` 去掉适配器分支与 Vercel 检查，只保留 SQLite 一条路径；`src/lib/config.ts` 去掉 `db.type`。

`src/lib/db/adapter.ts` 的 `DatabaseAdapter` 接口保留（`initialize()` / `close()` 的生命周期钩子在桌面端仍然有用），但它现在只有一个实现。

## 打包

构建管线：`next build`（standalone） → `node scripts/build-electron.mjs`（esbuild 打 main + preload） → `electron-builder`。

> **为什么不用 electron-vite（初版设计选的是它）。** `electron-vite@5` 已是最新版，peer 要求 `vite ^5 || ^6 || ^7`；而本项目通过 `vitest@4.1.8` 已经带了 **vite 8**，硬不兼容——症状是 `MainBuildOptions` 解析不出 `outDir`，同时 vitest 自己也找不到 `vite`。可选的补救是用 pnpm overrides 把 vite 钉到 7 并删掉未使用的 `@vitejs/plugin-react`（它要求 vite ^8），但那等于把测试工具链的版本反向锁死在一个 Electron 构建工具的约束上，日后升级 vitest 或引入任何 vite 8 插件都会再撞一次。
>
> electron-vite 在本项目的核心价值（renderer HMR）本来就用不上——renderer 就是主进程拉起的 Next 服务。改用 esbuild 直接打两个 CJS bundle：esbuild 已在依赖树内，零新增 peer 约束，且 `electron-builder` 只读 `out/` 目录，打包环节完全不受影响。

**资源布局**：`.next/standalone`、`.next/static`、`public`、`drizzle/migrations` 走 `extraResources`——Next 服务需要 fork 出来跑并按路径读取这些文件，进了 asar 就读不到。

`resources/splash.html` 与 `resources/startup-error.html` 也走 `extraResources`，且必须映射到**资源根**（`to: 'splash.html'`），不保留 `resources/` 前缀——主进程的 `resolveResourceFile()` 在打包态是 `join(process.resourcesPath, …)`，多一层前缀就找不到。

**原生模块**：`better-sqlite3` 是唯一原生模块，但 **13.x 起改用 prebuildify 分发 N-API 预编译产物**，`prebuilds/` 下已覆盖 darwin/linux/linuxmusl/win32 × arm64/x64 八个三元组。N-API 跨 ABI 稳定，所以**不需要 `npmRebuild`**——把它设为 `false`，让 electron-builder 直接带走现成的 `.node`。`mupdf` 是 wasm（`dist/mupdf-wasm.wasm`），同样无需重编，但必须确认 `.wasm` 进了产物。

> **这条是阶段二 Task 9 实测撞出来的，初版设计写错了。** 原来钉的 `better-sqlite3@12.6.2` 在 Electron 里**根本加载不了**：它的产物编译于系统 Node（ABI 137），而 Electron 43.3.0 是 ABI 148。更糟的是针对 Electron 头文件重编会**编译失败**而不只是链接失败——`v8::External::New` 在 Electron 43 所带的 V8 里多了一个必需参数，12.6.2 的 C++ 源码早于这个 API 变更。也就是说 `npmRebuild: true` 这条打包方案在真实构建时必然崩。
>
> 升到 13.0.3 后同时在 Electron（ABI 148）与系统 Node（ABI 137）下加载成功，89 个测试不受影响，drizzle 的 peer 范围是 `>=7` 也不冲突。我们用到的 API 只有 `new Database`、`pragma`、`prepare().get()/.all()/.run()`、`close`，逐个实测通过。

**targets**：mac dmg + zip（arm64 / x64）、win nsis、linux AppImage + deb。

**自动更新**：`electron-updater` + GitHub release（同 orca），channel 用 `latest`。

**afterPack 校验**（抄 orca 的打包纪律）：确认下列四项都真实存在于产物中，任一缺失即让打包失败——它们全都属于"能打包、跑不起来"这一类，必须在打包阶段暴露而不是等用户启动：

1. `standalone/server.js`
2. `drizzle/migrations/*.sql`（至少一个）
3. `better-sqlite3` 的 `.node`
4. `mupdf-wasm.wasm`

## 导入导出

设置页新增三个动作，经 IPC 由 main 执行：

- **导出全部数据为 JSON**：resumes + resume_sections + chat + interview + analysis，写到用户选择的路径。顶层带 `formatVersion`（初版为 `1`）与 `exportedAt`，导入时据此校验；不带 `formatVersion` 或版本高于当前的文件直接拒绝并说明原因，不做猜测性解析。**不导出密钥**。
- **从 JSON 导入**：合并（保留现有、追加导入项）或覆盖（清空后导入）二选一，由用户在对话框里显式选择。合并时导入项一律分配新 id，避免与现有记录撞主键。覆盖前二次确认。
- **打开数据目录**：`shell.showItemInFolder(<userData>)`。

## 目录结构

新代码放 `electron/`，不放 `src/main`——`src/` 属于 Next 的编译范围，混进 Electron 主进程代码会让 tsconfig 的 include/exclude 和 Next 的模块解析互相打架。

```
electron/
  main/
    index.ts                 应用生命周期、窗口
    data-path.ts             initDataPath / getCanonicalUserDataPath
    durable-file-write.ts    原子持久化原语
    settings-store.ts        jade-settings.json
    secret-store.ts          jade-secrets.bin + safeStorage
    next-server-host.ts      fork / 端口回传 / 健康检查 / 回收
    updater.ts               electron-updater 接线
    pdf/render.ts            printToPDF 渲染器
    ipc/                     settings / secrets / pdf / data-io / shell
  preload/
    index.ts                 唯一 IPC 契约，contextBridge
scripts/build-electron.mjs
config/electron-builder.config.cjs
resources/splash.html
```

## 测试

现有 vitest 用例全部保留（`config.db.type` 与 PG 相关的用例随代码删除而调整）。

**新增单元测试**：

- durable write 的原子性：写入过程中中断 → 目标文件仍是完整的旧内容；`.bak` 可恢复。
- SecretStore：加解密往返；safeStorage 不可用时降级到 0600 明文并上报降级状态。
- 端口回传：子进程消息解析，含畸形消息与超时两条路径。
- 迁移目录解析：packaged（`process.resourcesPath`）与 dev（`process.cwd()`）两种布局。
- `resolveUser()` 的 desktop 分支：忽略任意 fingerprint，始终返回同一个本地用户。

**新增 Playwright(Electron) 冒烟**：启动 → 新建简历 → 编辑并等自动保存 → 导出 PDF → 重启应用 → 数据仍在。

## 实施顺序

排序原则：先让"能启动、数据不丢"成立，再逐个替换依赖外部环境的能力。每一阶段结束时应用都是可运行的。

1. **数据层先行**（不碰 Electron）：移除 PostgreSQL；修迁移目录解析与 seed 缺陷；`config.runtime.desktop`；`resolveUser()` 的 local 分支；`authType` 加 `'local'` 的迁移。此阶段结束后 `pnpm dev` 仍正常，只是认证走本地用户。
2. **Electron 壳**：`electron/` 骨架、`scripts/build-electron.mjs`、`data-path.ts`、`durable-file-write.ts`、`settings-store.ts`、`next-server-host.ts`（dev 模式先跑通）、splash 与错误页。此阶段结束后 `pnpm dev:desktop` 能开出窗口并正常用全部现有功能（PDF 导出仍走 puppeteer）。
3. **密钥**：`secret-store.ts` + preload 契约 + `settings-store` 接入 + 降级路径。
4. **PDF**：`pdf/render.ts` + 请求响应式 IPC + 迭代逻辑移植 + 拔依赖 + 页数一致性验收。
5. **打包**：`electron-builder.config.cjs`、`extraResources` 布局、`npmRebuild`、`afterPack` 四项校验、三平台产物。
6. **自动更新**：`electron-updater` 接线 + GitHub release 流程。
7. **导入导出**：设置页三个动作。
8. **测试补全**：单测 + Playwright(Electron) 冒烟。

## 风险

- **包体**：Electron 运行时 + Next standalone + node_modules 闭包，dmg 预计 120–180MB。可接受，但需在 CI 里记录体积以便发现异常增长。
- **冷启动**：Next 服务 boot 约 0.5–1.5s，由 splash 遮住。若实测超过 3s，需要考虑把首屏改成预渲染的静态页。
- **locale 前缀路由**：next-intl 用 `/zh`、`/en` 前缀，首屏 `loadURL` 必须带上正确前缀，locale 从 `jade-settings.json` 读；首次启动无 settings 时回退到系统语言，再回退到 `zh`。
- **本地 HTTP 服务的暴露面**：只绑 `127.0.0.1` 且端口随机，但同机上的其它进程仍可访问。桌面端不引入额外认证（与"单本地用户"决策一致），此风险显式接受并记录在此。
