# 桌面客户端 · 阶段一：数据层单机化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 PostgreSQL 支持路径，修掉迁移目录在打包环境必然失效的缺陷，并让认证在 desktop 模式下收口成单个本地用户——全程不引入 Electron，结束时 `pnpm dev` 仍然可用。

**Architecture:** 三件互相独立的改造。(1) 删除 PG 适配器与配置，`src/lib/db/index.ts` 简化成单一 SQLite 路径。(2) 迁移目录从硬编码的 `process.cwd()` 改为可注入的纯函数 `resolveMigrationsDir()`，迁移失败改为抛出而非吞掉。(3) 新增 `config.runtime.desktop` 开关，`resolveUser()` 在该开关下忽略传入的 fingerprint、返回幂等创建的固定本地用户——因此 20+ 个发送 `x-fingerprint` 请求头的客户端调用点一行都不用改。

**Tech Stack:** TypeScript、Drizzle ORM 0.45（better-sqlite3 驱动）、Next.js 16 App Router、vitest 4

**前置阅读：** `docs/superpowers/specs/2026-08-10-desktop-client-design.md` 的「数据存储」「单本地用户改造」「移除 PostgreSQL」三节。

---

## 背景：这个仓库你需要先知道的几件事

- 数据访问全部收口在 `src/lib/db/repositories/*.ts`，被 `src/app/api/**/route.ts` 里的 33 个路由调用。页面（RSC）里**没有**任何直连数据库的代码。
- `src/lib/db/index.ts` 在**模块加载时**就构造适配器并导出单例 `db`。这意味着任何 import 到它的测试都会真的去开一个 SQLite 文件——所以本计划里凡是要测 repository 的地方，都用 `vi.mock('../index', …)` 换成临时库。
- 现有测试只有 3 个（`src/lib/resume/normalize-content.test.ts`、`src/lib/interview/round-status.test.ts`、`src/lib/ai/tools.test.ts`），全是纯函数单测。vitest 的 `include` 是 `src/**/*.test.ts`。
- `src/lib/db/pg-schema.ts` 没有被任何文件 import——它是死代码。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/lib/db/migrations-dir.ts` | 新建 | 纯函数：决定迁移目录（`JADE_MIGRATIONS_DIR` 优先，回退 `<cwd>/drizzle/migrations`） |
| `src/lib/db/migrations-dir.test.ts` | 新建 | 上者的单测 |
| `src/lib/auth/local-user.ts` | 新建 | `LOCAL_USER_ID` / `LOCAL_USER_NAME` 常量 |
| `src/lib/db/adapters/sqlite.ts` | 改 | 用 `resolveMigrationsDir()`；迁移失败抛出；desktop 下不种 demo 数据 |
| `src/lib/db/index.ts` | 改 | 删掉适配器分支与 Vercel 检查 |
| `src/lib/config.ts` | 改 | 删 `db.type`，加 `runtime.desktop` |
| `src/lib/db/schema.ts` | 改 | `authType` enum 加 `'local'` |
| `src/lib/db/repositories/user.repository.ts` | 改 | 新增 `ensureLocalUser()`；`create()` 的 authType 联合类型加 `'local'` |
| `src/lib/db/repositories/user.repository.local-user.test.ts` | 新建 | `ensureLocalUser()` 的集成测试（真临时库） |
| `src/lib/auth/helpers.ts` | 改 | `resolveUser()` 加 desktop 最前置分支 |
| `src/lib/auth/helpers.test.ts` | 新建 | desktop 分支的单测 |
| `src/components/providers/runtime-config-provider.tsx` | 改 | `RuntimeConfig` 加 `desktop` |
| `src/app/[locale]/layout.tsx` | 改 | 把 `desktop` 传进 provider |
| `src/hooks/use-fingerprint.ts` | 改 | desktop 下返回常量，不加载 FingerprintJS |
| `src/lib/db/adapters/postgresql.ts` | **删** | |
| `src/lib/db/pg-schema.ts` | **删** | |
| `drizzle-pg.config.ts` | **删** | |
| `drizzle/pg-migrations/` | **删** | |

---

### Task 1: 移除 PostgreSQL 支持路径

**Files:**
- Delete: `src/lib/db/adapters/postgresql.ts`
- Delete: `src/lib/db/pg-schema.ts`
- Delete: `drizzle-pg.config.ts`
- Delete: `drizzle/pg-migrations/`（整个目录）
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/config.ts`
- Modify: `package.json`

- [ ] **Step 1: 确认 pg-schema.ts 真的没有引用者**

```bash
grep -rn "pg-schema" src scripts drizzle-pg.config.ts
```

Expected: 只有 `drizzle-pg.config.ts:2` 一行（它自己也要删）。如果 `src/` 下出现引用，**停下来报告**——说明它不是死代码，这一步的前提不成立。

- [ ] **Step 2: 删除文件**

```bash
git rm -r src/lib/db/adapters/postgresql.ts src/lib/db/pg-schema.ts drizzle-pg.config.ts drizzle/pg-migrations
```

- [ ] **Step 3: 简化 `src/lib/db/index.ts`**

整个文件替换为：

```ts
import { SQLiteAdapter } from './adapters/sqlite';
import type { DatabaseAdapter } from './adapter';

const adapter: DatabaseAdapter = new SQLiteAdapter(
  process.env.SQLITE_PATH || './data/jade.db',
);

// Initialize (ensure first-run data) — must complete before first query.
const _initPromise = adapter.initialize();

/** Await this before any DB operation. */
export const dbReady = _initPromise;

export const db = adapter.db;
export { adapter };
```

注意两处刻意的改动：不再 `.catch()` 吞掉 `initialize()` 的错误（一个初始化失败的数据库必须响亮地失败），且不再有 Vercel 分支——桌面端不部署到 Vercel。

- [ ] **Step 4: 从 `src/lib/config.ts` 删掉 `db.type`，加上 `runtime.desktop`**

整个文件替换为：

```ts
export const config = {
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    providers: ['google'] as const,
  },
  runtime: {
    /** True when running inside the Electron desktop shell. */
    desktop: process.env.JADE_RUNTIME === 'desktop',
  },
  i18n: {
    defaultLocale: 'zh' as const,
    locales: ['zh', 'en'] as const,
  },
};
```

- [ ] **Step 5: 从 `package.json` 删掉 PG 相关条目**

删除 `scripts` 里的这一行：

```json
"db:generate:pg": "drizzle-kit generate --config drizzle-pg.config.ts",
```

删除 `dependencies` 里的这一行：

```json
"postgres": "^3.4.8",
```

然后：

```bash
pnpm install
```

- [ ] **Step 6: 确认没有残留引用**

```bash
grep -rn "DATABASE_URL\|DB_TYPE\|postgres" src package.json
```

Expected: 无输出。若 `README.md` / `Dockerfile` / `docker_run_local.sh` 里还有，留到 Task 9 统一处理（它们不影响编译）。

- [ ] **Step 7: 类型检查与测试**

```bash
pnpm type-check && pnpm test
```

Expected: 两者都通过。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(db): drop PostgreSQL adapter and DB_TYPE switch

桌面端只用 SQLite。同时去掉 initialize() 的 catch——初始化失败必须响亮
地失败，而不是留下一个没有表的数据库。"
```

---

### Task 2: 迁移目录改为可注入，且迁移失败必须抛出

现状缺陷：`src/lib/db/adapters/sqlite.ts` 用 `resolve(process.cwd(), 'drizzle/migrations')` 定位迁移目录，并把失败包在 `try/catch` 里只打一行 `console.error`。打包后 cwd 不是仓库根，迁移必然找不到，症状会表现为运行时"表不存在"。

> **这个任务才是真正交付"响亮失败"的地方。** Task 1 只拆掉了 `db/index.ts` 外层的 `.catch()`，而那一层在 `sqlite.ts` 内层 `try/catch` 还在的前提下是**惰性的**——迁移失败仍会被吞成一行 log。Task 1 的提交信息在这点上说早了。真正的行为改变发生在下面 Step 5：`migrate()` 不再被包住，于是它在构造函数里**同步抛出**，表现为模块加载失败。
>
> 顺带记录一个推论，避免后人"顺手修好"：`dbReady` 没有 `.catch()` 是有意的。响亮失败走的是构造函数的同步抛出，不是 promise reject；而 `initialize()` 在 Task 7 之后只包着 seed 的 try/catch（seed 失败可生存），所以这个 promise 实际上不会 reject，不存在 unhandled rejection 风险。若在此处加 `.catch()`，反而会把模块加载错误重新藏起来。

**Files:**
- Create: `src/lib/db/migrations-dir.ts`
- Create: `src/lib/db/migrations-dir.test.ts`
- Modify: `src/lib/db/adapters/sqlite.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/db/migrations-dir.test.ts`：

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMigrationsDir } from './migrations-dir';

describe('resolveMigrationsDir', () => {
  it('prefers JADE_MIGRATIONS_DIR when it is set', () => {
    expect(
      resolveMigrationsDir(
        { JADE_MIGRATIONS_DIR: '/Applications/JadeAI.app/Contents/Resources/drizzle/migrations' },
        '/irrelevant',
      ),
    ).toBe('/Applications/JadeAI.app/Contents/Resources/drizzle/migrations');
  });

  // Expected value goes through join() too: this app packages for win/linux/mac,
  // and a hardcoded POSIX literal would fail on Windows where join() yields
  // backslashes. The behaviour under test is "falls back to a cwd-relative
  // subpath", not "uses forward slashes".
  it('falls back to <cwd>/drizzle/migrations when unset', () => {
    expect(resolveMigrationsDir({}, '/repo')).toBe(join('/repo', 'drizzle', 'migrations'));
  });

  // An empty string is what you get from `JADE_MIGRATIONS_DIR=` in a shell or a
  // misconfigured launcher. Treating it as "set" would point migrate() at cwd.
  it('ignores an empty JADE_MIGRATIONS_DIR', () => {
    expect(resolveMigrationsDir({ JADE_MIGRATIONS_DIR: '' }, '/repo')).toBe(
      join('/repo', 'drizzle', 'migrations'),
    );
  });
});
```

第一个用例不需要 `join`：override 生效时返回的是原样传入的字符串，不经过路径拼接。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run src/lib/db/migrations-dir.test.ts
```

Expected: FAIL，报错类似 `Failed to resolve import "./migrations-dir"`。

- [ ] **Step 3: 写最小实现**

创建 `src/lib/db/migrations-dir.ts`：

```ts
import { join } from 'node:path';

/**
 * Where drizzle should look for migration SQL.
 *
 * In a packaged desktop build the process cwd is not the repo root, so the
 * Electron main process passes JADE_MIGRATIONS_DIR pointing at the copy under
 * process.resourcesPath. Everywhere else we fall back to the repo layout.
 */
export function resolveMigrationsDir(
  // Record<> rather than `{ JADE_MIGRATIONS_DIR?: string }`: the latter is a TS
  // "weak type" and rejects process.env with TS2559 (no properties in common).
  env: Record<string, string | undefined>,
  cwd: string,
): string {
  const override = env.JADE_MIGRATIONS_DIR;
  if (override) {
    return override;
  }
  return join(cwd, 'drizzle', 'migrations');
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run src/lib/db/migrations-dir.test.ts
```

Expected: PASS，3 个用例全绿。

- [ ] **Step 5: 接进 SQLiteAdapter，并让迁移失败抛出**

把 `src/lib/db/adapters/sqlite.ts` 整个文件替换为：

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../schema';
import { resolveMigrationsDir } from '../migrations-dir';
import type { DatabaseAdapter } from '../adapter';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class SQLiteAdapter implements DatabaseAdapter {
  db;
  private sqlite: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new Database(path);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.db = drizzle(this.sqlite, { schema });

    // Deliberately NOT wrapped in try/catch. A database with no tables is
    // harder to diagnose than an app that refuses to start: the old code
    // swallowed this and the symptom surfaced later as "no such table".
    migrate(this.db, {
      migrationsFolder: resolveMigrationsDir(process.env, process.cwd()),
    });
  }

  async initialize(): Promise<void> {
    // Nothing to do yet — first-run data is handled per-mode in Task 7.
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }
}
```

- [ ] **Step 6: 验证迁移仍然正常跑**

在仓库根创建一次性脚本 `./jade-init.tmp.ts`（必须在仓库内，否则相对 import 解析不到）。

> **顺序陷阱：跑全量 `pnpm type-check` 之前必须先删掉这个脚本。** 它用 `.ts` 后缀的动态 import 来绕开 tsx 的 CJS 限制，但根 `tsconfig.json` 的 `include` 是 `**/*.ts`，会把仓库根的临时脚本一并纳入，于是 `tsc` 在 `moduleResolution: "bundler"` 下报 TS5097（import 路径不允许带 `.ts` 扩展名）。这与被测代码无关，纯属临时脚本自身的产物。

```ts
// 用 async IIFE 而非 top-level await：tsx 在本仓库把 .ts 入口按 CJS 转换，
// 会直接拒绝 top-level await。
void (async () => {
  const { dbReady } = await import('./src/lib/db/index.ts');
  await dbReady;
  console.log('db initialised');
})();
```

```bash
rm -rf /tmp/jade-migrate-check
SQLITE_PATH=/tmp/jade-migrate-check/jade.db pnpm tsx ./jade-init.tmp.ts
sqlite3 /tmp/jade-migrate-check/jade.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected: `db initialised`，且表清单包含 `users`、`resumes`、`resume_sections`。若报 `no such table` 或迁移目录找不到，说明 Step 5 接错了。

Step 8 会删掉这个临时脚本，**不要提交它**。

- [ ] **Step 7: 验证迁移目录找不到时会抛出（而不是静默）**

```bash
JADE_MIGRATIONS_DIR=/nonexistent SQLITE_PATH=/tmp/jade-migrate-fail/jade.db pnpm tsx ./jade-init.tmp.ts ; echo "exit=$?"
```

Expected: 打印一个关于迁移目录的错误，且 `exit=` 后面是非零值。`exit=0` 意味着错误又被吞了——回到 Step 5 检查。

- [ ] **Step 8: 清理临时脚本并 Commit**

```bash
rm -f ./jade-init.tmp.ts
git add src/lib/db/migrations-dir.ts src/lib/db/migrations-dir.test.ts src/lib/db/adapters/sqlite.ts
git commit -m "fix(db): resolve migrations dir from env and fail loudly

process.cwd() 在打包产物里不是仓库根，迁移必然找不到；旧代码还把失败
catch 掉只打一行 log，症状会推迟到运行时变成 'no such table'。"
```

---

### Task 3: 本地用户常量

**Files:**
- Create: `src/lib/auth/local-user.ts`

- [ ] **Step 1: 创建常量文件**

```ts
/**
 * The desktop client has exactly one user. Its id is a fixed string rather than
 * a random UUID so that exported JSON carries a stable userId — importing an
 * export on another machine then needs no foreign-key rewriting.
 */
export const LOCAL_USER_ID = 'local';

export const LOCAL_USER_NAME = '本机用户';
```

- [ ] **Step 2: 类型检查**

```bash
pnpm type-check
```

Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/local-user.ts
git commit -m "feat(auth): add local user constants"
```

---

### Task 4: schema 与 repository 接受 `'local'` 这个 authType

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/repositories/user.repository.ts`

- [ ] **Step 1: 改 schema 的 enum**

在 `src/lib/db/schema.ts` 中，把 `users` 表的这一行：

```ts
  authType: text('auth_type', { enum: ['oauth', 'fingerprint'] }).notNull(),
```

改为：

```ts
  authType: text('auth_type', { enum: ['oauth', 'fingerprint', 'local'] }).notNull(),
```

- [ ] **Step 2: 确认这不需要新的迁移文件**

drizzle 的 sqlite-core 里 `text(..., { enum: [...] })` **只是 TypeScript 层的联合类型**，不会生成 CHECK 约束，所以列定义没变。验证：

```bash
pnpm db:generate
```

Expected: 输出 `No schema changes, nothing to migrate`。

如果它反而生成了一个新的迁移文件，说明这条前提不成立——**删掉刚生成的文件并停下来报告**，因为那意味着 schema 里还有别的未提交改动混进来了。

- [ ] **Step 3: 放宽 `create()` 的 authType 联合类型**

在 `src/lib/db/repositories/user.repository.ts` 中，把：

```ts
  async create(data: { id?: string; email?: string; name?: string; avatarUrl?: string; authType: 'oauth' | 'fingerprint'; fingerprint?: string }) {
```

改为：

```ts
  async create(data: { id?: string; email?: string; name?: string; avatarUrl?: string; authType: 'oauth' | 'fingerprint' | 'local'; fingerprint?: string }) {
```

- [ ] **Step 4: 类型检查与测试**

```bash
pnpm type-check && pnpm test
```

Expected: 都通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/repositories/user.repository.ts
git commit -m "feat(db): allow authType 'local'

sqlite-core 的 enum 只是 TS 层联合类型，不生成 CHECK 约束，所以列定义
未变，无需新迁移。"
```

---

### Task 5: `userRepository.ensureLocalUser()`

**Files:**
- Create: `src/lib/db/repositories/user.repository.local-user.test.ts`
- Modify: `src/lib/db/repositories/user.repository.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/db/repositories/user.repository.local-user.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `src/lib/db/index.ts` opens a real SQLite file at import time, so every test
// that touches a repository must replace it. The factory is async so it can
// build a throwaway database before the module graph resolves.
vi.mock('../index', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../schema');

  const dir = mkdtempSync(join(tmpdir(), 'jade-local-user-'));
  const sqlite = new Database(join(dir, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: 'drizzle/migrations' });

  return { db, dbReady: Promise.resolve(), adapter: null };
});

const { userRepository } = await import('./user.repository');
const { LOCAL_USER_ID } = await import('../../auth/local-user');
const { db } = await import('../index');
const { users, resumes } = await import('../schema');
const { eq } = await import('drizzle-orm');

// The mocked db above is a module-level singleton: the factory only runs once
// per file, so all `it` blocks share the same temp SQLite file. Without this
// reset, only the first test to run would ever see an empty `users` table —
// every later test would find the local user already present and silently take
// the early-return branch instead of the one its name describes.
// Delete order matters: resumes (child) before users (parent), FK direction.
beforeEach(async () => {
  await db.delete(resumes);
  await db.delete(users);
});

describe('userRepository.ensureLocalUser', () => {
  it('creates the local user on first call', async () => {
    const user = await userRepository.ensureLocalUser();
    expect(user.id).toBe(LOCAL_USER_ID);
    expect(user.authType).toBe('local');
  });

  it('is idempotent — a second call reuses the row instead of inserting again', async () => {
    const first = await userRepository.ensureLocalUser();
    const second = await userRepository.ensureLocalUser();
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toEqual(first.createdAt);

    const rows = await db.select().from(users).where(eq(users.id, LOCAL_USER_ID));
    expect(rows).toHaveLength(1);
  });

  it('gives the local user exactly one starter resume, even across repeated calls', async () => {
    await userRepository.ensureLocalUser();
    // Mimics resolveUser() calling this on every request in desktop mode —
    // a later call must not reseed a second sample resume.
    await userRepository.ensureLocalUser();

    const rows = await db.select().from(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
    expect(rows).toHaveLength(1);
  });
});
```

> **为什么每个用例都要重置表。** 初版这三个用例共享同一个累积状态的库，结果用例 2、3 都只走到提前返回分支——用例 3 里 `ensureLocalUser()` 根本没调用 `createSampleResume`，它能通过只是靠用例 1 留下的行。代码质量审查用变异测试证实了这个盲区：把 `createSampleResume` 挪到提前返回分支之后（即每次调用都种一份简历，正是 `resolveUser()` 每请求调用后最危险的回归），三个用例**全绿**。改成上面这版后同一个变异会让用例 3 变红（`expected length 1 but got 2`）。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run src/lib/db/repositories/user.repository.local-user.test.ts
```

Expected: FAIL，报 `userRepository.ensureLocalUser is not a function`。

- [ ] **Step 3: 实现 `ensureLocalUser()`**

在 `src/lib/db/repositories/user.repository.ts` 顶部的 import 区加上：

```ts
import { LOCAL_USER_ID, LOCAL_USER_NAME } from '../../auth/local-user';
```

然后在 `userRepository` 对象里、`upsertByFingerprint` 之后插入：

```ts
  /**
   * Return the desktop client's single local user, creating it on first call.
   *
   * Idempotent and cheap (one indexed lookup on the hot path), so it is safe to
   * call from resolveUser() on every request. Deliberately NOT called from
   * SQLiteAdapter.initialize(): this module imports `db` from '../index', so
   * having the adapter call back into it would close an import cycle during
   * module evaluation.
   */
  async ensureLocalUser() {
    const existing = await this.findById(LOCAL_USER_ID);
    if (existing) return existing;

    await db
      .insert(users)
      .values({
        id: LOCAL_USER_ID,
        authType: 'local',
        name: LOCAL_USER_NAME,
      })
      .onConflictDoNothing();

    const created = await this.findById(LOCAL_USER_ID);
    if (!created) {
      throw new Error(`Failed to create the local user (id=${LOCAL_USER_ID})`);
    }

    // First run: give the user something to look at instead of an empty
    // dashboard. Deliberately non-fatal — resolveUser() calls this on every
    // desktop request, and an empty dashboard is cosmetic where a failed
    // request is not. The user row is already committed at this point, so a
    // failure here still leaves a usable (if empty) account.
    try {
      await createSampleResume(LOCAL_USER_ID);
    } catch (e) {
      console.error('[db] failed to create the starter resume for the local user:', e);
    }

    return created;
  },
```

> **为什么这里包 try/catch，而 Task 2 的 `migrate()` 不包。** 缺表是灾难性的、必须响亮失败；缺一份示例简历只是仪表盘空着，是外观问题。而 `ensureLocalUser()` 在 desktop 下位于**每个请求**的路径上——让它因为示例数据失败而整体抛出，等于一次数据问题就让 33 个 API 路由全挂。更糟的是用户行此时已经提交，之后每次请求都走提前返回分支、再也不会重试建简历，于是用户永久停在零简历状态却还收到 500。

`createSampleResume` 已经在这个文件顶部 import 过了（`upsertByFingerprint` 在用），不需要新增。

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run src/lib/db/repositories/user.repository.local-user.test.ts
```

Expected: PASS，3 个用例全绿。

若第三个用例失败并报外键错误，检查 `createSampleResume` 是否在插入 user 之前就被调用了——它必须在 `findById` 确认用户存在之后。

- [ ] **Step 5: 全量测试**

```bash
pnpm test && pnpm type-check
```

Expected: 都通过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/repositories/user.repository.ts src/lib/db/repositories/user.repository.local-user.test.ts
git commit -m "feat(db): add userRepository.ensureLocalUser()

幂等创建固定 id 的本地用户，首次创建时附带一份示例简历。放在 repository
而非 adapter.initialize()，避免与 db/index.ts 形成模块初始化循环。"
```

---

### Task 6: `resolveUser()` 的 desktop 分支

这是整个单用户改造的关键收口点：desktop 下忽略传入的 fingerprint，所以 20+ 个发送 `x-fingerprint` 请求头的客户端调用点一行都不用改。

**Files:**
- Create: `src/lib/auth/helpers.test.ts`
- Modify: `src/lib/auth/helpers.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/auth/helpers.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureLocalUser = vi.fn();
const upsertByFingerprint = vi.fn();

vi.mock('@/lib/db', () => ({ db: {}, dbReady: Promise.resolve(), adapter: null }));
vi.mock('@/lib/db/repositories/user.repository', () => ({
  userRepository: { ensureLocalUser, upsertByFingerprint, findById: vi.fn(), findByEmail: vi.fn() },
}));
vi.mock('./config', () => ({ auth: vi.fn() }));

const LOCAL_USER = { id: 'local', authType: 'local' as const };

describe('resolveUser in desktop mode', () => {
  beforeEach(() => {
    vi.resetModules();
    ensureLocalUser.mockReset().mockResolvedValue(LOCAL_USER);
    upsertByFingerprint.mockReset();
  });

  async function loadWithDesktop(desktop: boolean) {
    vi.doMock('@/lib/config', () => ({
      config: { auth: { enabled: false }, runtime: { desktop }, i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] } },
    }));
    return import('./helpers');
  }

  it('returns the local user and ignores the fingerprint entirely', async () => {
    const { resolveUser } = await loadWithDesktop(true);
    expect(await resolveUser('whatever-fingerprint')).toEqual(LOCAL_USER);
    expect(upsertByFingerprint).not.toHaveBeenCalled();
  });

  // This is the property that lets the 20+ client call sites keep sending
  // x-fingerprint unchanged: two different fingerprints must not fork identity.
  it('returns the same user for a missing and for an arbitrary fingerprint', async () => {
    const { resolveUser } = await loadWithDesktop(true);
    expect(await resolveUser(null)).toEqual(await resolveUser('abc123'));
    expect(ensureLocalUser).toHaveBeenCalledTimes(2);
  });

  it('still uses the fingerprint path when not in desktop mode', async () => {
    upsertByFingerprint.mockResolvedValue({ id: 'fp-user', authType: 'fingerprint' });
    const { resolveUser } = await loadWithDesktop(false);
    expect(await resolveUser('abc123')).toEqual({ id: 'fp-user', authType: 'fingerprint' });
    expect(ensureLocalUser).not.toHaveBeenCalled();
  });

  // Pins the branch ORDER, not just the branch: the desktop check sits ahead of
  // config.auth.enabled on purpose, so "desktop has exactly one user" cannot be
  // defeated by an env-var combination. Without this case, moving the desktop
  // branch below the auth branch passes the whole suite.
  // Cannot use loadWithDesktop() — that helper hardcodes auth.enabled to false.
  it('desktop still wins even if auth is (misconfigured to be) enabled', async () => {
    vi.doMock('@/lib/config', () => ({
      config: { auth: { enabled: true }, runtime: { desktop: true }, i18n: { defaultLocale: 'zh', locales: ['zh', 'en'] } },
    }));
    const { resolveUser } = await import('./helpers');
    expect(await resolveUser('whatever-fingerprint')).toEqual(LOCAL_USER);
  });
});
```

> **为什么需要第四个用例。** 前三个用例的 `config.auth.enabled` 全是 `false`，NextAuth 分支从未被激活，所以分支顺序怎么排都测不出来。代码质量审查用变异测试证实：把 desktop 分支挪到 `config.auth.enabled` 块之后，三个用例**全绿**通过——而"desktop 分支必须前置"正是 Step 3 里被明确称为刻意设计的那条不变式。第四个用例让这个变异变红。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run src/lib/auth/helpers.test.ts
```

Expected: FAIL——前两个用例失败，因为当前 `resolveUser(null)` 直接返回 `null`（走的是 fingerprint 分支）。

- [ ] **Step 3: 加上 desktop 分支**

在 `src/lib/auth/helpers.ts` 中，把 `resolveUser` 改为：

```ts
export async function resolveUser(fingerprint?: string | null) {
  // Ensure DB tables exist before any query
  await dbReady;

  // Desktop: one machine, one user. The x-fingerprint header that ~20 client
  // call sites still send is deliberately ignored here rather than removed
  // from each of them.
  if (config.runtime.desktop) {
    return userRepository.ensureLocalUser();
  }

  if (config.auth.enabled) {
    const session = await auth();
    if (!session?.user?.id) return null;

    // User was created during sign-in (jwt callback), just look up
    let user = await userRepository.findById(session.user.id);

    // Fallback: ID may differ if token was issued before DB creation
    if (!user && session.user.email) {
      user = await userRepository.findByEmail(session.user.email);
    }

    return user;
  }

  if (!fingerprint) return null;
  return userRepository.upsertByFingerprint(fingerprint);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run src/lib/auth/helpers.test.ts
```

Expected: PASS，3 个用例全绿。

- [ ] **Step 5: 手动验证 desktop 模式端到端可用**

```bash
rm -rf /tmp/jade-desktop-check
JADE_RUNTIME=desktop SQLITE_PATH=/tmp/jade-desktop-check/jade.db pnpm dev
```

浏览器打开 `http://localhost:3000/zh/dashboard`。Expected: 看到仪表盘和一份示例简历，不跳登录页。然后：

```bash
sqlite3 /tmp/jade-desktop-check/jade.db "SELECT id, auth_type FROM users;"
```

Expected: 恰好一行，`local|local`。

- [ ] **Step 6: 全量测试**

```bash
pnpm test && pnpm type-check
```

Expected: 都通过。

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/helpers.ts src/lib/auth/helpers.test.ts
git commit -m "feat(auth): resolve a single local user in desktop mode

认证收口在 resolveUser() 一处，desktop 下忽略传入的 fingerprint——20+ 个
发送 x-fingerprint 的客户端调用点因此一行都不用改。"
```

---

### Task 7: desktop 模式下不种 demo 数据

`seedDemoUser()` 会造一个 `fingerprint = 'demo-fingerprint'` 的"陈思远"用户。桌面端只应该有 `local` 一个用户，所以 desktop 下要跳过它；web 模式保持现状。

**Files:**
- Modify: `src/lib/db/adapters/sqlite.ts`

- [ ] **Step 1: 在 `initialize()` 里按模式分叉**

把 Task 2 留下的空 `initialize()` 替换为：

```ts
  async initialize(): Promise<void> {
    // Desktop has exactly one user, created lazily by resolveUser() →
    // userRepository.ensureLocalUser(). Seeding a demo-fingerprint user here
    // would leave a second, unreachable user row in every install.
    if (config.runtime.desktop) {
      return;
    }

    try {
      const row = this.sqlite.prepare('SELECT count(*) as count FROM users').get() as
        | { count: number }
        | undefined;
      if (row?.count === 0) {
        const { seedDemoUser } = await import('../seed-demo');
        await seedDemoUser(this.db);
        console.log('[DB] SQLite auto-seed complete');
      }
    } catch (e) {
      console.error('[DB] SQLite auto-seed failed:', e);
    }
  }
```

并在文件顶部 import 区加上：

```ts
import { config } from '../../config';
```

这里的 `try/catch` 保留是有意的：种示例数据失败不影响可用性，和迁移失败不是一回事。

- [ ] **Step 2: 建一个一次性验证脚本**

创建 `./jade-seed-check.tmp.ts`（放在仓库内以便解析相对 import）。

> **顺序陷阱：跑 `pnpm type-check` 之前必须先删掉这个脚本。** 它用 `.ts` 后缀的动态 import 绕开 tsx 的 CJS 限制，而根 `tsconfig.json` 的 `include` 是 `**/*.ts`，会把仓库根的临时脚本纳入编译，于是 `tsc` 在 `moduleResolution: "bundler"` 下报 TS5097（import 路径不得带 `.ts` 扩展名）。这与被测代码无关。Step 5 已按正确顺序编排。

```ts
// async IIFE 而非 top-level await——见 Task 2 Step 6 的同一个 tsx 限制。
void (async () => {
  const { dbReady } = await import('./src/lib/db/index.ts');
  await dbReady;
  if (process.env.JADE_RUNTIME === 'desktop') {
    const { userRepository } = await import('./src/lib/db/repositories/user.repository.ts');
    await userRepository.ensureLocalUser();
  }
  console.log('done');
})();
```

- [ ] **Step 3: 验证 desktop 模式只有一个用户**

```bash
rm -rf /tmp/jade-seed-check
JADE_RUNTIME=desktop SQLITE_PATH=/tmp/jade-seed-check/jade.db pnpm tsx ./jade-seed-check.tmp.ts
sqlite3 /tmp/jade-seed-check/jade.db "SELECT id, auth_type, fingerprint FROM users;"
```

Expected: 恰好一行 `local|local|`（fingerprint 为空）。若还出现 `demo-fingerprint` 用户，说明 Step 1 的分支没生效。

- [ ] **Step 4: 验证 web 模式仍然种示例数据**

```bash
rm -rf /tmp/jade-seed-web
SQLITE_PATH=/tmp/jade-seed-web/jade.db pnpm tsx ./jade-seed-check.tmp.ts
sqlite3 /tmp/jade-seed-web/jade.db "SELECT fingerprint FROM users;"
```

Expected: 输出 `demo-fingerprint`。

- [ ] **Step 5: 先删临时脚本，再跑全量检查**

删除必须排在检查**之前**，否则 `tsc` 会因临时脚本自身报 TS5097——见 Step 2 的顺序陷阱说明。

```bash
rm -f ./jade-seed-check.tmp.ts
pnpm test && pnpm type-check
```

Expected: 都通过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/adapters/sqlite.ts
git commit -m "feat(db): skip demo seed in desktop mode

桌面端只应有 local 一个用户；种 demo-fingerprint 会留下一条永远访问不到
的用户记录。"
```

---

### Task 8: desktop 标志透传到前端，跳过指纹计算

**Files:**
- Modify: `src/components/providers/runtime-config-provider.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/hooks/use-fingerprint.ts`

- [ ] **Step 1: 给 RuntimeConfig 加 `desktop`**

把 `src/components/providers/runtime-config-provider.tsx` 整个文件替换为：

```tsx
'use client';

import { createContext, useContext } from 'react';

interface RuntimeConfig {
  authEnabled: boolean;
  desktop: boolean;
}

const RuntimeConfigContext = createContext<RuntimeConfig>({
  authEnabled: false,
  desktop: false,
});

export function RuntimeConfigProvider({
  children,
  authEnabled,
  desktop,
}: {
  children: React.ReactNode;
  authEnabled: boolean;
  desktop: boolean;
}) {
  return (
    <RuntimeConfigContext.Provider value={{ authEnabled, desktop }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig() {
  return useContext(RuntimeConfigContext);
}
```

- [ ] **Step 2: 在 layout 里传进去**

在 `src/app/[locale]/layout.tsx` 中，把第 19 行：

```tsx
  const authEnabled = process.env.AUTH_ENABLED === 'true';
```

改为：

```tsx
  const authEnabled = process.env.AUTH_ENABLED === 'true';
  const desktop = process.env.JADE_RUNTIME === 'desktop';
```

并把第 29 行：

```tsx
      <RuntimeConfigProvider authEnabled={authEnabled}>
```

改为：

```tsx
      <RuntimeConfigProvider authEnabled={authEnabled} desktop={desktop}>
```

（这里直接读 `process.env` 而不是 import `config`，是为了跟同一文件里 `authEnabled` 的既有写法保持一致。）

- [ ] **Step 3: desktop 下跳过 FingerprintJS**

把 `src/hooks/use-fingerprint.ts` 中的 hook 主体替换为：

```tsx
export function useFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { authEnabled, desktop } = useRuntimeConfig();

  useEffect(() => {
    if (authEnabled) {
      setIsLoading(false);
      return;
    }

    // Desktop ignores the fingerprint server-side (resolveUser always returns
    // the single local user), so computing one would burn CPU for nothing.
    if (desktop) {
      setFingerprint(LOCAL_USER_ID);
      setIsLoading(false);
      return;
    }

    async function getFingerprint() {
      try {
        // Check localStorage first
        const stored = localStorage.getItem('jade_fingerprint');
        if (stored) {
          setFingerprint(stored);
          setIsLoading(false);
          return;
        }

        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const visitorId = result.visitorId;

        localStorage.setItem('jade_fingerprint', visitorId);
        setFingerprint(visitorId);
      } catch {
        // Fallback: generate a random ID
        const fallbackId = generateId();
        localStorage.setItem('jade_fingerprint', fallbackId);
        setFingerprint(fallbackId);
      } finally {
        setIsLoading(false);
      }
    }

    getFingerprint();
  }, [authEnabled, desktop]);

  return { fingerprint, isLoading };
}
```

并在该文件的 import 区加上：

```tsx
import { LOCAL_USER_ID } from '@/lib/auth/local-user';
```

注意 `setFingerprint(LOCAL_USER_ID)` 而不是 `null`：很多调用点是 `fp ? { 'x-fingerprint': fp } : {}`，给个非空值让请求头形状在两种模式下一致，便于排查。服务端反正会忽略它。

- [ ] **Step 4: 类型检查与测试**

```bash
pnpm type-check && pnpm test
```

Expected: 都通过。

- [ ] **Step 5: 手动验证 desktop 下不再加载 FingerprintJS**

```bash
rm -rf /tmp/jade-fp-check
JADE_RUNTIME=desktop SQLITE_PATH=/tmp/jade-fp-check/jade.db pnpm dev
```

打开 `http://localhost:3000/zh/dashboard`，在浏览器 DevTools 的 Network 面板过滤 `fingerprint`。Expected: 没有 FingerprintJS 相关的资源请求；仪表盘正常显示示例简历。

- [ ] **Step 6: Commit**

```bash
git add src/components/providers/runtime-config-provider.tsx src/app/\[locale\]/layout.tsx src/hooks/use-fingerprint.ts
git commit -m "feat(runtime): expose desktop flag to the client, skip fingerprinting

desktop 下服务端本就忽略 fingerprint，再算一次纯属浪费。"
```

---

### Task 9: 清理残留（文档 PG 说明 + 死代码）

**Files:**
- Modify: `src/lib/auth/helpers.ts`（删除 `getCurrentUserId()`，见 Step 0）
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `Dockerfile`（若含 PG 配置）
- Modify: `docker_run_local.sh`（若含 PG 配置）
- Modify: `ARCHITECTURE.md`（若含 PG 说明）
- Modify: `.env.example`（Task 1 的 spec 审查发现它仍有 `DB_TYPE=sqlite`、`DATABASE_URL` 与一段 PostgreSQL 注释块）

- [ ] **Step 0: 删除 `getCurrentUserId()` 这段死代码**

Task 6 的代码质量审查发现 `src/lib/auth/helpers.ts` 里的 `getCurrentUserId()`：

- **没有任何消费者**（`grep -rn "getCurrentUserId" src` 除定义处外无命中）
- 它只复刻了 `resolveUser()` 的 NextAuth 分支，**既没有 desktop 分支也没有 fingerprint 分支**——它不是 `resolveUser()` 的可用替代品，而是它的一个残缺影子
- 它直接对抗 Task 6 的"收口点"设计意图：留着第二个、且对 desktop 无感知的身份解析函数，等于给后来者一个 50/50 的选择，而错的那个会编译通过、肉眼评审也看不出问题，只在 `JADE_RUNTIME=desktop` 下才静默返回 `null`

先确认它确实没有消费者：

```bash
grep -rn "getCurrentUserId" src
```

Expected: 只有 `src/lib/auth/helpers.ts` 里的定义那一处。若出现别的命中，**停下来报告**——说明它不是死代码，删除的前提不成立。

确认后从 `src/lib/auth/helpers.ts` 删掉整个 `getCurrentUserId` 函数连同其上方注释。注意 `auth` 这个 import 仍被 `resolveUser()` 使用，**不要**一并删掉。

```bash
pnpm type-check && pnpm test
```

Expected: 仍全绿。

- [ ] **Step 1: 找出所有残留提及**

```bash
grep -rn "DATABASE_URL\|DB_TYPE\|postgres\|PostgreSQL" README.md README.zh-CN.md ARCHITECTURE.md Dockerfile docker_run_local.sh drizzle.config.ts 2>/dev/null
```

- [ ] **Step 2: 逐处删除或改写**

对上一步列出的每一处：删掉 PG 相关的环境变量表格行、`DB_TYPE=postgresql` 的示例、以及"支持 PostgreSQL"这类描述。保留所有 `SQLITE_PATH` 的说明。新增一行说明 `JADE_RUNTIME=desktop` 的作用（切换为单本地用户模式）。

- [ ] **Step 3: 确认清理干净**

```bash
grep -rn "DATABASE_URL\|DB_TYPE\|postgres\|PostgreSQL" README.md README.zh-CN.md ARCHITECTURE.md Dockerfile docker_run_local.sh 2>/dev/null
```

Expected: 无输出。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: drop PostgreSQL references, document JADE_RUNTIME"
```

---

## 收尾时补的一个并发修复（最终整体审查发现）

`ensureLocalUser()` 起初用"插入后再 `findById` 一次"来判断是否需要种示例简历。这在**顺序**重复调用下正确，但并发下每个调用都看到用户不存在、各自种一份——实测三个并发调用产生 3 份重复简历。

触发路径是真实的首次启动：`src/stores/settings-store.ts` 在模块加载期就发 `GET /api/user/settings`，而 dashboard 的 `useEffect` 同时发 `GET /api/resume`，两条链路在本地用户尚不存在时并行进入 `ensureLocalUser()`。

改法：用 `.returning({ id: users.id })` 让 `onConflictDoNothing()` 的插入告诉我们**本次调用是否真的插入了**行；返回空数组即表示并发对手赢了竞态，此时只读回并返回，不种简历。只有真正插入的那次调用负责种。

> **值得记住的教训。** Task 5 那轮变异测试针对的正是"重复示例简历"这个 bug 类，并且当时确实抓到了一个真盲区——但它只覆盖顺序调用，对并发完全无感。一个专门为某个 bug 类设计的测试，仍然可能对同类 bug 的另一种触发方式毫无防护，而它通过时给出的信心是满的。逐任务审查在结构上也看不见这个问题：它横跨 Task 5（实现）与 Task 8（前端调用时机），单看任一任务都正常。

## 已知遗留（不在阶段一范围，记录以免丢失）

- **`x-fingerprint` 请求头形状在 desktop 下并不真正一致**：Task 8 让 `useFingerprint()` 在 desktop 下返回 `LOCAL_USER_ID`，理由是"让请求头形状在两种模式下一致，便于排查"。但 `src/stores/settings-store.ts:59` 的 `getFingerprint()` **绕过了这个 hook**，直接读 `localStorage.getItem('jade_fingerprint')`——而 desktop 下 hook 不再往 localStorage 写，所以它拿到 `null`，其请求不带该头。功能上无害（`resolveUser()` 在 desktop 下完全忽略该头），但上述理由对这条路径不成立。若将来要让形状真正统一，应让 `settings-store` 也走 hook 或走同一个来源，而不是各读各的。

- **`ARCHITECTURE.md` 的 schema 伪代码仍有非 PG 维度的陈旧**：Task 9 把它从 `pgTable`/`jsonb` 改写成了 SQLite 形态，但没做逐字段同步——仍缺 `resumeShares` 表、`users.settings` 列等（源自 interview/share 等更早的功能）。Task 9 的执行者刻意只修了与 PG 纠缠的部分，边界划得对。留给将来的文档同步任务。
- **`createSampleResume` 不是事务性的**（`src/lib/db/sample-resume.ts`）：简历行与各 section 是分开的多条 insert，没有包 `db.transaction`。若中途失败（比如第 4 个 section 出错），一份残缺简历会被提交下来；而 Task 5 之后 `ensureLocalUser()` 会吞掉这个错误并走提前返回，**再也不会重试**，于是那份残缺简历永久存在。这个风险在本阶段之前就有，但 Task 5 把 `ensureLocalUser()` 放到了每请求路径上、又刻意容忍了 seed 失败，使它的后果从"一次性报错"变成"静默的永久脏数据"。建议在阶段五（导入导出）一并处理：把 `createSampleResume` 包进事务。

## 阶段一验收

全部任务完成后，逐条确认：

- [ ] `pnpm type-check` 通过
- [ ] `pnpm test` 通过，且包含本阶段新增的 3 个测试文件（`migrations-dir.test.ts`、`user.repository.local-user.test.ts`、`helpers.test.ts`）
- [ ] `pnpm dev`（无 `JADE_RUNTIME`）仍可用：走 fingerprint 路径，能看到 demo 用户的示例简历
- [ ] `JADE_RUNTIME=desktop pnpm dev` 可用：不跳登录页，`users` 表恰好一行 `local|local`
- [ ] `JADE_MIGRATIONS_DIR=/nonexistent` 启动时**非零退出**，而不是留下一个空库
- [ ] `grep -rn "postgres" src package.json` 无输出

这些都过了之后进入阶段二（`docs/superpowers/plans/2026-08-10-desktop-client-electron-shell.md`）。
