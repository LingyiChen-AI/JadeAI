# 面试官侧（招聘模块）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 JadeAI 增加面试官侧的招聘模块 `/recruit`：建岗位配考察维度 → 加候选人传简历 → AI 生成个性化面试题 → 粘贴面试记录 → AI 出打分、录取建议与评价。

**Architecture:** 三张新表（`recruit_jobs` / `recruit_candidates` / `recruit_evaluations`）+ 两次结构化 AI 调用。题目数按维度权重的分配、以及最终加权总分，都由服务端纯函数计算，不交给模型。桌面端（Electron）加载同一个 Next server，新路由天然可用，只需补导航、i18n 和 SQLite migration。

**Tech Stack:** Next.js 16 (App Router) · React 19 · Drizzle ORM（SQLite + PostgreSQL 双份 schema）· Vercel AI SDK v6 (`generateText`) · zod v4 · next-intl · Tailwind 4 + shadcn/ui · vitest

**Spec:** `docs/superpowers/specs/2026-08-19-recruiter-side-design.md`

---

## 关键约定（先读这段）

**这个仓库的既有习惯，务必照做：**

1. **鉴权**：每个 API handler 开头都是
   ```ts
   const fingerprint = getUserIdFromRequest(request);
   const user = await resolveUser(fingerprint);
   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   ```
   然后校验资源归属。
2. **AI 调用**：`extractAIConfig(request)` 从请求头取用户自带的 provider/key → `getModel(config)` → `generateText({ model, system, prompt, providerOptions: getJsonProviderOptions(config) })` → `extractJson(result.text, zodSchema)`。**不要用 `generateObject`**，本仓库统一走 `generateText` + `extractJson`（对国产模型的容错更好）。
3. **zod 一律 `import { z } from 'zod/v4'`**，不是 `'zod'`。
4. **客户端 fetch** 必须带两类头：`x-fingerprint`（来自 `useFingerprint()`）和 AI 头（来自 `getAIHeaders()`，仅 AI 接口需要）。
5. **SQLite 是运行时真正用的 schema**（`src/lib/db/schema.ts`，被 `adapters/sqlite.ts` 以 `import * as schema` 引入）。`pg-schema.ts` 只给 drizzle-kit 生成 PG migration 用，运行时不引用。**两边都要改。**
6. **测试环境是 node，没有 jsdom / testing-library。** 只对纯函数和 repository 写自动化测试；UI 用 `pnpm dev` 手动验证。不要为了测 UI 去装新依赖。
7. **git commit message 不带任何 `Co-Authored-By` 后缀。**

**每个任务结束都要 commit。**

---

## 文件结构

**新建：**

| 文件 | 职责 |
|---|---|
| `src/types/recruit.ts` | 招聘模块全部 TS 类型（无运行逻辑） |
| `src/lib/recruit/dimensions.ts` | 8 个预置考察维度 + 新岗位默认维度 |
| `src/lib/recruit/scoring.ts` | 纯函数：题目数按权重分配、加权总分计算 |
| `src/lib/recruit/scoring.test.ts` | 上者的测试 |
| `src/lib/db/schema-recruit.ts` | SQLite 三张表 |
| `src/lib/db/repositories/recruit.repository.ts` | 三张表的 CRUD |
| `src/lib/db/repositories/recruit.repository.test.ts` | repository 测试 |
| `src/lib/ai/recruit-schema.ts` | 两次 AI 调用的 zod 输入/输出 schema |
| `src/lib/ai/recruit-schema.test.ts` | schema 解析容错测试 |
| `src/lib/ai/recruit-prompts.ts` | 两次调用的 system prompt + user prompt 构建 |
| `src/lib/ai/recruit-prompts.test.ts` | prompt 构建测试（验证题目分配写进了 prompt） |
| `src/lib/ai/parse-resume.ts` | 从 `/api/resume/parse` 抽出的简历解析能力 |
| `src/lib/recruit/access.ts` | 归属校验：候选人/评价通过 jobId 上溯到岗位 |
| `src/app/api/recruit/jobs/route.ts` | 岗位 列表 / 新建 |
| `src/app/api/recruit/jobs/[id]/route.ts` | 岗位 详情 / 更新 / 删除 |
| `src/app/api/recruit/jobs/[id]/candidates/route.ts` | 候选人 新建 |
| `src/app/api/recruit/candidates/[id]/route.ts` | 候选人 详情 / 更新 / 删除 |
| `src/app/api/recruit/candidates/[id]/resume/route.ts` | 上传文件解析简历 |
| `src/app/api/recruit/candidates/[id]/questions/route.ts` | 生成面试题（AI 调用 1） |
| `src/app/api/recruit/candidates/[id]/evaluation/route.ts` | 生成评价（AI 调用 2） |
| `src/app/[locale]/recruit/layout.tsx` | 招聘模块布局 |
| `src/app/[locale]/recruit/page.tsx` | 岗位列表页 |
| `src/app/[locale]/recruit/[jobId]/page.tsx` | 岗位详情页 |
| `src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx` | 候选人工作台 |
| `src/components/recruit/job-list.tsx` | 岗位列表 |
| `src/components/recruit/job-form-dialog.tsx` | 新建/编辑岗位对话框 |
| `src/components/recruit/dimension-editor.tsx` | 维度勾选 + 权重 + 自定义 |
| `src/components/recruit/candidate-table.tsx` | 候选人列表（可按总分排序） |
| `src/components/recruit/candidate-workspace.tsx` | 工作台 Tabs 容器 |
| `src/components/recruit/resume-panel.tsx` | 简历 Tab |
| `src/components/recruit/questions-panel.tsx` | 面试题 Tab |
| `src/components/recruit/question-card.tsx` | 单题卡片 |
| `src/components/recruit/evaluation-panel.tsx` | 评价 Tab |
| `src/components/recruit/dimension-radar.tsx` | 维度雷达图 |

**修改：**

| 文件 | 改动 |
|---|---|
| `src/lib/db/schema.ts` | 末尾 re-export `schema-recruit` 的三张表 |
| `src/lib/db/pg-schema.ts` | 追加三张表的 PG 版本 |
| `src/app/api/resume/parse/route.ts` | 改为调用 `parse-resume.ts`，对外行为不变 |
| `src/components/layout/header.tsx` | `NAV_ITEMS` 加 `/recruit` |
| `messages/zh.json` / `messages/en.json` | 新增 `recruit` 命名空间 |
| `drizzle/migrations/` / `drizzle/pg-migrations/` | 各生成一份新 migration |

---

## Phase 1：数据层

### Task 1: 类型定义与预置维度

**Files:**
- Create: `src/types/recruit.ts`
- Create: `src/lib/recruit/dimensions.ts`

这个任务只有类型和常量，没有可测的逻辑，因此不写测试——下一个任务的测试会消费它们。

- [ ] **Step 1: 创建类型文件**

创建 `src/types/recruit.ts`：

```ts
/** 考察维度配置。预置维度的 label 由 i18n 填充，自定义维度由用户输入。 */
export interface DimensionConfig {
  key: string;
  label: string;
  /** 相对权重，正整数。决定该维度出几道题、以及在总分里占多大比例。 */
  weight: number;
  custom: boolean;
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface InterviewQuestion {
  id: string;
  /** 对应 DimensionConfig.key */
  dimension: string;
  question: string;
  /** 考察点：这道题真正想看什么 */
  intent: string;
  rubric: {
    excellent: string;
    pass: string;
    fail: string;
  };
  followUps: string[];
  referencePoints: string[];
  estimatedMinutes: number;
  difficulty: QuestionDifficulty;
}

export interface DimensionScore {
  key: string;
  label: string;
  /** 0-100，由模型给出 */
  score: number;
  /** 计算总分时用的权重，冗余存储以便报告复现 */
  weight: number;
}

export interface QuestionEvaluation {
  questionId: string;
  question: string;
  /** AI 从面试记录中定位到的回答摘要 */
  answerSummary: string;
  /** 记录中是否能找到对应回答 */
  answered: boolean;
  score: number;
  highlights: string[];
  weaknesses: string[];
}

export type Recommendation = 'strong_hire' | 'hire' | 'hold' | 'no_hire';

export type CandidateStatus = 'pending' | 'questions_ready' | 'evaluated';

export interface RecruitJob {
  id: string;
  userId: string;
  title: string;
  jobDescription: string;
  dimensions: DimensionConfig[];
  questionCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RecruitCandidate {
  id: string;
  jobId: string;
  name: string;
  status: CandidateStatus;
  resumeText: string;
  resumeData: unknown | null;
  dimensionsOverride: DimensionConfig[] | null;
  questions: InterviewQuestion[] | null;
  transcript: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RecruitEvaluation {
  id: string;
  candidateId: string;
  overallScore: number;
  dimensionScores: DimensionScore[];
  questionEvaluations: QuestionEvaluation[];
  recommendation: Recommendation;
  recommendationReason: string;
  strengths: string[];
  concerns: string[];
  overallComment: string;
  createdAt: Date | string;
}

/** 岗位详情页列表用：候选人 + 其评价摘要，不含大 JSON */
export interface CandidateSummary {
  id: string;
  name: string;
  status: CandidateStatus;
  overallScore: number | null;
  recommendation: Recommendation | null;
  createdAt: Date | string;
}

export const QUESTION_COUNT_MIN = 5;
export const QUESTION_COUNT_MAX = 20;
export const QUESTION_COUNT_DEFAULT = 10;
```

- [ ] **Step 2: 创建预置维度文件**

创建 `src/lib/recruit/dimensions.ts`：

```ts
import type { DimensionConfig } from '@/types/recruit';

/**
 * 预置的 8 个考察维度。label 走 i18n（`recruit.dimensions.<key>`），
 * 这里只存 key，避免把中文硬编码进逻辑层。
 */
export const PRESET_DIMENSION_KEYS = [
  'stress',
  'logic',
  'communication',
  'professional',
  'teamwork',
  'learning',
  'motivation',
  'leadership',
] as const;

export type PresetDimensionKey = (typeof PRESET_DIMENSION_KEYS)[number];

/**
 * 新建岗位时的默认勾选：专业技能最重，逻辑与沟通次之。
 * labelOf 由调用方传入（客户端用 next-intl 的 t 函数）。
 */
export function defaultDimensions(labelOf: (key: string) => string): DimensionConfig[] {
  return [
    { key: 'professional', label: labelOf('professional'), weight: 3, custom: false },
    { key: 'logic', label: labelOf('logic'), weight: 2, custom: false },
    { key: 'communication', label: labelOf('communication'), weight: 2, custom: false },
  ];
}
```

- [ ] **Step 3: 类型检查通过**

Run: `pnpm type-check`
Expected: 无错误（新文件都是纯类型/常量，不应引入任何报错）

- [ ] **Step 4: Commit**

```bash
git add src/types/recruit.ts src/lib/recruit/dimensions.ts
git commit -m "feat(recruit): 招聘模块类型定义与预置考察维度"
```

---

### Task 2: 打分与题目分配的纯函数（TDD）

**Files:**
- Create: `src/lib/recruit/scoring.test.ts`
- Create: `src/lib/recruit/scoring.ts`

这是整个模块唯一有算法的地方，也是最值得测的地方。**先写测试。**

`allocateQuestions` 的规则：
- 每个已勾选维度**至少 1 题**，各维度题数之和**精确等于** total
- 剩余名额按权重用最大余额法分配
- `total` 小于维度个数时无法人人有份：按权重降序（权重相同则按数组原顺序）取前 `total` 个各给 1 题，其余给 0
- 权重全为 0 或全为负时，视作等权

`computeOverallScore` 的规则：
- 加权平均后四舍五入
- 权重 ≤ 0 的维度不参与计算（这就是「某维度全部未作答 → 不计入总分」的落地方式：调用方把该维度的 weight 传 0）
- 可用权重之和为 0 时返回 0

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/recruit/scoring.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { allocateQuestions, computeOverallScore } from './scoring';
import type { DimensionConfig, DimensionScore } from '@/types/recruit';

function dim(key: string, weight: number): DimensionConfig {
  return { key, label: key, weight, custom: false };
}

describe('allocateQuestions', () => {
  it('按权重分配，且总数精确等于 total', () => {
    const dims = [dim('professional', 3), dim('logic', 2), dim('communication', 2)];
    const result = allocateQuestions(dims, 10);
    expect(result).toEqual({ professional: 4, logic: 3, communication: 3 });
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('每个维度至少分到 1 题，哪怕权重悬殊', () => {
    const dims = [dim('professional', 100), dim('teamwork', 1)];
    const result = allocateQuestions(dims, 10);
    expect(result.teamwork).toBeGreaterThanOrEqual(1);
    expect(result.professional + result.teamwork).toBe(10);
  });

  it('余数用最大余额法补齐，不丢题也不多题', () => {
    const dims = [dim('a', 1), dim('b', 1)];
    const result = allocateQuestions(dims, 5);
    expect(result.a + result.b).toBe(5);
    // 1 题打底后余 3，两边各 1.5，最大余额法把多出来的 1 给排在前面的 a
    expect(result).toEqual({ a: 3, b: 2 });
  });

  it('total 小于维度个数时，按权重降序只让前 total 个各出 1 题', () => {
    const dims = [dim('a', 1), dim('b', 5), dim('c', 3)];
    const result = allocateQuestions(dims, 2);
    expect(result).toEqual({ a: 0, b: 1, c: 1 });
  });

  it('权重相同时按原顺序决定谁先拿到名额', () => {
    const dims = [dim('a', 2), dim('b', 2), dim('c', 2)];
    const result = allocateQuestions(dims, 2);
    expect(result).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('权重全为 0 时视作等权', () => {
    const dims = [dim('a', 0), dim('b', 0)];
    const result = allocateQuestions(dims, 6);
    expect(result).toEqual({ a: 3, b: 3 });
  });

  it('单个维度拿走全部题目', () => {
    const result = allocateQuestions([dim('a', 5)], 10);
    expect(result).toEqual({ a: 10 });
  });

  it('没有维度时返回空对象', () => {
    expect(allocateQuestions([], 10)).toEqual({});
  });
});

describe('computeOverallScore', () => {
  function score(key: string, s: number, weight: number): DimensionScore {
    return { key, label: key, score: s, weight };
  }

  it('按权重加权平均并四舍五入', () => {
    // (90*3 + 60*2 + 70*2) / 7 = 530/7 = 75.71 -> 76
    const result = computeOverallScore([
      score('professional', 90, 3),
      score('logic', 60, 2),
      score('communication', 70, 2),
    ]);
    expect(result).toBe(76);
  });

  it('权重为 0 的维度不参与计算', () => {
    // teamwork 整个维度都没问到，weight 传 0，总分应等于只算 professional
    const result = computeOverallScore([
      score('professional', 80, 3),
      score('teamwork', 0, 0),
    ]);
    expect(result).toBe(80);
  });

  it('可用权重之和为 0 时返回 0', () => {
    expect(computeOverallScore([score('a', 90, 0)])).toBe(0);
  });

  it('空数组返回 0', () => {
    expect(computeOverallScore([])).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm vitest run src/lib/recruit/scoring.test.ts`
Expected: FAIL —— `Failed to resolve import "./scoring"`

- [ ] **Step 3: 写实现**

创建 `src/lib/recruit/scoring.ts`：

```ts
import type { DimensionConfig, DimensionScore } from '@/types/recruit';

/**
 * 把 total 道题按权重分到各维度上。
 *
 * 这一步刻意放在服务端而不是交给模型：prompt 里会写死「抗压 3 题、逻辑 4 题」，
 * 否则用户配的权重形同虚设，模型会自己决定各维度出几题。
 *
 * 返回 { dimensionKey: 题目数 }，各值之和精确等于 total（total >= 0 时）。
 */
export function allocateQuestions(
  dimensions: DimensionConfig[],
  total: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (dimensions.length === 0) return result;

  const safeTotal = Math.max(0, Math.floor(total));

  // 名额不够人人有份：按权重降序（同权重保持原顺序）取前 safeTotal 个各给 1 题。
  if (safeTotal <= dimensions.length) {
    for (const d of dimensions) result[d.key] = 0;
    const ranked = dimensions
      .map((d, index) => ({ d, index }))
      .sort((a, b) => b.d.weight - a.d.weight || a.index - b.index);
    for (const { d } of ranked.slice(0, safeTotal)) result[d.key] = 1;
    return result;
  }

  // 权重全为 0（或全为负）时退化成等权，否则负权重会把分配算歪。
  const rawWeights = dimensions.map((d) => Math.max(d.weight, 0));
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = weightSum > 0 ? rawWeights : dimensions.map(() => 1);
  const effectiveSum = weights.reduce((a, b) => a + b, 0);

  // 先每人 1 题打底，剩下的按权重用最大余额法分。
  const remainder = safeTotal - dimensions.length;
  const exact = weights.map((w) => (w / effectiveSum) * remainder);
  const floors = exact.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);

  const byFraction = exact
    .map((v, index) => ({ index, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  let cursor = 0;
  while (assigned < remainder) {
    floors[byFraction[cursor % byFraction.length].index] += 1;
    assigned += 1;
    cursor += 1;
  }

  dimensions.forEach((d, i) => {
    result[d.key] = 1 + floors[i];
  });
  return result;
}

/**
 * 加权总分。
 *
 * 刻意不让模型算这个数：LLM 的算术不可靠，而且总分必须和权重配置严格对应，
 * 同岗位候选人的横向排序才有意义。
 *
 * weight <= 0 的维度被排除——某个维度一道题都没问到时，调用方把它的 weight
 * 置 0，该维度就不会把总分拉低。
 */
export function computeOverallScore(scores: DimensionScore[]): number {
  const usable = scores.filter((s) => s.weight > 0);
  const totalWeight = usable.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = usable.reduce((sum, s) => sum + s.score * s.weight, 0);
  return Math.round(weighted / totalWeight);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run src/lib/recruit/scoring.test.ts`
Expected: PASS，12 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/recruit/scoring.ts src/lib/recruit/scoring.test.ts
git commit -m "feat(recruit): 题目按权重分配与加权总分计算"
```

---

### Task 3: 数据库 schema 与 migration

**Files:**
- Create: `src/lib/db/schema-recruit.ts`
- Modify: `src/lib/db/schema.ts`（末尾追加 re-export）
- Modify: `src/lib/db/pg-schema.ts`（末尾追加三张表）

**注意**：`schema.ts` 末尾已有一段 `export { ... } from './schema-interview';`，照着它加一段即可。运行时只认 `schema.ts`，`pg-schema.ts` 只被 drizzle-kit 读。

- [ ] **Step 1: 创建 SQLite schema**

创建 `src/lib/db/schema-recruit.ts`：

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './schema';

export const recruitJobs = sqliteTable('recruit_jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  jobDescription: text('job_description').notNull(),
  dimensions: text('dimensions', { mode: 'json' }).notNull().default('[]'),
  questionCount: integer('question_count').notNull().default(10),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const recruitCandidates = sqliteTable('recruit_candidates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text('job_id').notNull().references(() => recruitJobs.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default(''),
  status: text('status', { enum: ['pending', 'questions_ready', 'evaluated'] })
    .notNull()
    .default('pending'),
  resumeText: text('resume_text').notNull().default(''),
  resumeData: text('resume_data', { mode: 'json' }),
  dimensionsOverride: text('dimensions_override', { mode: 'json' }),
  questions: text('questions', { mode: 'json' }),
  transcript: text('transcript').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const recruitEvaluations = sqliteTable('recruit_evaluations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidateId: text('candidate_id')
    .notNull()
    .references(() => recruitCandidates.id, { onDelete: 'cascade' })
    .unique(),
  overallScore: integer('overall_score').notNull(),
  dimensionScores: text('dimension_scores', { mode: 'json' }).notNull(),
  questionEvaluations: text('question_evaluations', { mode: 'json' }).notNull(),
  recommendation: text('recommendation', {
    enum: ['strong_hire', 'hire', 'hold', 'no_hire'],
  }).notNull(),
  recommendationReason: text('recommendation_reason').notNull().default(''),
  strengths: text('strengths', { mode: 'json' }).notNull().default('[]'),
  concerns: text('concerns', { mode: 'json' }).notNull().default('[]'),
  overallComment: text('overall_comment').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
```

- [ ] **Step 2: 在 schema.ts 末尾 re-export**

在 `src/lib/db/schema.ts` 文件最末尾，紧跟现有的 `export { ... } from './schema-interview';` 之后追加：

```ts
export {
  recruitJobs,
  recruitCandidates,
  recruitEvaluations,
} from './schema-recruit';
```

- [ ] **Step 3: 在 pg-schema.ts 末尾追加 PG 版本**

在 `src/lib/db/pg-schema.ts` 文件最末尾追加。注意 PG 版本的写法差异：JSON 列用 `text`、外键不声明（该文件的既有表都不声明）、时间戳用文件顶部已定义的 `epochNow`：

```ts
// ── Recruiter-side tables ──

export const recruitJobs = pgTable('recruit_jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  jobDescription: text('job_description').notNull(),
  dimensions: text('dimensions').notNull().default('[]'),
  questionCount: integer('question_count').notNull().default(10),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const recruitCandidates = pgTable('recruit_candidates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text('job_id').notNull(),
  name: text('name').notNull().default(''),
  status: text('status').notNull().default('pending'),
  resumeText: text('resume_text').notNull().default(''),
  resumeData: text('resume_data'),
  dimensionsOverride: text('dimensions_override'),
  questions: text('questions'),
  transcript: text('transcript').notNull().default(''),
  createdAt: integer('created_at').notNull().default(epochNow),
  updatedAt: integer('updated_at').notNull().default(epochNow),
});

export const recruitEvaluations = pgTable('recruit_evaluations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidateId: text('candidate_id').notNull().unique(),
  overallScore: integer('overall_score').notNull(),
  dimensionScores: text('dimension_scores').notNull(),
  questionEvaluations: text('question_evaluations').notNull(),
  recommendation: text('recommendation').notNull(),
  recommendationReason: text('recommendation_reason').notNull().default(''),
  strengths: text('strengths').notNull().default('[]'),
  concerns: text('concerns').notNull().default('[]'),
  overallComment: text('overall_comment').notNull().default(''),
  createdAt: integer('created_at').notNull().default(epochNow),
});
```

- [ ] **Step 4: 生成两套 migration**

Run:
```bash
pnpm db:generate
pnpm db:generate:pg
```
Expected: `drizzle/migrations/` 下多出 `0006_*.sql`，`drizzle/pg-migrations/` 下多出 `0004_*.sql`，两者都包含三条 `CREATE TABLE`。

- [ ] **Step 5: 检查生成的 SQL**

Run: `cat drizzle/migrations/0006_*.sql`
Expected: 看到 `recruit_jobs` / `recruit_candidates` / `recruit_evaluations` 三张表，候选人和评价表带 `ON DELETE cascade`，评价表的 `candidate_id` 上有 unique 索引。**如果只生成了部分表，说明 `schema.ts` 的 re-export 没加对，回到 Step 2。**

- [ ] **Step 6: 类型检查**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema-recruit.ts src/lib/db/schema.ts src/lib/db/pg-schema.ts drizzle/
git commit -m "feat(recruit): 招聘模块数据表与 SQLite/PG 迁移"
```

---

### Task 4: Repository 层（TDD）

**Files:**
- Create: `src/lib/db/repositories/recruit.repository.test.ts`
- Create: `src/lib/db/repositories/recruit.repository.ts`

测试写法照抄 `src/lib/db/repositories/user.repository.local-user.test.ts` 的 `vi.mock('../index')` 套路——那个 mock 建了个临时 SQLite 库并跑 migration，是本仓库测 repository 的既定方式。**顶层 `await import()` 那几行不能改成普通 import，注释里解释了原因。**

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/db/repositories/recruit.repository.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 同 user.repository.local-user.test.ts：src/lib/db/index.ts 在 import 时就会打开
// 真实的 SQLite 文件，所以每个碰 repository 的测试都必须把它替换掉。
vi.mock('../index', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../schema');

  const dir = mkdtempSync(join(tmpdir(), 'jade-recruit-'));
  const sqlite = new Database(join(dir, 'test.db'));
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: 'drizzle/migrations' });

  return { db, dbReady: Promise.resolve(), adapter: null };
});

const { recruitRepository } = await import('./recruit.repository');
const { db } = await import('../index');
const { users, recruitJobs, recruitCandidates, recruitEvaluations } = await import('../schema');

const USER_ID = 'test-user-recruit';

beforeEach(async () => {
  await db.delete(recruitEvaluations);
  await db.delete(recruitCandidates);
  await db.delete(recruitJobs);
  await db.delete(users);
  await db.insert(users).values({ id: USER_ID, authType: 'local' });
});

const DIMENSIONS = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

async function createJob() {
  const job = await recruitRepository.createJob({
    userId: USER_ID,
    title: '高级前端工程师',
    jobDescription: '负责核心页面开发',
    dimensions: DIMENSIONS,
    questionCount: 10,
  });
  if (!job) throw new Error('createJob returned null');
  return job;
}

describe('recruitRepository — jobs', () => {
  it('创建岗位并把 dimensions 原样存回', async () => {
    const job = await createJob();
    expect(job.title).toBe('高级前端工程师');
    expect(job.dimensions).toEqual(DIMENSIONS);
    expect(job.questionCount).toBe(10);
  });

  it('按用户列出岗位，最新的在前', async () => {
    const first = await createJob();
    const second = await recruitRepository.createJob({
      userId: USER_ID,
      title: '后端工程师',
      jobDescription: 'JD',
      dimensions: DIMENSIONS,
      questionCount: 8,
    });
    const jobs = await recruitRepository.findJobsByUserId(USER_ID);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.id)).toContain(first.id);
    expect(jobs.map((j) => j.id)).toContain(second!.id);
  });

  it('更新岗位的维度与题目数', async () => {
    const job = await createJob();
    const next = [...DIMENSIONS, { key: 'stress', label: '抗压能力', weight: 1, custom: false }];
    await recruitRepository.updateJob(job.id, { dimensions: next, questionCount: 15 });
    const updated = await recruitRepository.findJob(job.id);
    expect(updated!.dimensions).toHaveLength(3);
    expect(updated!.questionCount).toBe(15);
  });

  it('删除岗位会级联删掉候选人和评价', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '张三' });
    await recruitRepository.upsertEvaluation({
      candidateId: candidate!.id,
      overallScore: 80,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'hire',
      recommendationReason: '基础扎实',
      strengths: ['沟通清晰'],
      concerns: [],
      overallComment: '整体不错',
    });

    await recruitRepository.deleteJob(job.id);

    expect(await recruitRepository.findCandidate(candidate!.id)).toBeNull();
    expect(await db.select().from(recruitEvaluations)).toHaveLength(0);
  });
});

describe('recruitRepository — candidates', () => {
  it('新建候选人默认是 pending 状态且没有题目', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '李四' });
    expect(candidate!.status).toBe('pending');
    expect(candidate!.questions).toBeNull();
    expect(candidate!.transcript).toBe('');
  });

  it('写入题目后能原样读回', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '王五' });
    const questions = [
      {
        id: 'q1',
        dimension: 'logic',
        question: '讲一个你排查过的线上问题',
        intent: '看拆解问题的路径',
        rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只会复述结论' },
        followUps: ['当时为什么先怀疑这里？'],
        referencePoints: ['定位手段', '验证方式'],
        estimatedMinutes: 8,
        difficulty: 'medium' as const,
      },
    ];
    await recruitRepository.updateCandidate(candidate!.id, {
      questions,
      status: 'questions_ready',
    });
    const updated = await recruitRepository.findCandidate(candidate!.id);
    expect(updated!.questions).toEqual(questions);
    expect(updated!.status).toBe('questions_ready');
  });

  it('候选人摘要列表带出评价的分数和结论，不带大 JSON', async () => {
    const job = await createJob();
    const scored = await recruitRepository.createCandidate({ jobId: job.id, name: '有评价的' });
    await recruitRepository.createCandidate({ jobId: job.id, name: '没评价的' });
    await recruitRepository.upsertEvaluation({
      candidateId: scored!.id,
      overallScore: 88,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'strong_hire',
      recommendationReason: '很强',
      strengths: [],
      concerns: [],
      overallComment: '',
    });

    const summaries = await recruitRepository.findCandidateSummaries(job.id);
    expect(summaries).toHaveLength(2);
    const withScore = summaries.find((s) => s.name === '有评价的')!;
    const without = summaries.find((s) => s.name === '没评价的')!;
    expect(withScore.overallScore).toBe(88);
    expect(withScore.recommendation).toBe('strong_hire');
    expect(without.overallScore).toBeNull();
    expect(without.recommendation).toBeNull();
  });
});

describe('recruitRepository — evaluations', () => {
  it('重复生成评价时覆盖旧的，而不是插第二条', async () => {
    const job = await createJob();
    const candidate = await recruitRepository.createCandidate({ jobId: job.id, name: '赵六' });

    await recruitRepository.upsertEvaluation({
      candidateId: candidate!.id,
      overallScore: 60,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'hold',
      recommendationReason: '待定',
      strengths: [],
      concerns: [],
      overallComment: '第一版',
    });
    await recruitRepository.upsertEvaluation({
      candidateId: candidate!.id,
      overallScore: 85,
      dimensionScores: [],
      questionEvaluations: [],
      recommendation: 'hire',
      recommendationReason: '重新评估后认可',
      strengths: [],
      concerns: [],
      overallComment: '第二版',
    });

    const rows = await db.select().from(recruitEvaluations);
    expect(rows).toHaveLength(1);
    const latest = await recruitRepository.findEvaluation(candidate!.id);
    expect(latest!.overallScore).toBe(85);
    expect(latest!.overallComment).toBe('第二版');
  });

  it('候选人不存在时查评价返回 null', async () => {
    expect(await recruitRepository.findEvaluation('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm vitest run src/lib/db/repositories/recruit.repository.test.ts`
Expected: FAIL —— `Failed to resolve import "./recruit.repository"`

- [ ] **Step 3: 写实现**

创建 `src/lib/db/repositories/recruit.repository.ts`：

```ts
import { eq, desc } from 'drizzle-orm';
import { db } from '../index';
import { recruitJobs, recruitCandidates, recruitEvaluations } from '../schema';
import type {
  CandidateStatus,
  CandidateSummary,
  DimensionConfig,
  DimensionScore,
  InterviewQuestion,
  QuestionEvaluation,
  Recommendation,
} from '@/types/recruit';

export const recruitRepository = {
  // ── Jobs ────────────────────────────────────────────────────────────────────

  async createJob(data: {
    userId: string;
    title: string;
    jobDescription: string;
    dimensions: DimensionConfig[];
    questionCount: number;
  }) {
    const id = crypto.randomUUID();
    await db.insert(recruitJobs).values({
      id,
      userId: data.userId,
      title: data.title,
      jobDescription: data.jobDescription,
      dimensions: data.dimensions as any,
      questionCount: data.questionCount,
    } as any);
    return this.findJob(id);
  },

  async findJob(jobId: string) {
    const rows = await db.select().from(recruitJobs).where(eq(recruitJobs.id, jobId)).limit(1);
    return rows[0] ?? null;
  },

  async findJobsByUserId(userId: string) {
    return db
      .select()
      .from(recruitJobs)
      .where(eq(recruitJobs.userId, userId))
      .orderBy(desc(recruitJobs.createdAt));
  },

  async updateJob(
    jobId: string,
    data: Partial<{
      title: string;
      jobDescription: string;
      dimensions: DimensionConfig[];
      questionCount: number;
    }>,
  ) {
    await db
      .update(recruitJobs)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(recruitJobs.id, jobId));
    return this.findJob(jobId);
  },

  async deleteJob(jobId: string) {
    await db.delete(recruitJobs).where(eq(recruitJobs.id, jobId));
  },

  // ── Candidates ──────────────────────────────────────────────────────────────

  async createCandidate(data: { jobId: string; name: string }) {
    const id = crypto.randomUUID();
    await db.insert(recruitCandidates).values({
      id,
      jobId: data.jobId,
      name: data.name,
    } as any);
    return this.findCandidate(id);
  },

  async findCandidate(candidateId: string) {
    const rows = await db
      .select()
      .from(recruitCandidates)
      .where(eq(recruitCandidates.id, candidateId))
      .limit(1);
    return rows[0] ?? null;
  },

  async findCandidatesByJobId(jobId: string) {
    return db
      .select()
      .from(recruitCandidates)
      .where(eq(recruitCandidates.jobId, jobId))
      .orderBy(desc(recruitCandidates.createdAt));
  },

  /**
   * 岗位详情页的候选人列表：只取列表要显示的列，评价的大 JSON 不查出来。
   */
  async findCandidateSummaries(jobId: string): Promise<CandidateSummary[]> {
    const rows = await db
      .select({
        id: recruitCandidates.id,
        name: recruitCandidates.name,
        status: recruitCandidates.status,
        createdAt: recruitCandidates.createdAt,
        overallScore: recruitEvaluations.overallScore,
        recommendation: recruitEvaluations.recommendation,
      })
      .from(recruitCandidates)
      .leftJoin(recruitEvaluations, eq(recruitEvaluations.candidateId, recruitCandidates.id))
      .where(eq(recruitCandidates.jobId, jobId))
      .orderBy(desc(recruitCandidates.createdAt));

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status as CandidateStatus,
      createdAt: r.createdAt,
      overallScore: r.overallScore ?? null,
      recommendation: (r.recommendation ?? null) as Recommendation | null,
    }));
  },

  async updateCandidate(
    candidateId: string,
    data: Partial<{
      name: string;
      status: CandidateStatus;
      resumeText: string;
      resumeData: unknown;
      dimensionsOverride: DimensionConfig[] | null;
      questions: InterviewQuestion[] | null;
      transcript: string;
    }>,
  ) {
    await db
      .update(recruitCandidates)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(recruitCandidates.id, candidateId));
    return this.findCandidate(candidateId);
  },

  async deleteCandidate(candidateId: string) {
    await db.delete(recruitCandidates).where(eq(recruitCandidates.id, candidateId));
  },

  // ── Evaluations ─────────────────────────────────────────────────────────────

  async findEvaluation(candidateId: string) {
    const rows = await db
      .select()
      .from(recruitEvaluations)
      .where(eq(recruitEvaluations.candidateId, candidateId))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * 一个候选人一份评价。重新生成时先删后插——candidate_id 上有 unique 约束，
   * 直接 insert 会撞约束。
   */
  async upsertEvaluation(data: {
    candidateId: string;
    overallScore: number;
    dimensionScores: DimensionScore[];
    questionEvaluations: QuestionEvaluation[];
    recommendation: Recommendation;
    recommendationReason: string;
    strengths: string[];
    concerns: string[];
    overallComment: string;
  }) {
    await db
      .delete(recruitEvaluations)
      .where(eq(recruitEvaluations.candidateId, data.candidateId));
    const id = crypto.randomUUID();
    await db.insert(recruitEvaluations).values({
      id,
      candidateId: data.candidateId,
      overallScore: data.overallScore,
      dimensionScores: data.dimensionScores as any,
      questionEvaluations: data.questionEvaluations as any,
      recommendation: data.recommendation,
      recommendationReason: data.recommendationReason,
      strengths: data.strengths as any,
      concerns: data.concerns as any,
      overallComment: data.overallComment,
    } as any);
    return this.findEvaluation(data.candidateId);
  },
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run src/lib/db/repositories/recruit.repository.test.ts`
Expected: PASS，9 个测试全绿

- [ ] **Step 5: 跑全量测试确认没弄坏别的**

Run: `pnpm test`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/repositories/recruit.repository.ts src/lib/db/repositories/recruit.repository.test.ts
git commit -m "feat(recruit): 招聘模块 repository 层"
```

---

## Phase 2：AI 层

### Task 5: AI 输入输出的 zod schema（TDD）

**Files:**
- Create: `src/lib/ai/recruit-schema.test.ts`
- Create: `src/lib/ai/recruit-schema.ts`

模型输出经 `extractJson(text, schema)` 校验。schema 要**宽进严出**：模型常漏字段、数组给成 null、分数超出 0-100，这些都得容错，而不是整份丢弃。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/ai/recruit-schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { extractJson } from './extract-json';
import { questionsOutputSchema, evaluationOutputSchema, dimensionsSchema } from './recruit-schema';

describe('questionsOutputSchema', () => {
  it('解析正常的题目输出', () => {
    const raw = JSON.stringify({
      questions: [
        {
          dimension: 'logic',
          question: '讲一个你排查过的线上问题',
          intent: '看拆解问题的路径',
          rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只复述结论' },
          followUps: ['当时为什么先怀疑这里？'],
          referencePoints: ['定位手段'],
          estimatedMinutes: 8,
          difficulty: 'medium',
        },
      ],
    });
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].dimension).toBe('logic');
  });

  it('容忍模型漏掉 followUps / referencePoints，补成空数组', () => {
    const raw = JSON.stringify({
      questions: [
        {
          dimension: 'stress',
          question: '需求临时砍半你怎么办',
          intent: '看情绪稳定性',
          rubric: { excellent: 'a', pass: 'b', fail: 'c' },
          estimatedMinutes: 5,
          difficulty: 'easy',
        },
      ],
    });
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions[0].followUps).toEqual([]);
    expect(result.questions[0].referencePoints).toEqual([]);
  });

  it('难度值不在枚举里时降级成 medium', () => {
    const raw = JSON.stringify({
      questions: [
        {
          dimension: 'logic',
          question: 'q',
          intent: 'i',
          rubric: { excellent: 'a', pass: 'b', fail: 'c' },
          estimatedMinutes: 5,
          difficulty: '中等',
        },
      ],
    });
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions[0].difficulty).toBe('medium');
  });

  it('能从带 markdown 代码围栏的输出里提取', () => {
    const raw = '```json\n' + JSON.stringify({
      questions: [
        {
          dimension: 'logic',
          question: 'q',
          intent: 'i',
          rubric: { excellent: 'a', pass: 'b', fail: 'c' },
          estimatedMinutes: 5,
          difficulty: 'hard',
        },
      ],
    }) + '\n```';
    const result = extractJson(raw, questionsOutputSchema);
    expect(result.questions[0].difficulty).toBe('hard');
  });

  it('完全不是 JSON 时抛错', () => {
    expect(() => extractJson('抱歉，我无法完成这个请求。', questionsOutputSchema)).toThrow();
  });
});

describe('evaluationOutputSchema', () => {
  const valid = {
    questionEvaluations: [
      {
        questionId: 'q1',
        answerSummary: '讲了一个缓存击穿的排查过程',
        answered: true,
        score: 82,
        highlights: ['有量化'],
        weaknesses: ['没说清最终收益'],
      },
    ],
    dimensionScores: [{ key: 'logic', score: 82 }],
    strengths: ['逻辑清晰'],
    concerns: ['缺乏大规模系统经验'],
    overallComment: '整体符合预期',
    recommendation: 'hire',
    recommendationReason: '基础扎实，可以进入下一轮',
  };

  it('解析正常的评价输出', () => {
    const result = extractJson(JSON.stringify(valid), evaluationOutputSchema);
    expect(result.recommendation).toBe('hire');
    expect(result.dimensionScores[0].score).toBe(82);
  });

  it('分数超出 0-100 时钳到边界，而不是整份丢弃', () => {
    const raw = JSON.stringify({
      ...valid,
      dimensionScores: [{ key: 'logic', score: 120 }],
      questionEvaluations: [{ ...valid.questionEvaluations[0], score: -5 }],
    });
    const result = extractJson(raw, evaluationOutputSchema);
    expect(result.dimensionScores[0].score).toBe(100);
    expect(result.questionEvaluations[0].score).toBe(0);
  });

  it('recommendation 不在枚举里时降级成 hold', () => {
    const raw = JSON.stringify({ ...valid, recommendation: '建议录用' });
    const result = extractJson(raw, evaluationOutputSchema);
    expect(result.recommendation).toBe('hold');
  });

  it('容忍 strengths / concerns 缺失', () => {
    const { strengths, concerns, ...rest } = valid;
    const result = extractJson(JSON.stringify(rest), evaluationOutputSchema);
    expect(result.strengths).toEqual([]);
    expect(result.concerns).toEqual([]);
  });
});

describe('dimensionsSchema', () => {
  const ok = { key: 'logic', label: '逻辑思维', weight: 2, custom: false };

  it('接受合法的维度配置', () => {
    expect(dimensionsSchema.safeParse([ok]).success).toBe(true);
  });

  it('拒绝空数组', () => {
    const result = dimensionsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('拒绝重复的 key', () => {
    const result = dimensionsSchema.safeParse([ok, { ...ok, label: '换个名字' }]);
    expect(result.success).toBe(false);
  });

  it('拒绝非正整数的权重', () => {
    expect(dimensionsSchema.safeParse([{ ...ok, weight: 0 }]).success).toBe(false);
    expect(dimensionsSchema.safeParse([{ ...ok, weight: -1 }]).success).toBe(false);
    expect(dimensionsSchema.safeParse([{ ...ok, weight: 1.5 }]).success).toBe(false);
  });

  it('拒绝空的 key 或 label', () => {
    expect(dimensionsSchema.safeParse([{ ...ok, key: '' }]).success).toBe(false);
    expect(dimensionsSchema.safeParse([{ ...ok, label: '' }]).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm vitest run src/lib/ai/recruit-schema.test.ts`
Expected: FAIL —— `Failed to resolve import "./recruit-schema"`

- [ ] **Step 3: 写实现**

创建 `src/lib/ai/recruit-schema.ts`：

```ts
import { z } from 'zod/v4';
import { QUESTION_COUNT_MAX, QUESTION_COUNT_MIN } from '@/types/recruit';

// ── 通用容错工具 ──────────────────────────────────────────────────────────────

/** 模型经常把数组字段整个漏掉或给成 null，统一补成空数组。 */
const stringArray = z
  .union([z.array(z.string()), z.null(), z.undefined()])
  .transform((v) => v ?? []);

/** 分数钳到 0-100。模型偶尔给 120 或 -5，为此丢掉整份评价不值得。 */
const score0to100 = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .transform((v) => (Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0));

// ── 输入 schema（API 请求体校验） ─────────────────────────────────────────────

export const dimensionConfigSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().int().positive(),
  custom: z.boolean(),
});

/** 岗位维度配置：至少勾一个，key 不许重复。 */
export const dimensionsSchema = z
  .array(dimensionConfigSchema)
  .min(1, '至少选择一个考察维度')
  .refine(
    (dims) => new Set(dims.map((d) => d.key)).size === dims.length,
    { message: '考察维度不能重复' },
  );

export const createJobInputSchema = z.object({
  title: z.string().min(1).max(100),
  jobDescription: z.string().min(1),
  dimensions: dimensionsSchema,
  questionCount: z.number().int().min(QUESTION_COUNT_MIN).max(QUESTION_COUNT_MAX),
});

export const updateJobInputSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  jobDescription: z.string().min(1).optional(),
  dimensions: dimensionsSchema.optional(),
  questionCount: z.number().int().min(QUESTION_COUNT_MIN).max(QUESTION_COUNT_MAX).optional(),
});

export const createCandidateInputSchema = z.object({
  name: z.string().min(1).max(50),
});

export const updateCandidateInputSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  resumeText: z.string().optional(),
  transcript: z.string().optional(),
  dimensionsOverride: dimensionsSchema.nullable().optional(),
  /** 删除单题用：前端传剩下的题目全集，整体覆盖 */
  questions: z.array(z.any()).nullable().optional(),
});

// ── 输出 schema（模型返回值校验） ─────────────────────────────────────────────

const difficultySchema = z
  .union([z.enum(['easy', 'medium', 'hard']), z.string(), z.null(), z.undefined()])
  .transform((v) => (v === 'easy' || v === 'medium' || v === 'hard' ? v : 'medium'));

const rawQuestionSchema = z.object({
  dimension: z.string(),
  question: z.string(),
  intent: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
  rubric: z
    .union([
      z.object({
        excellent: z.string(),
        pass: z.string(),
        fail: z.string(),
      }),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => v ?? { excellent: '', pass: '', fail: '' }),
  followUps: stringArray,
  referencePoints: stringArray,
  estimatedMinutes: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const n = typeof v === 'string' ? Number(v) : v;
      return Number.isFinite(n) && (n as number) > 0 ? Math.round(n as number) : 5;
    }),
  difficulty: difficultySchema,
});

export const questionsOutputSchema = z.object({
  questions: z.array(rawQuestionSchema).min(1),
});

export type QuestionsOutput = z.infer<typeof questionsOutputSchema>;

const recommendationSchema = z
  .union([z.enum(['strong_hire', 'hire', 'hold', 'no_hire']), z.string(), z.null(), z.undefined()])
  .transform((v) =>
    v === 'strong_hire' || v === 'hire' || v === 'hold' || v === 'no_hire' ? v : 'hold',
  );

export const evaluationOutputSchema = z.object({
  questionEvaluations: z.array(
    z.object({
      questionId: z.string(),
      answerSummary: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
      answered: z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => v ?? false),
      score: score0to100,
      highlights: stringArray,
      weaknesses: stringArray,
    }),
  ),
  dimensionScores: z.array(
    z.object({
      key: z.string(),
      score: score0to100,
    }),
  ),
  strengths: stringArray,
  concerns: stringArray,
  overallComment: z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? ''),
  recommendation: recommendationSchema,
  recommendationReason: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v ?? ''),
});

export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run src/lib/ai/recruit-schema.test.ts`
Expected: PASS，14 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/recruit-schema.ts src/lib/ai/recruit-schema.test.ts
git commit -m "feat(recruit): AI 输入输出 zod schema 与容错"
```

---

### Task 6: 抽出简历解析能力

**Files:**
- Create: `src/lib/ai/parse-resume.ts`
- Modify: `src/app/api/resume/parse/route.ts`

现有的 `route.ts` 有 578 行，把「多模态解析」和「写入 resumes 表」焊死在一起。招聘侧只要前半段——候选人的简历不该污染用户自己的简历列表。

**这是纯搬运，不是重写。** 把函数体原样移过去，不要顺手改逻辑、改 prompt、改容错分支。任何行为变化都会波及现有的简历上传功能。

- [ ] **Step 1: 创建 parse-resume.ts，搬运解析逻辑**

创建 `src/lib/ai/parse-resume.ts`。从 `src/app/api/resume/parse/route.ts` **原样剪切**以下内容过来（行号基于改动前的文件）：

| 内容 | 行号 |
|---|---|
| `ACCEPTED_TYPES` | 9–15 |
| `MAX_FILE_SIZE` | 16 |
| `SYSTEM_PROMPT` | 18–40 |
| POST handler 里构造 messages 到解析出 resumeData 的整段 | 64–128 |
| `loadMupdfDoc` | 167–171 |
| `extractPdfText` | 172–186 |
| `pdfPagesToImages` | 187–208 |
| `parseJsonFromText` | 209–243 |
| `repairTruncatedJson` | 244–282 |
| `mapToResumeSchema` | 283–382 |
| `str` / `mapArray` / `toStringArray` / `mapSkills` | 383–437 |

**`buildSections`（438 行起）不动**——它是把解析结果写成 DB sections，属于落库逻辑，留在 route.ts。

`buildSections` 很可能也用到了 `str` / `mapArray` / `toStringArray` 这几个小工具。如果搬走后 route.ts 报未定义，就把用到的那几个从 `parse-resume.ts` `export` 出来，在 route.ts 里 import 回去——**不要在两处各留一份拷贝**。

文件顶部导出这三样：

```ts
import { generateText } from 'ai';
import type { ModelMessage } from 'ai';
import { getModel, getJsonProviderOptions, type AIConfig } from '@/lib/ai/provider';
import type { ParsedResume } from '@/lib/ai/parse-schema';

export const ACCEPTED_RESUME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** 文件类型/大小校验。通过返回 null，不通过返回错误信息。 */
export function validateResumeFile(file: File): string | null {
  if (!ACCEPTED_RESUME_TYPES.includes(file.type)) {
    return 'Unsupported file type. Accepted: PDF, PNG, JPG, WebP';
  }
  if (file.size > MAX_RESUME_FILE_SIZE) {
    return 'File too large. Maximum size: 10MB';
  }
  return null;
}

/**
 * 把简历文件解析成结构化数据。不落库——调用方决定存到哪。
 *
 * 从 /api/resume/parse 抽出来，好让招聘侧复用同一套多模态解析，
 * 而不必为候选人的简历在 resumes 表里造一条记录。
 */
export async function parseResumeFile(file: File, aiConfig: AIConfig): Promise<ParsedResume> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const model = getModel(aiConfig);

  const messages: ModelMessage[] = [];
  const isPdf = file.type === 'application/pdf';

  // ...（此处为原 route.ts 里构造 messages 的完整逻辑，原样搬运）

  const result = await generateText({
    model,
    maxOutputTokens: 16384,
    system: SYSTEM_PROMPT,
    messages,
    providerOptions: getJsonProviderOptions(aiConfig),
  });

  console.log('[parse] finishReason=%s, length=%d', result.finishReason, result.text.length);

  const raw = parseJsonFromText(result.text);
  if (!raw || typeof raw !== 'object') {
    console.error('[parse] Failed to parse JSON. Raw text:', result.text.slice(0, 500));
    throw new Error('Failed to extract resume data');
  }

  return mapToResumeSchema(raw as Record<string, unknown>);
}
```

注意 `AIConfig` 类型需要从 provider 导出——它已经是 `export interface AIConfig`，直接 `import type` 即可。

- [ ] **Step 2: 改写 route.ts 调用新模块**

`src/app/api/resume/parse/route.ts` 的 POST handler 改成：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { parseResumeFile, validateResumeFile } from '@/lib/ai/parse-resume';

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const template = (formData.get('template') as string) || 'classic';
    const language = (formData.get('language') as string) || 'zh';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const invalid = validateResumeFile(file);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const aiConfig = extractAIConfig(request);
    const resumeData = await parseResumeFile(file, aiConfig);

    // ...（以下为原有的落库逻辑，原样保留：创建 resume、写 sections、返回响应）
  } catch (error) {
    // ...（原有的 catch 分支原样保留，包括 AIConfigError 的处理）
  }
}
```

**保留原有 catch 分支的全部行为**，包括 `AIConfigError` 返回 400 的处理。

- [ ] **Step 3: 类型检查**

Run: `pnpm type-check`
Expected: 无错误。如果报 `mapToResumeSchema is not defined` 之类，说明有函数漏搬了，回 Step 1 补上。

- [ ] **Step 4: 手动验证简历上传没坏**

Run: `pnpm dev`

在浏览器打开 dashboard，用一份真实 PDF 简历走一遍上传解析。Expected：和改动前完全一样——解析出结构化内容并创建一份新简历。**这是回归验证，不能跳过：这次重构动的是线上已有功能。**

- [ ] **Step 5: 跑全量测试**

Run: `pnpm test`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/parse-resume.ts src/app/api/resume/parse/route.ts
git commit -m "refactor(resume): 抽出简历解析能力供招聘侧复用"
```

---

### Task 7: Prompt 构建（TDD）

**Files:**
- Create: `src/lib/ai/recruit-prompts.test.ts`
- Create: `src/lib/ai/recruit-prompts.ts`

两次调用的 prompt 都在这里构建。**最关键的一点：题目数分配的结果必须原样写进 prompt。** 这是权重配置唯一的落地途径，所以要有测试盯着。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/ai/recruit-prompts.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildQuestionsPrompt, buildEvaluationPrompt } from './recruit-prompts';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const DIMENSIONS: DimensionConfig[] = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

describe('buildQuestionsPrompt', () => {
  it('把每个维度分到几题写进 prompt', () => {
    const { prompt } = buildQuestionsPrompt({
      jobTitle: '高级前端工程师',
      jobDescription: 'JD 正文',
      resumeText: '简历正文',
      dimensions: DIMENSIONS,
      questionCount: 10,
    });
    // 3:2 权重、共 10 题 -> 专业技能 6 题、逻辑思维 4 题
    expect(prompt).toContain('专业技能');
    expect(prompt).toMatch(/专业技能[^\n]*6/);
    expect(prompt).toMatch(/逻辑思维[^\n]*4/);
  });

  it('返回的 allocation 与写进 prompt 的一致，供调用方校验模型输出', () => {
    const { allocation } = buildQuestionsPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questionCount: 10,
    });
    expect(allocation).toEqual({ professional: 6, logic: 4 });
  });

  it('JD 和简历正文都进了 prompt', () => {
    const { prompt } = buildQuestionsPrompt({
      jobTitle: '后端工程师',
      jobDescription: '需要熟悉分布式事务',
      resumeText: '在某厂做过订单系统',
      dimensions: DIMENSIONS,
      questionCount: 5,
    });
    expect(prompt).toContain('需要熟悉分布式事务');
    expect(prompt).toContain('在某厂做过订单系统');
  });

  it('system prompt 要求输出纯 JSON', () => {
    const { system } = buildQuestionsPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questionCount: 5,
    });
    expect(system).toContain('JSON');
  });
});

describe('buildEvaluationPrompt', () => {
  const questions: InterviewQuestion[] = [
    {
      id: 'q1',
      dimension: 'logic',
      question: '讲一个你排查过的线上问题',
      intent: '看拆解路径',
      rubric: { excellent: '有假设有验证', pass: '能说清现象', fail: '只复述结论' },
      followUps: [],
      referencePoints: ['定位手段'],
      estimatedMinutes: 8,
      difficulty: 'medium',
    },
  ];

  it('题目的 id、题干和评分标准都进了 prompt', () => {
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: '候选人说了缓存击穿的排查过程',
    });
    expect(prompt).toContain('q1');
    expect(prompt).toContain('讲一个你排查过的线上问题');
    expect(prompt).toContain('有假设有验证');
    expect(prompt).toContain('候选人说了缓存击穿的排查过程');
  });

  it('system prompt 明确要求不给总分、且未作答的题不计入维度分', () => {
    const { system } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: 'x',
    });
    expect(system).toContain('answered');
    // 总分由服务端算，prompt 里不能让模型给 overallScore
    expect(system).not.toContain('overallScore');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm vitest run src/lib/ai/recruit-prompts.test.ts`
Expected: FAIL —— `Failed to resolve import "./recruit-prompts"`

- [ ] **Step 3: 写实现**

创建 `src/lib/ai/recruit-prompts.ts`：

```ts
import { allocateQuestions } from '@/lib/recruit/scoring';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const LANGUAGE_RULE = `IMPORTANT: Detect the primary language of the job description. You MUST respond entirely in that language. If the JD is in Chinese, all output (questions, rubrics, comments) must be in Chinese.`;

const JSON_RULE = `CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;

const QUESTIONS_SYSTEM = `You are a seasoned hiring interviewer. Given a job description, a candidate's resume, and the competencies to assess, design a personalized interview question set.

${LANGUAGE_RULE}

Rules:
- Follow the per-dimension question counts given in the user message EXACTLY. If it says 6 questions for 专业技能, produce exactly 6 questions whose "dimension" field is that dimension's key.
- Ground every question in this specific candidate's resume and this specific JD. Never produce generic questions that could be asked of anyone.
- "intent" states what the question is really probing for — not a restatement of the question.
- "rubric" describes what an excellent / passing / failing answer looks like, concretely enough that a non-expert interviewer can judge.
- "followUps" are 2-3 probing directions to prevent rehearsed answers.
- "referencePoints" are the points a strong answer should cover.
- "estimatedMinutes" is an integer; "difficulty" is one of easy / medium / hard.

Return JSON with this exact shape:
{"questions":[{"dimension":"","question":"","intent":"","rubric":{"excellent":"","pass":"","fail":""},"followUps":[],"referencePoints":[],"estimatedMinutes":5,"difficulty":"medium"}]}

${JSON_RULE}`;

const EVALUATION_SYSTEM = `You are a seasoned hiring interviewer scoring a completed interview. You are given the JD, the candidate's resume, the question set (with rubrics), and the raw interview transcript.

${LANGUAGE_RULE}

Rules:
- For each question, locate the candidate's answer in the transcript. Summarize it in "answerSummary".
- If a question was never asked or never answered, set "answered" to false and "score" to 0. Do NOT invent an answer.
- Score each question 0-100 against its rubric.
- For each dimension, give a 0-100 score based ONLY on the questions in that dimension that were actually answered. If no question in a dimension was answered, still return the dimension with score 0 — the caller will exclude it.
- Do NOT compute any aggregate or total score. The caller computes it from the dimension scores and the configured weights.
- "recommendation" is one of: strong_hire, hire, hold, no_hire. Base it on the whole picture, not just the numbers.
- "strengths" and "concerns" are concrete, evidence-backed observations from the transcript — not generic praise.

Return JSON with this exact shape:
{"questionEvaluations":[{"questionId":"","answerSummary":"","answered":true,"score":0,"highlights":[],"weaknesses":[]}],"dimensionScores":[{"key":"","score":0}],"strengths":[],"concerns":[],"overallComment":"","recommendation":"hold","recommendationReason":""}

${JSON_RULE}`;

export interface QuestionsPromptInput {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  dimensions: DimensionConfig[];
  questionCount: number;
}

export function buildQuestionsPrompt(input: QuestionsPromptInput): {
  system: string;
  prompt: string;
  allocation: Record<string, number>;
} {
  const allocation = allocateQuestions(input.dimensions, input.questionCount);

  // 逐维度写死题数——不这么做的话，用户配的权重对模型毫无约束力。
  const allocationLines = input.dimensions
    .map((d) => `- ${d.label} (key: ${d.key}): ${allocation[d.key] ?? 0} questions`)
    .join('\n');

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Competencies to assess and the exact number of questions for each:
${allocationLines}

Total questions: ${input.questionCount}

Respond with JSON only.`;

  return { system: QUESTIONS_SYSTEM, prompt, allocation };
}

export interface EvaluationPromptInput {
  jobTitle: string;
  jobDescription: string;
  resumeText: string;
  dimensions: DimensionConfig[];
  questions: InterviewQuestion[];
  transcript: string;
}

export function buildEvaluationPrompt(input: EvaluationPromptInput): {
  system: string;
  prompt: string;
} {
  const questionBlocks = input.questions
    .map(
      (q, i) => `${i + 1}. [id: ${q.id}] [dimension: ${q.dimension}]
Question: ${q.question}
What it probes: ${q.intent}
Excellent answer: ${q.rubric.excellent}
Passing answer: ${q.rubric.pass}
Failing answer: ${q.rubric.fail}
Reference points: ${q.referencePoints.join('; ')}`,
    )
    .join('\n\n');

  const dimensionLines = input.dimensions
    .map((d) => `- ${d.label} (key: ${d.key})`)
    .join('\n');

  const prompt = `Job title: ${input.jobTitle}

Job description:
${input.jobDescription}

Candidate resume:
${input.resumeText}

Dimensions to score:
${dimensionLines}

Question set:
${questionBlocks}

Interview transcript:
${input.transcript}

Respond with JSON only.`;

  return { system: EVALUATION_SYSTEM, prompt };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run src/lib/ai/recruit-prompts.test.ts`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/recruit-prompts.ts src/lib/ai/recruit-prompts.test.ts
git commit -m "feat(recruit): 生成题目与评估答案的 prompt 构建"
```

---

## Phase 3：API 层

### Task 8: 归属校验辅助 + 岗位 CRUD

**Files:**
- Create: `src/lib/recruit/access.ts`
- Create: `src/app/api/recruit/jobs/route.ts`
- Create: `src/app/api/recruit/jobs/[id]/route.ts`

候选人和评价都没有 `userId` 列，归属靠 `jobId` 上溯到岗位。这个上溯逻辑在 5 个 route 里都要用，抽成辅助函数。

- [ ] **Step 1: 创建归属校验辅助**

创建 `src/lib/recruit/access.ts`：

```ts
import { NextResponse } from 'next/server';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';

/**
 * 候选人和评价表都不存 userId，归属通过 jobId 上溯到岗位判断。
 * 五个 route 都要做这件事，所以抽出来。
 *
 * 返回 NextResponse 表示校验失败，调用方直接 return 它。
 */

export async function requireUser(request: Request) {
  const fingerprint = getUserIdFromRequest(request);
  const user = await resolveUser(fingerprint);
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

export async function requireOwnedJob(request: Request, jobId: string) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth;

  const job = await recruitRepository.findJob(jobId);
  if (!job) {
    return { error: NextResponse.json({ error: 'Job not found' }, { status: 404 }) };
  }
  if (job.userId !== auth.user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user: auth.user, job };
}

export async function requireOwnedCandidate(request: Request, candidateId: string) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth;

  const candidate = await recruitRepository.findCandidate(candidateId);
  if (!candidate) {
    return { error: NextResponse.json({ error: 'Candidate not found' }, { status: 404 }) };
  }
  const job = await recruitRepository.findJob(candidate.jobId);
  if (!job || job.userId !== auth.user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user: auth.user, job, candidate };
}
```

- [ ] **Step 2: 创建岗位列表/新建 route**

创建 `src/app/api/recruit/jobs/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { createJobInputSchema } from '@/lib/ai/recruit-schema';
import { requireUser } from '@/lib/recruit/access';

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;

  const jobs = await recruitRepository.findJobsByUserId(auth.user.id);
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const parsed = createJobInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const job = await recruitRepository.createJob({
    userId: auth.user.id,
    ...parsed.data,
  });
  return NextResponse.json({ job }, { status: 201 });
}
```

- [ ] **Step 3: 创建岗位详情/更新/删除 route**

创建 `src/app/api/recruit/jobs/[id]/route.ts`。注意 Next 16 里 `params` 是 Promise，必须 await：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { updateJobInputSchema } from '@/lib/ai/recruit-schema';
import { requireOwnedJob } from '@/lib/recruit/access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedJob(request, id);
  if ('error' in access) return access.error;

  const candidates = await recruitRepository.findCandidateSummaries(id);
  return NextResponse.json({ job: access.job, candidates });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedJob(request, id);
  if ('error' in access) return access.error;

  const body = await request.json();
  const parsed = updateJobInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const job = await recruitRepository.updateJob(id, parsed.data);
  return NextResponse.json({ job });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedJob(request, id);
  if ('error' in access) return access.error;

  await recruitRepository.deleteJob(id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: 类型检查**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 5: 手动验证**

Run: `pnpm dev`（另开终端）

```bash
# 建岗位
curl -s -X POST http://localhost:3000/api/recruit/jobs \
  -H 'content-type: application/json' \
  -H 'x-fingerprint: demo-fingerprint' \
  -d '{"title":"高级前端工程师","jobDescription":"负责核心页面开发，要求熟悉 React","dimensions":[{"key":"professional","label":"专业技能","weight":3,"custom":false},{"key":"logic","label":"逻辑思维","weight":2,"custom":false}],"questionCount":10}'
```
Expected: 201，返回 `{"job":{...}}`，`dimensions` 是数组不是字符串。

```bash
# 列出岗位
curl -s http://localhost:3000/api/recruit/jobs -H 'x-fingerprint: demo-fingerprint'
```
Expected: 200，`jobs` 里有刚建的那条。

```bash
# 校验拒绝空维度
curl -s -X POST http://localhost:3000/api/recruit/jobs \
  -H 'content-type: application/json' -H 'x-fingerprint: demo-fingerprint' \
  -d '{"title":"x","jobDescription":"y","dimensions":[],"questionCount":10}'
```
Expected: 400，`details` 里能看到「至少选择一个考察维度」。

- [ ] **Step 6: Commit**

```bash
git add src/lib/recruit/access.ts src/app/api/recruit/jobs/
git commit -m "feat(recruit): 岗位 CRUD 接口与归属校验"
```

---

### Task 9: 候选人 CRUD

**Files:**
- Create: `src/app/api/recruit/jobs/[id]/candidates/route.ts`
- Create: `src/app/api/recruit/candidates/[id]/route.ts`

- [ ] **Step 1: 创建候选人新建 route**

创建 `src/app/api/recruit/jobs/[id]/candidates/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { createCandidateInputSchema } from '@/lib/ai/recruit-schema';
import { requireOwnedJob } from '@/lib/recruit/access';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedJob(request, id);
  if ('error' in access) return access.error;

  const body = await request.json();
  const parsed = createCandidateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const candidate = await recruitRepository.createCandidate({
    jobId: id,
    name: parsed.data.name,
  });
  return NextResponse.json({ candidate }, { status: 201 });
}
```

- [ ] **Step 2: 创建候选人详情/更新/删除 route**

创建 `src/app/api/recruit/candidates/[id]/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { updateCandidateInputSchema } from '@/lib/ai/recruit-schema';
import { requireOwnedCandidate } from '@/lib/recruit/access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedCandidate(request, id);
  if ('error' in access) return access.error;

  const evaluation = await recruitRepository.findEvaluation(id);
  return NextResponse.json({
    candidate: access.candidate,
    job: access.job,
    evaluation,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedCandidate(request, id);
  if ('error' in access) return access.error;

  const body = await request.json();
  const parsed = updateCandidateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const candidate = await recruitRepository.updateCandidate(id, parsed.data as any);
  return NextResponse.json({ candidate });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedCandidate(request, id);
  if ('error' in access) return access.error;

  await recruitRepository.deleteCandidate(id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 4: 手动验证**

Run: `pnpm dev`

用 Task 8 建出来的 `<jobId>`：

```bash
curl -s -X POST http://localhost:3000/api/recruit/jobs/<jobId>/candidates \
  -H 'content-type: application/json' -H 'x-fingerprint: demo-fingerprint' \
  -d '{"name":"张三"}'
```
Expected: 201，`candidate.status` 为 `pending`。

```bash
curl -s -X PATCH http://localhost:3000/api/recruit/candidates/<candidateId> \
  -H 'content-type: application/json' -H 'x-fingerprint: demo-fingerprint' \
  -d '{"resumeText":"五年前端经验，做过低代码平台"}'
```
Expected: 200，`candidate.resumeText` 已更新。

```bash
# 换一个 fingerprint 应该拿不到别人的候选人
curl -s http://localhost:3000/api/recruit/candidates/<candidateId> -H 'x-fingerprint: someone-else'
```
Expected: 401

- [ ] **Step 5: Commit**

```bash
git add src/app/api/recruit/jobs/ src/app/api/recruit/candidates/
git commit -m "feat(recruit): 候选人 CRUD 接口"
```

---

### Task 10: 上传简历文件解析

**Files:**
- Create: `src/app/api/recruit/candidates/[id]/resume/route.ts`

复用 Task 6 抽出来的 `parseResumeFile`。解析结果只写候选人行，**不创建 resumes 记录**。

- [ ] **Step 1: 创建 route**

创建 `src/app/api/recruit/candidates/[id]/resume/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { parseResumeFile, validateResumeFile } from '@/lib/ai/parse-resume';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { requireOwnedCandidate } from '@/lib/recruit/access';
import type { ParsedResume } from '@/lib/ai/parse-schema';

/**
 * 把结构化简历压成一段文本，供后续两次 AI 调用当上下文用。
 * 直接塞 JSON 也能work，但纯文本更省 token 且模型更容易读。
 */
function flattenResume(data: ParsedResume): string {
  const parts: string[] = [];
  const p = data.personalInfo;
  if (p) {
    parts.push(`姓名：${p.fullName || ''}｜职位：${p.jobTitle || ''}｜工作年限：${p.yearsOfExperience || ''}｜学历：${p.educationLevel || ''}`);
  }
  if (data.summary) parts.push(`个人简介：${data.summary}`);

  for (const w of data.workExperience ?? []) {
    parts.push(
      `工作经历：${w.company}｜${w.position}｜${w.startDate} - ${w.current ? '至今' : w.endDate || ''}\n${w.description || ''}\n${(w.highlights ?? []).map((h) => `- ${h}`).join('\n')}`,
    );
  }
  for (const e of data.education ?? []) {
    parts.push(`教育经历：${e.institution}｜${e.degree || ''}｜${e.field || ''}｜${e.startDate} - ${e.endDate || ''}`);
  }
  for (const proj of data.projects ?? []) {
    parts.push(
      `项目：${proj.name}\n${proj.description || ''}\n技术栈：${(proj.technologies ?? []).join('、')}\n${(proj.highlights ?? []).map((h) => `- ${h}`).join('\n')}`,
    );
  }
  const skills = (data.skills ?? []).map((s) => `${s.name}：${(s.skills ?? []).join('、')}`);
  if (skills.length) parts.push(`技能：\n${skills.join('\n')}`);

  return parts.join('\n\n');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedCandidate(request, id);
    if ('error' in access) return access.error;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const invalid = validateResumeFile(file);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const aiConfig = extractAIConfig(request);
    const resumeData = await parseResumeFile(file, aiConfig);
    const resumeText = flattenResume(resumeData);

    const candidate = await recruitRepository.updateCandidate(id, {
      resumeData,
      resumeText,
      // 简历换了，之前生成的题目就过期了
      questions: null,
      status: 'pending',
      // 候选人还没起过名字时，用简历里的姓名兜底
      ...(access.candidate.name ? {} : { name: resumeData.personalInfo?.fullName || '' }),
    });

    return NextResponse.json({ candidate });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] resume parse failed:', error);
    return NextResponse.json({ error: 'Failed to parse resume' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm type-check`
Expected: 无错误。若 `ParsedResume` 的字段名对不上（比如 `workExperience` 里没有 `description`），打开 `src/lib/ai/parse-schema.ts` 按实际字段调整 `flattenResume`。

- [ ] **Step 3: 手动验证**

Run: `pnpm dev`

在 Settings 里配好 AI provider 和 API key（这个接口要真实调模型），然后：

```bash
curl -s -X POST http://localhost:3000/api/recruit/candidates/<candidateId>/resume \
  -H 'x-fingerprint: demo-fingerprint' \
  -H 'x-provider: openai' -H 'x-api-key: <你的key>' \
  -H 'x-base-url: https://api.openai.com/v1' -H 'x-model: gpt-4o' \
  -F 'file=@/path/to/resume.pdf'
```
Expected: 200，`candidate.resumeText` 是一段可读的中文简历摘要，`candidate.resumeData` 是结构化对象。

另外确认：`GET /api/resume` 的简历列表里**没有**因此多出一条记录。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recruit/candidates/
git commit -m "feat(recruit): 候选人简历上传解析接口"
```

---

### Task 11: 生成面试题接口

**Files:**
- Create: `src/app/api/recruit/candidates/[id]/questions/route.ts`

- [ ] **Step 1: 创建 route**

创建 `src/app/api/recruit/candidates/[id]/questions/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { extractJson } from '@/lib/ai/extract-json';
import { questionsOutputSchema } from '@/lib/ai/recruit-schema';
import { buildQuestionsPrompt } from '@/lib/ai/recruit-prompts';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { requireOwnedCandidate } from '@/lib/recruit/access';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedCandidate(request, id);
    if ('error' in access) return access.error;

    const { candidate, job } = access;

    if (!candidate.resumeText) {
      return NextResponse.json(
        { error: 'Candidate resume is required before generating questions' },
        { status: 400 },
      );
    }

    // 候选人可覆盖岗位的维度配置；没覆盖就用岗位的。
    const dimensions = ((candidate.dimensionsOverride as DimensionConfig[] | null) ??
      (job.dimensions as DimensionConfig[])) as DimensionConfig[];

    if (!dimensions?.length) {
      return NextResponse.json({ error: 'No dimensions configured' }, { status: 400 });
    }

    const { system, prompt } = buildQuestionsPrompt({
      jobTitle: job.title,
      jobDescription: job.jobDescription,
      resumeText: candidate.resumeText,
      dimensions,
      questionCount: job.questionCount,
    });

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 16384,
      system,
      prompt,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    const parsed = extractJson(result.text, questionsOutputSchema);

    // id 由服务端生成——模型返回的 id 可能重复或缺失，而后面的评估要靠它对齐题目。
    const knownKeys = new Set(dimensions.map((d) => d.key));
    const questions: InterviewQuestion[] = parsed.questions.map((q) => ({
      id: crypto.randomUUID(),
      // 模型偶尔会把 label 当 key 返回，落不到已知维度上就归到第一个维度，
      // 免得这道题在后面的维度打分里变成孤儿。
      dimension: knownKeys.has(q.dimension) ? q.dimension : dimensions[0].key,
      question: q.question,
      intent: q.intent,
      rubric: q.rubric,
      followUps: q.followUps,
      referencePoints: q.referencePoints,
      estimatedMinutes: q.estimatedMinutes,
      difficulty: q.difficulty,
    }));

    const updated = await recruitRepository.updateCandidate(id, {
      questions,
      status: 'questions_ready',
    });

    return NextResponse.json({ candidate: updated });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] question generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 3: 手动验证**

Run: `pnpm dev`

```bash
curl -s -X POST http://localhost:3000/api/recruit/candidates/<candidateId>/questions \
  -H 'x-fingerprint: demo-fingerprint' \
  -H 'x-provider: openai' -H 'x-api-key: <你的key>' \
  -H 'x-base-url: https://api.openai.com/v1' -H 'x-model: gpt-4o'
```

Expected: 200。逐条检查：
- `candidate.questions` 长度等于岗位的 `questionCount`
- 各维度题数与权重成比例（3:2 权重、10 题 → 6 题 + 4 题）
- 每道题的 `dimension` 都落在已配置的 key 里
- 题目内容确实提到了简历里的具体经历，不是通用八股题
- `rubric` 三档都有内容
- `status` 变成 `questions_ready`

**如果各维度题数不符合权重，说明 prompt 的约束没生效**，检查 `buildQuestionsPrompt` 有没有把分配结果写进去。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recruit/candidates/
git commit -m "feat(recruit): 生成面试题接口"
```

---

### Task 12: 生成评价接口

**Files:**
- Create: `src/app/api/recruit/candidates/[id]/evaluation/route.ts`

这是全模块逻辑最密的一处：模型只给维度分和逐题点评，**加权总分由服务端算**，且**没被问到的维度权重置 0 排除在总分外**。

- [ ] **Step 1: 创建 route**

创建 `src/app/api/recruit/candidates/[id]/evaluation/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { extractJson } from '@/lib/ai/extract-json';
import { evaluationOutputSchema } from '@/lib/ai/recruit-schema';
import { buildEvaluationPrompt } from '@/lib/ai/recruit-prompts';
import { computeOverallScore } from '@/lib/recruit/scoring';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { requireOwnedCandidate } from '@/lib/recruit/access';
import type {
  DimensionConfig,
  DimensionScore,
  InterviewQuestion,
  QuestionEvaluation,
} from '@/types/recruit';

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireOwnedCandidate(request, id);
    if ('error' in access) return access.error;

    const { candidate, job } = access;
    const questions = (candidate.questions as InterviewQuestion[] | null) ?? [];

    if (!questions.length) {
      return NextResponse.json({ error: 'Generate questions first' }, { status: 400 });
    }
    if (!candidate.transcript?.trim()) {
      return NextResponse.json({ error: 'Interview transcript is required' }, { status: 400 });
    }

    const dimensions = ((candidate.dimensionsOverride as DimensionConfig[] | null) ??
      (job.dimensions as DimensionConfig[])) as DimensionConfig[];

    const { system, prompt } = buildEvaluationPrompt({
      jobTitle: job.title,
      jobDescription: job.jobDescription,
      resumeText: candidate.resumeText,
      dimensions,
      questions,
      transcript: candidate.transcript,
    });

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 16384,
      system,
      prompt,
      providerOptions: getJsonProviderOptions(aiConfig),
    });

    const parsed = extractJson(result.text, evaluationOutputSchema);

    // 把模型的逐题评估对齐回真实题目。模型可能漏题或编造 questionId，
    // 以我们自己的题目列表为准。
    const byId = new Map(parsed.questionEvaluations.map((e) => [e.questionId, e]));
    const questionEvaluations: QuestionEvaluation[] = questions.map((q) => {
      const e = byId.get(q.id);
      return {
        questionId: q.id,
        question: q.question,
        answerSummary: e?.answerSummary ?? '',
        answered: e?.answered ?? false,
        score: e?.answered ? e.score : 0,
        highlights: e?.highlights ?? [],
        weaknesses: e?.weaknesses ?? [],
      };
    });

    // 某个维度一道题都没答的话，把它的权重置 0——computeOverallScore 会把
    // weight <= 0 的维度排除掉，这样没问到的维度不会把总分拉低。
    const answeredDimensions = new Set(
      questionEvaluations
        .filter((e) => e.answered)
        .map((e) => questions.find((q) => q.id === e.questionId)?.dimension)
        .filter(Boolean) as string[],
    );

    const scoreByKey = new Map(parsed.dimensionScores.map((d) => [d.key, d.score]));
    const dimensionScores: DimensionScore[] = dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      score: answeredDimensions.has(d.key) ? (scoreByKey.get(d.key) ?? 0) : 0,
      weight: answeredDimensions.has(d.key) ? d.weight : 0,
    }));

    const overallScore = computeOverallScore(dimensionScores);

    const evaluation = await recruitRepository.upsertEvaluation({
      candidateId: id,
      overallScore,
      dimensionScores,
      questionEvaluations,
      recommendation: parsed.recommendation,
      recommendationReason: parsed.recommendationReason,
      strengths: parsed.strengths,
      concerns: parsed.concerns,
      overallComment: parsed.overallComment,
    });

    await recruitRepository.updateCandidate(id, { status: 'evaluated' });

    return NextResponse.json({ evaluation });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[recruit] evaluation failed:', error);
    return NextResponse.json({ error: 'Failed to generate evaluation' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm type-check`
Expected: 无错误

- [ ] **Step 3: 手动验证 —— 正常路径**

Run: `pnpm dev`

先写入一段面试记录：

```bash
curl -s -X PATCH http://localhost:3000/api/recruit/candidates/<candidateId> \
  -H 'content-type: application/json' -H 'x-fingerprint: demo-fingerprint' \
  -d '{"transcript":"问：讲一个你排查过的线上问题。答：去年双十一订单页白屏，我先看监控发现是接口 500，然后翻日志定位到缓存击穿，加了互斥锁后恢复，P99 从 3s 降到 200ms。\n问：为什么先怀疑缓存？答：因为流量峰值和错误率曲线完全重合。"}'
```

再生成评价：

```bash
curl -s -X POST http://localhost:3000/api/recruit/candidates/<candidateId>/evaluation \
  -H 'x-fingerprint: demo-fingerprint' \
  -H 'x-provider: openai' -H 'x-api-key: <你的key>' \
  -H 'x-base-url: https://api.openai.com/v1' -H 'x-model: gpt-4o'
```

Expected: 200。逐条检查：
- `questionEvaluations` 的条数等于题目数（一道不多一道不少）
- 记录里覆盖到的题 `answered: true` 且有 `answerSummary`；没覆盖到的题 `answered: false`、`score: 0`
- `dimensionScores` 里没被问到的维度 `weight` 是 0
- `overallScore` 手动按权重验算一遍能对上
- `recommendation` 是四档之一

- [ ] **Step 4: 手动验证 —— 部分维度未作答**

用只覆盖单一维度的短记录再跑一次（比如只回答了逻辑思维的题）。

Expected: 未作答维度的 `weight` 为 0，`overallScore` 只由已作答维度决定——**总分不应该因为「没问到」而被拉低**。这是这个接口最容易写错的地方。

- [ ] **Step 5: 手动验证 —— 重复生成不产生第二条**

再跑一次 Step 3 的命令。

Expected: 200，且

```bash
curl -s http://localhost:3000/api/recruit/candidates/<candidateId> -H 'x-fingerprint: demo-fingerprint'
```
返回的 `evaluation` 是最新那份，不报 unique 约束冲突。

- [ ] **Step 6: Commit**

```bash
git add src/app/api/recruit/candidates/
git commit -m "feat(recruit): 生成面试评价接口"
```

---

## Phase 4：UI 层

> 本仓库没有 jsdom / testing-library，测试环境是 node。**UI 任务一律手动验证，不要为了测组件去装新依赖。**

### Task 13: i18n 文案与导航入口

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `src/components/layout/header.tsx`

先把文案铺好，后面的组件才有 key 可用。

- [ ] **Step 1: 在 messages/zh.json 顶层加 recruit 命名空间**

在 `messages/zh.json` 的顶层对象里（与 `interview` 平级）加入：

```json
"recruit": {
  "nav": "招聘",
  "title": "招聘岗位",
  "subtitle": "上传 JD 与简历，生成面试题，面完打分",
  "empty": "还没有岗位，先创建一个",
  "createJob": "新建岗位",
  "editJob": "编辑岗位",
  "deleteJob": "删除岗位",
  "deleteJobConfirm": "删除岗位会一并删除它下面的所有候选人和评价，无法恢复。确定继续吗？",
  "jobTitle": "岗位名称",
  "jobTitlePlaceholder": "如：高级前端工程师",
  "jobDescription": "职位描述（JD）",
  "jobDescriptionPlaceholder": "粘贴完整的 JD",
  "questionCount": "生成题目数量",
  "candidateCount": "{count} 位候选人",
  "save": "保存",
  "cancel": "取消",
  "dimensions": {
    "title": "考察维度",
    "hint": "权重决定该维度出几道题，以及在总分里占多大比例",
    "addCustom": "添加自定义维度",
    "customPlaceholder": "维度名称",
    "weight": "权重",
    "perDimension": "{count} 题",
    "atLeastOne": "至少选择一个考察维度",
    "duplicate": "维度名称不能重复",
    "stress": "抗压能力",
    "logic": "逻辑思维",
    "communication": "沟通表达",
    "professional": "专业技能",
    "teamwork": "团队协作",
    "learning": "学习能力",
    "motivation": "稳定性与动机",
    "leadership": "领导力"
  },
  "candidates": {
    "title": "候选人",
    "add": "添加候选人",
    "name": "姓名",
    "namePlaceholder": "候选人姓名",
    "empty": "还没有候选人",
    "status": "状态",
    "score": "总分",
    "recommendation": "结论",
    "notEvaluated": "未评价",
    "delete": "删除候选人",
    "deleteConfirm": "删除后该候选人的题目和评价都会消失，确定吗？"
  },
  "status": {
    "pending": "待准备",
    "questions_ready": "题目已生成",
    "evaluated": "已评价"
  },
  "recommendation": {
    "strong_hire": "强烈推荐",
    "hire": "推荐录用",
    "hold": "待定",
    "no_hire": "不推荐"
  },
  "tabs": {
    "resume": "简历",
    "questions": "面试题",
    "evaluation": "评价"
  },
  "resume": {
    "upload": "上传简历文件",
    "uploadHint": "支持 PDF、PNG、JPG、WebP，最大 10MB",
    "parsing": "正在解析简历…",
    "paste": "或直接粘贴简历文本",
    "pastePlaceholder": "粘贴候选人简历内容",
    "savePaste": "保存简历文本",
    "empty": "还没有简历，上传文件或粘贴文本",
    "parsed": "已解析的简历"
  },
  "questions": {
    "generate": "生成面试题",
    "regenerate": "重新生成",
    "generating": "正在生成面试题，约需 30-60 秒…",
    "needResume": "请先上传或粘贴候选人简历",
    "empty": "还没有生成面试题",
    "copyAll": "复制全部题目",
    "copied": "已复制到剪贴板",
    "remove": "删除此题",
    "intent": "考察点",
    "rubric": "评分标准",
    "excellent": "优秀",
    "pass": "合格",
    "fail": "不合格",
    "followUps": "追问建议",
    "referencePoints": "参考答案要点",
    "minutes": "{count} 分钟",
    "regenerateConfirm": "重新生成会覆盖现有全部题目，确定吗？"
  },
  "evaluation": {
    "transcript": "面试记录",
    "transcriptPlaceholder": "把整场面试的问答记录粘贴到这里，AI 会自动对应到各道题目并打分",
    "transcriptHint": "不需要逐题整理，速记或完整记录都可以",
    "generate": "生成评价",
    "regenerate": "重新评价",
    "generating": "正在分析面试记录，约需 30-60 秒…",
    "needQuestions": "请先生成面试题",
    "needTranscript": "请先粘贴面试记录",
    "empty": "还没有评价",
    "overallScore": "综合得分",
    "dimensionScores": "维度得分",
    "questionReview": "逐题点评",
    "answerSummary": "回答摘要",
    "notAnswered": "本题未作答",
    "highlights": "亮点",
    "weaknesses": "不足",
    "strengths": "优势",
    "concerns": "顾虑",
    "overallComment": "整体评价",
    "recommendationReason": "结论理由",
    "regenerateConfirm": "重新评价会覆盖现有评价，确定吗？"
  },
  "errors": {
    "loadFailed": "加载失败",
    "saveFailed": "保存失败",
    "generateFailed": "生成失败，请检查 AI 配置后重试",
    "parseFailed": "简历解析失败，请换一份文件或改用粘贴文本"
  }
}
```

- [ ] **Step 2: 在 messages/en.json 加对应英文**

在 `messages/en.json` 顶层加入结构完全一致的 `recruit` 块：

```json
"recruit": {
  "nav": "Hiring",
  "title": "Open roles",
  "subtitle": "Upload a JD and resumes, generate questions, score the interview",
  "empty": "No roles yet — create one to get started",
  "createJob": "New role",
  "editJob": "Edit role",
  "deleteJob": "Delete role",
  "deleteJobConfirm": "Deleting this role also deletes every candidate and evaluation under it. This cannot be undone. Continue?",
  "jobTitle": "Role title",
  "jobTitlePlaceholder": "e.g. Senior Frontend Engineer",
  "jobDescription": "Job description",
  "jobDescriptionPlaceholder": "Paste the full JD",
  "questionCount": "Number of questions",
  "candidateCount": "{count} candidates",
  "save": "Save",
  "cancel": "Cancel",
  "dimensions": {
    "title": "Competencies to assess",
    "hint": "Weight decides how many questions a competency gets and how much it counts toward the total",
    "addCustom": "Add custom competency",
    "customPlaceholder": "Competency name",
    "weight": "Weight",
    "perDimension": "{count} q",
    "atLeastOne": "Select at least one competency",
    "duplicate": "Competency names must be unique",
    "stress": "Stress tolerance",
    "logic": "Logical thinking",
    "communication": "Communication",
    "professional": "Professional skills",
    "teamwork": "Teamwork",
    "learning": "Learning ability",
    "motivation": "Motivation & stability",
    "leadership": "Leadership"
  },
  "candidates": {
    "title": "Candidates",
    "add": "Add candidate",
    "name": "Name",
    "namePlaceholder": "Candidate name",
    "empty": "No candidates yet",
    "status": "Status",
    "score": "Score",
    "recommendation": "Verdict",
    "notEvaluated": "Not evaluated",
    "delete": "Delete candidate",
    "deleteConfirm": "This removes the candidate's questions and evaluation. Continue?"
  },
  "status": {
    "pending": "Preparing",
    "questions_ready": "Questions ready",
    "evaluated": "Evaluated"
  },
  "recommendation": {
    "strong_hire": "Strong hire",
    "hire": "Hire",
    "hold": "Hold",
    "no_hire": "No hire"
  },
  "tabs": {
    "resume": "Resume",
    "questions": "Questions",
    "evaluation": "Evaluation"
  },
  "resume": {
    "upload": "Upload resume file",
    "uploadHint": "PDF, PNG, JPG or WebP, up to 10MB",
    "parsing": "Parsing resume…",
    "paste": "Or paste the resume text",
    "pastePlaceholder": "Paste the candidate's resume",
    "savePaste": "Save resume text",
    "empty": "No resume yet — upload a file or paste text",
    "parsed": "Parsed resume"
  },
  "questions": {
    "generate": "Generate questions",
    "regenerate": "Regenerate",
    "generating": "Generating questions, this takes 30-60 seconds…",
    "needResume": "Add the candidate's resume first",
    "empty": "No questions generated yet",
    "copyAll": "Copy all questions",
    "copied": "Copied to clipboard",
    "remove": "Remove question",
    "intent": "What it probes",
    "rubric": "Scoring rubric",
    "excellent": "Excellent",
    "pass": "Pass",
    "fail": "Fail",
    "followUps": "Follow-up probes",
    "referencePoints": "Reference points",
    "minutes": "{count} min",
    "regenerateConfirm": "Regenerating replaces all current questions. Continue?"
  },
  "evaluation": {
    "transcript": "Interview transcript",
    "transcriptPlaceholder": "Paste the whole interview here — AI will map answers to questions and score them",
    "transcriptHint": "No need to organize by question; rough notes work",
    "generate": "Generate evaluation",
    "regenerate": "Re-evaluate",
    "generating": "Analyzing the transcript, this takes 30-60 seconds…",
    "needQuestions": "Generate the questions first",
    "needTranscript": "Paste the interview transcript first",
    "empty": "No evaluation yet",
    "overallScore": "Overall score",
    "dimensionScores": "Competency scores",
    "questionReview": "Question-by-question",
    "answerSummary": "Answer summary",
    "notAnswered": "Not answered",
    "highlights": "Highlights",
    "weaknesses": "Gaps",
    "strengths": "Strengths",
    "concerns": "Concerns",
    "overallComment": "Overall assessment",
    "recommendationReason": "Rationale",
    "regenerateConfirm": "Re-evaluating replaces the current evaluation. Continue?"
  },
  "errors": {
    "loadFailed": "Failed to load",
    "saveFailed": "Failed to save",
    "generateFailed": "Generation failed — check your AI settings and retry",
    "parseFailed": "Could not parse the resume — try another file or paste the text"
  }
}
```

- [ ] **Step 3: 加导航入口**

`src/components/layout/header.tsx` 的 `NAV_ITEMS` 数组，在 `/interview` 那条后面追加一条：

```ts
const NAV_ITEMS: { href: string; i18nKey: string; match: string; tourId?: string }[] = [
  { href: '/dashboard', i18nKey: 'dashboard.nav', match: '/dashboard' },
  { href: '/templates', i18nKey: 'templates.nav', match: '/templates', tourId: 'dash-templates' },
  { href: '/interview', i18nKey: 'interview.nav', match: '/interview' },
  { href: '/recruit', i18nKey: 'recruit.nav', match: '/recruit' },
];
```

- [ ] **Step 4: 验证 JSON 没写坏**

Run:
```bash
node -e "const z=require('./messages/zh.json'),e=require('./messages/en.json');const k=o=>Object.keys(o).sort().join(',');console.log('zh recruit keys:',k(z.recruit));console.log('en recruit keys:',k(e.recruit));console.log('match:',k(z.recruit)===k(e.recruit))"
```
Expected: 最后一行 `match: true`。**两个文件的 key 必须完全一致**，否则切到英文会看到裸 key。

- [ ] **Step 5: 手动验证导航**

Run: `pnpm dev`，打开 dashboard。

Expected: 顶部导航多出「招聘」；点进去会 404（页面还没建，这是预期的）。切到英文显示 "Hiring"。

- [ ] **Step 6: Commit**

```bash
git add messages/ src/components/layout/header.tsx
git commit -m "feat(recruit): 招聘模块文案与导航入口"
```

---

### Task 14: 维度编辑器组件

**Files:**
- Create: `src/components/recruit/dimension-editor.tsx`

这个组件同时被「新建岗位」和「岗位详情」用，先做它。

- [ ] **Step 1: 创建组件**

创建 `src/components/recruit/dimension-editor.tsx`：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { X, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { PRESET_DIMENSION_KEYS } from '@/lib/recruit/dimensions';
import { allocateQuestions } from '@/lib/recruit/scoring';
import type { DimensionConfig } from '@/types/recruit';

interface DimensionEditorProps {
  value: DimensionConfig[];
  onChange: (next: DimensionConfig[]) => void;
  /** 传入后每个维度会显示「本维度出几题」，让权重的效果肉眼可见 */
  questionCount?: number;
}

export function DimensionEditor({ value, onChange, questionCount }: DimensionEditorProps) {
  const t = useTranslations('recruit.dimensions');
  const [customName, setCustomName] = useState('');

  const selectedByKey = new Map(value.map((d) => [d.key, d]));
  const allocation = questionCount ? allocateQuestions(value, questionCount) : null;

  function togglePreset(key: string, on: boolean) {
    if (on) {
      onChange([...value, { key, label: t(key), weight: 2, custom: false }]);
    } else {
      onChange(value.filter((d) => d.key !== key));
    }
  }

  function setWeight(key: string, weight: number) {
    onChange(value.map((d) => (d.key === key ? { ...d, weight } : d)));
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    // 自定义维度的 key 用名字本身，好在 prompt 和打分结果里对得上。
    if (selectedByKey.has(name)) return;
    onChange([...value, { key: name, label: name, weight: 2, custom: true }]);
    setCustomName('');
  }

  function removeCustom(key: string) {
    onChange(value.filter((d) => d.key !== key));
  }

  const customDimensions = value.filter((d) => d.custom);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('title')}</Label>
        <p className="mt-1 text-xs text-zinc-500">{t('hint')}</p>
      </div>

      <div className="space-y-3">
        {PRESET_DIMENSION_KEYS.map((key) => {
          const selected = selectedByKey.get(key);
          return (
            <div key={key} className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                checked={Boolean(selected)}
                onCheckedChange={(on) => togglePreset(key, on)}
              />
              <span className="w-24 shrink-0 text-sm">{t(key)}</span>
              {selected && (
                <>
                  <Slider
                    className="flex-1"
                    min={1}
                    max={5}
                    step={1}
                    value={[selected.weight]}
                    onValueChange={([w]) => setWeight(key, w)}
                  />
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-500">
                    {selected.weight}
                  </span>
                  {allocation && (
                    <span className="w-14 shrink-0 text-right text-xs text-zinc-400">
                      {t('perDimension', { count: allocation[key] ?? 0 })}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}

        {customDimensions.map((d) => (
          <div key={d.key} className="flex items-center gap-3 rounded-md border border-dashed p-3">
            <span className="w-24 shrink-0 truncate text-sm">{d.label}</span>
            <Slider
              className="flex-1"
              min={1}
              max={5}
              step={1}
              value={[d.weight]}
              onValueChange={([w]) => setWeight(d.key, w)}
            />
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-500">
              {d.weight}
            </span>
            {allocation && (
              <span className="w-14 shrink-0 text-right text-xs text-zinc-400">
                {t('perDimension', { count: allocation[d.key] ?? 0 })}
              </span>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => removeCustom(d.key)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder={t('customPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addCustom}>
          <Plus className="mr-1 h-4 w-4" />
          {t('addCustom')}
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-red-500">{t('atLeastOne')}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm type-check`
Expected: 无错误。若 `Button` 没有 `icon-sm` size，打开 `src/components/ui/button.tsx` 看实际支持的 size 值并替换。

- [ ] **Step 3: Commit**

```bash
git add src/components/recruit/dimension-editor.tsx
git commit -m "feat(recruit): 考察维度权重编辑器"
```

---

### Task 15: 岗位列表页与新建岗位

**Files:**
- Create: `src/app/[locale]/recruit/layout.tsx`
- Create: `src/app/[locale]/recruit/page.tsx`
- Create: `src/components/recruit/job-form-dialog.tsx`
- Create: `src/components/recruit/job-list.tsx`

- [ ] **Step 1: 创建 layout**

创建 `src/app/[locale]/recruit/layout.tsx`（与 `src/app/[locale]/interview/layout.tsx` 保持一致）：

```tsx
import { Header } from '@/components/layout/header';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export default function RecruitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <SettingsDialog />
    </div>
  );
}
```

- [ ] **Step 2: 创建岗位表单对话框**

创建 `src/components/recruit/job-form-dialog.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { DimensionEditor } from './dimension-editor';
import { defaultDimensions } from '@/lib/recruit/dimensions';
import { useFingerprint } from '@/hooks/use-fingerprint';
import {
  QUESTION_COUNT_DEFAULT,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  type DimensionConfig,
  type RecruitJob,
} from '@/types/recruit';

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入表示编辑，不传表示新建 */
  job?: RecruitJob | null;
  onSaved: (job: RecruitJob) => void;
}

export function JobFormDialog({ open, onOpenChange, job, onSaved }: JobFormDialogProps) {
  const t = useTranslations('recruit');
  const tDim = useTranslations('recruit.dimensions');
  const { fingerprint } = useFingerprint();

  const [title, setTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [questionCount, setQuestionCount] = useState(QUESTION_COUNT_DEFAULT);
  const [dimensions, setDimensions] = useState<DimensionConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // 每次打开都重置成当前岗位的值——不这么做的话，编辑完 A 再打开 B 会看到 A 的内容。
  useEffect(() => {
    if (!open) return;
    setTitle(job?.title ?? '');
    setJobDescription(job?.jobDescription ?? '');
    setQuestionCount(job?.questionCount ?? QUESTION_COUNT_DEFAULT);
    setDimensions(job?.dimensions ?? defaultDimensions((key) => tDim(key)));
  }, [open, job, tDim]);

  const canSave = title.trim() && jobDescription.trim() && dimensions.length > 0 && !saving;

  async function handleSave() {
    setSaving(true);
    try {
      const url = job ? `/api/recruit/jobs/${job.id}` : '/api/recruit/jobs';
      const res = await fetch(url, {
        method: job ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ title, jobDescription, dimensions, questionCount }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onSaved(data.job);
      onOpenChange(false);
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job ? t('editJob') : t('createJob')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="job-title">{t('jobTitle')}</Label>
            <Input
              id="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('jobTitlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-jd">{t('jobDescription')}</Label>
            <Textarea
              id="job-jd"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder={t('jobDescriptionPlaceholder')}
              rows={8}
            />
          </div>

          <div className="space-y-2">
            <Label>
              {t('questionCount')}：{questionCount}
            </Label>
            <Slider
              min={QUESTION_COUNT_MIN}
              max={QUESTION_COUNT_MAX}
              step={1}
              value={[questionCount]}
              onValueChange={([v]) => setQuestionCount(v)}
            />
          </div>

          <DimensionEditor
            value={dimensions}
            onChange={setDimensions}
            questionCount={questionCount}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: 创建岗位列表组件**

创建 `src/components/recruit/job-list.tsx`：

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { JobFormDialog } from './job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitJob } from '@/types/recruit';

export function JobList() {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [jobs, setJobs] = useState<RecruitJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/recruit/jobs', {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJobs(data.jobs);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('createJob')}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Briefcase className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500">{t('empty')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/recruit/${job.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-brand">
                <h3 className="truncate font-medium">{job.title}</h3>
                <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{job.jobDescription}</p>
                <p className="mt-4 text-xs text-zinc-400">
                  {new Date(job.createdAt).toLocaleDateString()}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <JobFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(job) => setJobs((prev) => [job, ...prev])}
      />
    </div>
  );
}
```

- [ ] **Step 4: 创建页面**

创建 `src/app/[locale]/recruit/page.tsx`：

```tsx
'use client';

import { JobList } from '@/components/recruit/job-list';

export default function RecruitPage() {
  return <JobList />;
}
```

- [ ] **Step 5: 类型检查 + lint**

Run: `pnpm type-check` —— 必须零错误。

再跑 `pnpm lint`。**注意：本仓库 lint 基线就是失败的**（main 上 1340 个问题，绝大多数是 `@typescript-eslint/no-explicit-any`）。判断标准不是「零错误」，而是**你新增的文件里不出现除 `no-explicit-any` 之外的新规则违规**（`no-explicit-any` 与 `interview.repository.ts` / `resume.repository.ts` 等既有文件同款，属于仓库既定风格）。有其他类型的新错误就修掉。

- [ ] **Step 6: 手动验证**

Run: `pnpm dev`，打开 `http://localhost:3000/zh/recruit`

Expected：
- 空状态显示「还没有岗位，先创建一个」
- 点「新建岗位」，对话框里默认勾选专业技能(3)/逻辑思维(2)/沟通表达(2)，题目数默认 10
- 每个维度右侧显示分到的题数，**拖动权重滑块时题数实时变化，且总和始终等于题目数**
- 添加一个自定义维度「行业理解」，它出现在虚线框里且能删
- 填好 JD 保存后，卡片出现在列表里；刷新页面还在

- [ ] **Step 7: Commit**

```bash
git add src/app/\[locale\]/recruit/ src/components/recruit/
git commit -m "feat(recruit): 岗位列表页与新建岗位"
```

---

### Task 16: 岗位详情页与候选人列表

**Files:**
- Create: `src/components/recruit/candidate-table.tsx`
- Create: `src/app/[locale]/recruit/[jobId]/page.tsx`

- [ ] **Step 1: 创建候选人表格组件**

创建 `src/components/recruit/candidate-table.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { CandidateSummary, Recommendation } from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface CandidateTableProps {
  jobId: string;
  candidates: CandidateSummary[];
  onDeleted: (candidateId: string) => void;
}

export function CandidateTable({ jobId, candidates, onDeleted }: CandidateTableProps) {
  const t = useTranslations('recruit');
  const { fingerprint } = useFingerprint();
  const [sortByScore, setSortByScore] = useState(true);

  // 未评价的排最后：没分数的人挤在有分数的人中间，横向对比就没法看了。
  const sorted = sortByScore
    ? [...candidates].sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))
    : candidates;

  async function handleDelete(candidateId: string) {
    if (!confirm(t('candidates.deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
        method: 'DELETE',
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('delete failed');
      onDeleted(candidateId);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  if (candidates.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-zinc-500">{t('candidates.empty')}</Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-3 font-medium">{t('candidates.name')}</th>
            <th className="px-4 py-3 font-medium">{t('candidates.status')}</th>
            <th className="px-4 py-3 font-medium">
              <button
                className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
                onClick={() => setSortByScore((v) => !v)}
              >
                {t('candidates.score')}
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className="px-4 py-3 font-medium">{t('candidates.recommendation')}</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/recruit/${jobId}/c/${c.id}`}
                  className="font-medium hover:text-brand"
                >
                  {c.name || '—'}
                </Link>
              </td>
              <td className="px-4 py-3 text-zinc-500">{t(`status.${c.status}`)}</td>
              <td className="px-4 py-3 tabular-nums">
                {c.overallScore ?? <span className="text-zinc-400">—</span>}
              </td>
              <td className="px-4 py-3">
                {c.recommendation ? (
                  <Badge className={RECOMMENDATION_STYLE[c.recommendation]}>
                    {t(`recommendation.${c.recommendation}`)}
                  </Badge>
                ) : (
                  <span className="text-xs text-zinc-400">{t('candidates.notEvaluated')}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-4 w-4 text-zinc-400" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
```

- [ ] **Step 2: 创建岗位详情页**

创建 `src/app/[locale]/recruit/[jobId]/page.tsx`：

```tsx
'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CandidateTable } from '@/components/recruit/candidate-table';
import { JobFormDialog } from '@/components/recruit/job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { CandidateSummary, RecruitJob } from '@/types/recruit';

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const t = useTranslations('recruit');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJob(data.job);
      setCandidates(data.candidates);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [jobId, fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  async function handleAddCandidate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/candidates`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('create failed');
      const data = await res.json();
      setNewName('');
      setAddOpen(false);
      router.push(`/recruit/${jobId}/c/${data.candidate.id}`);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  async function handleDeleteJob() {
    if (!confirm(t('deleteJobConfirm'))) return;
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}`, {
        method: 'DELETE',
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('delete failed');
      router.push('/recruit');
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  if (loading) return <Skeleton className="h-64" />;
  if (!job) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t('candidateCount', { count: candidates.length })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" />
            {t('editJob')}
          </Button>
          <Button variant="outline" onClick={handleDeleteJob}>
            <Trash2 className="mr-1 h-4 w-4" />
            {t('deleteJob')}
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-medium">{t('jobDescription')}</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
          {job.jobDescription}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {job.dimensions.map((d) => (
            <span
              key={d.key}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800"
            >
              {d.label} × {d.weight}
            </span>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t('candidates.title')}</h2>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('candidates.add')}
        </Button>
      </div>

      <CandidateTable
        jobId={jobId}
        candidates={candidates}
        onDeleted={(id) => setCandidates((prev) => prev.filter((c) => c.id !== id))}
      />

      <JobFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        job={job}
        onSaved={(updated) => setJob(updated)}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('candidates.add')}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('candidates.namePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddCandidate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleAddCandidate} disabled={!newName.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查 + lint**

Run: `pnpm type-check` —— 必须零错误。

再跑 `pnpm lint`。**注意：本仓库 lint 基线就是失败的**（main 上 1340 个问题，绝大多数是 `@typescript-eslint/no-explicit-any`）。判断标准不是「零错误」，而是**你新增的文件里不出现除 `no-explicit-any` 之外的新规则违规**（`no-explicit-any` 与 `interview.repository.ts` / `resume.repository.ts` 等既有文件同款，属于仓库既定风格）。有其他类型的新错误就修掉。

- [ ] **Step 4: 手动验证**

Run: `pnpm dev`

Expected：
- 从岗位列表点进详情，看到 JD 全文和维度标签（形如「专业技能 × 3」）
- 「添加候选人」填名字保存后，跳到工作台路由（页面还没建，404 是预期的——下一个任务补）
- 手动回到详情页，候选人出现在表格里，状态「待准备」，分数列是「—」
- 点「编辑岗位」能改 JD 和维度，保存后页面上的标签同步更新
- 点表头的「总分」能切换排序（此时都没分数，看不出变化，Task 19 之后再复验）

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/recruit/ src/components/recruit/
git commit -m "feat(recruit): 岗位详情页与候选人列表"
```

---

### Task 17: 候选人工作台骨架与简历 Tab

**Files:**
- Create: `src/components/recruit/resume-panel.tsx`
- Create: `src/components/recruit/candidate-workspace.tsx`
- Create: `src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx`

工作台的三个 Tab 共享同一份候选人数据。数据和刷新函数放在 `candidate-workspace.tsx`，三个 panel 只管展示和触发。

- [ ] **Step 1: 创建简历 Tab**

创建 `src/components/recruit/resume-panel.tsx`：

```tsx
'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import type { RecruitCandidate } from '@/types/recruit';

interface ResumePanelProps {
  candidate: RecruitCandidate;
  onUpdated: (candidate: RecruitCandidate) => void;
}

export function ResumePanel({ candidate, onUpdated }: ResumePanelProps) {
  const t = useTranslations('recruit');
  const { fingerprint } = useFingerprint();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState(candidate.resumeText);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/recruit/candidates/${candidate.id}/resume`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: formData,
      });
      if (!res.ok) throw new Error('parse failed');
      const data = await res.json();
      setText(data.candidate.resumeText);
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.parseFailed'));
    } finally {
      setUploading(false);
      // 清空 input，否则同一个文件重传第二次不会触发 change
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSaveText() {
    setSaving(true);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ resumeText: text }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-500">{t('resume.parsing')}</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-zinc-400" />
              <Button onClick={() => fileInputRef.current?.click()}>{t('resume.upload')}</Button>
              <p className="text-xs text-zinc-400">{t('resume.uploadHint')}</p>
            </>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="resume-text">{t('resume.paste')}</Label>
        <Textarea
          id="resume-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('resume.pastePlaceholder')}
          rows={16}
        />
        <div className="flex justify-end">
          <Button onClick={handleSaveText} disabled={saving || text === candidate.resumeText}>
            {t('resume.savePaste')}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建工作台容器**

创建 `src/components/recruit/candidate-workspace.tsx`。题目和评价两个 panel 下个任务才建，先留占位——**这是刻意的分步，不是 TODO**：

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumePanel } from './resume-panel';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitCandidate, RecruitEvaluation, RecruitJob } from '@/types/recruit';

interface CandidateWorkspaceProps {
  jobId: string;
  candidateId: string;
}

export function CandidateWorkspace({ jobId, candidateId }: CandidateWorkspaceProps) {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidate, setCandidate] = useState<RecruitCandidate | null>(null);
  const [evaluation, setEvaluation] = useState<RecruitEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recruit/candidates/${candidateId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJob(data.job);
      setCandidate(data.candidate);
      setEvaluation(data.evaluation);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [candidateId, fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  if (loading) return <Skeleton className="h-96" />;
  if (!candidate || !job) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/recruit/${jobId}`}
          className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ChevronLeft className="h-4 w-4" />
          {job.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{candidate.name || '—'}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t(`status.${candidate.status}`)}</p>
      </div>

      <Tabs defaultValue="resume">
        <TabsList>
          <TabsTrigger value="resume">{t('tabs.resume')}</TabsTrigger>
          <TabsTrigger value="questions">{t('tabs.questions')}</TabsTrigger>
          <TabsTrigger value="evaluation">{t('tabs.evaluation')}</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-6">
          <ResumePanel candidate={candidate} onUpdated={setCandidate} />
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          {/* Task 18 接入 QuestionsPanel */}
        </TabsContent>

        <TabsContent value="evaluation" className="mt-6">
          {/* Task 19 接入 EvaluationPanel */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: 创建页面**

创建 `src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx`：

```tsx
'use client';

import { use } from 'react';
import { CandidateWorkspace } from '@/components/recruit/candidate-workspace';

export default function CandidatePage({
  params,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
}) {
  const { jobId, candidateId } = use(params);
  return <CandidateWorkspace jobId={jobId} candidateId={candidateId} />;
}
```

- [ ] **Step 4: 类型检查 + lint**

Run: `pnpm type-check` —— 必须零错误。

再跑 `pnpm lint`。**注意：本仓库 lint 基线就是失败的**（main 上 1340 个问题，绝大多数是 `@typescript-eslint/no-explicit-any`）。判断标准不是「零错误」，而是**你新增的文件里不出现除 `no-explicit-any` 之外的新规则违规**（`no-explicit-any` 与 `interview.repository.ts` / `resume.repository.ts` 等既有文件同款，属于仓库既定风格）。有其他类型的新错误就修掉。

- [ ] **Step 5: 手动验证**

Run: `pnpm dev`，从岗位详情点进一个候选人。

Expected：
- 顶部面包屑显示岗位名，点击能回到岗位详情
- 三个 Tab 可切换，后两个是空的（预期）
- 粘贴一段简历文本点保存，刷新页面文本还在
- 上传一份 PDF，看到「正在解析简历…」，完成后文本框被结构化摘要填充
- 同一个 PDF **连续传两次**都能触发解析（验证 input value 清空那行生效了）

- [ ] **Step 6: Commit**

```bash
git add src/app/\[locale\]/recruit/ src/components/recruit/
git commit -m "feat(recruit): 候选人工作台与简历 Tab"
```

---

### Task 18: 面试题 Tab

**Files:**
- Create: `src/components/recruit/question-card.tsx`
- Create: `src/components/recruit/questions-panel.tsx`
- Modify: `src/components/recruit/candidate-workspace.tsx`

- [ ] **Step 1: 创建题目卡片**

创建 `src/components/recruit/question-card.tsx`：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface QuestionCardProps {
  index: number;
  question: InterviewQuestion;
  dimensions: DimensionConfig[];
  onRemove: () => void;
}

export function QuestionCard({ index, question, dimensions, onRemove }: QuestionCardProps) {
  const t = useTranslations('recruit.questions');
  const label = dimensions.find((d) => d.key === question.dimension)?.label ?? question.dimension;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{label}</Badge>
            <Badge className={DIFFICULTY_STYLE[question.difficulty]}>{question.difficulty}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
              <Clock className="h-3 w-3" />
              {t('minutes', { count: question.estimatedMinutes })}
            </span>
          </div>
          <p className="font-medium">
            {index + 1}. {question.question}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} title={t('remove')}>
          <Trash2 className="h-4 w-4 text-zinc-400" />
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-medium text-zinc-500">{t('intent')}</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{question.intent}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-zinc-500">{t('rubric')}</p>
          <div className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="text-emerald-600">{t('excellent')}：</span>
              {question.rubric.excellent}
            </p>
            <p>
              <span className="text-amber-600">{t('pass')}：</span>
              {question.rubric.pass}
            </p>
            <p>
              <span className="text-red-600">{t('fail')}：</span>
              {question.rubric.fail}
            </p>
          </div>
        </div>

        {question.followUps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500">{t('followUps')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
              {question.followUps.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {question.referencePoints.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500">{t('referencePoints')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
              {question.referencePoints.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: 创建题目 Tab**

创建 `src/components/recruit/questions-panel.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QuestionCard } from './question-card';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import type { DimensionConfig, InterviewQuestion, RecruitCandidate, RecruitJob } from '@/types/recruit';

interface QuestionsPanelProps {
  job: RecruitJob;
  candidate: RecruitCandidate;
  onUpdated: (candidate: RecruitCandidate) => void;
}

export function QuestionsPanel({ job, candidate, onUpdated }: QuestionsPanelProps) {
  const t = useTranslations('recruit');
  const { fingerprint } = useFingerprint();
  const [generating, setGenerating] = useState(false);

  const dimensions: DimensionConfig[] = candidate.dimensionsOverride ?? job.dimensions;
  const questions = candidate.questions ?? [];
  const hasResume = Boolean(candidate.resumeText?.trim());

  async function handleGenerate() {
    if (questions.length > 0 && !confirm(t('questions.regenerateConfirm'))) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidate.id}/questions`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('generate failed');
      const data = await res.json();
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleRemove(questionId: string) {
    const next = questions.filter((q) => q.id !== questionId);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ questions: next }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  // 面试官要把题目带进会议室，所以复制出来的是可读纯文本而不是 JSON。
  async function handleCopyAll() {
    const text = questions
      .map((q: InterviewQuestion, i) => {
        const label = dimensions.find((d) => d.key === q.dimension)?.label ?? q.dimension;
        return [
          `${i + 1}. [${label}] ${q.question}`,
          `   ${t('questions.intent')}：${q.intent}`,
          `   ${t('questions.excellent')}：${q.rubric.excellent}`,
          `   ${t('questions.pass')}：${q.rubric.pass}`,
          `   ${t('questions.fail')}：${q.rubric.fail}`,
          q.followUps.length ? `   ${t('questions.followUps')}：${q.followUps.join('；')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    toast.success(t('questions.copied'));
  }

  if (!hasResume) {
    return <Card className="p-10 text-center text-sm text-zinc-500">{t('questions.needResume')}</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
          </Button>
          {questions.length > 0 && (
            <Button variant="outline" onClick={handleCopyAll}>
              <Copy className="mr-1 h-4 w-4" />
              {t('questions.copyAll')}
            </Button>
          )}
        </div>
      </div>

      {generating && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('questions.generating')}</Card>
      )}

      {!generating && questions.length === 0 && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('questions.empty')}</Card>
      )}

      {!generating &&
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            dimensions={dimensions}
            onRemove={() => handleRemove(q.id)}
          />
        ))}
    </div>
  );
}
```

- [ ] **Step 3: 接入工作台**

`src/components/recruit/candidate-workspace.tsx`：加 import

```tsx
import { QuestionsPanel } from './questions-panel';
```

并把 questions 那个 TabsContent 换成：

```tsx
<TabsContent value="questions" className="mt-6">
  <QuestionsPanel job={job} candidate={candidate} onUpdated={setCandidate} />
</TabsContent>
```

- [ ] **Step 4: 类型检查 + lint**

Run: `pnpm type-check` —— 必须零错误。

再跑 `pnpm lint`。**注意：本仓库 lint 基线就是失败的**（main 上 1340 个问题，绝大多数是 `@typescript-eslint/no-explicit-any`）。判断标准不是「零错误」，而是**你新增的文件里不出现除 `no-explicit-any` 之外的新规则违规**（`no-explicit-any` 与 `interview.repository.ts` / `resume.repository.ts` 等既有文件同款，属于仓库既定风格）。有其他类型的新错误就修掉。

- [ ] **Step 5: 手动验证**

Run: `pnpm dev`。先在 Settings 配好 AI provider 和 key。

Expected：
- 简历为空时，题目 Tab 显示「请先上传或粘贴候选人简历」
- 有简历后点「生成面试题」，出现「正在生成面试题，约需 30-60 秒…」
- 生成完毕看到题卡：维度徽章、难度、分钟数、考察点、三档评分标准、追问建议、参考要点齐全
- **各维度的题数与岗位配的权重成比例**，题目总数等于设置的数量
- 题目内容确实结合了这份简历的具体经历
- 删掉一道题后刷新页面，那道题不再出现
- 「复制全部题目」后粘到记事本，是可读的纯文本清单

- [ ] **Step 6: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): 面试题生成与展示"
```

---

### Task 19: 评价 Tab

**Files:**
- Create: `src/components/recruit/dimension-radar.tsx`
- Create: `src/components/recruit/evaluation-panel.tsx`
- Modify: `src/components/recruit/candidate-workspace.tsx`

- [ ] **Step 1: 创建雷达图**

创建 `src/components/recruit/dimension-radar.tsx`。**不复用 `components/interview/radar-chart.tsx`**——那个绑死了 `interview.report` 命名空间和 `dimension` 字段名：

```tsx
'use client';

import {
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import type { DimensionScore } from '@/types/recruit';

interface DimensionRadarProps {
  scores: DimensionScore[];
}

export function DimensionRadar({ scores }: DimensionRadarProps) {
  const data = scores.map((s) => ({ label: s.label, score: s.score }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RechartsRadar data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="label" className="text-xs" />
        <PolarRadiusAxis angle={30} domain={[0, 100]} />
        <Radar dataKey="score" stroke="#ec4899" fill="#ec4899" fillOpacity={0.3} />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: 创建评价 Tab**

创建 `src/components/recruit/evaluation-panel.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DimensionRadar } from './dimension-radar';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import type { RecruitCandidate, RecruitEvaluation, Recommendation } from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface EvaluationPanelProps {
  candidate: RecruitCandidate;
  evaluation: RecruitEvaluation | null;
  onCandidateUpdated: (candidate: RecruitCandidate) => void;
  onEvaluated: (evaluation: RecruitEvaluation) => void;
}

export function EvaluationPanel({
  candidate,
  evaluation,
  onCandidateUpdated,
  onEvaluated,
}: EvaluationPanelProps) {
  const t = useTranslations('recruit');
  const { fingerprint } = useFingerprint();
  const [transcript, setTranscript] = useState(candidate.transcript);
  const [generating, setGenerating] = useState(false);

  const hasQuestions = (candidate.questions ?? []).length > 0;

  async function handleGenerate() {
    if (evaluation && !confirm(t('evaluation.regenerateConfirm'))) return;
    setGenerating(true);
    try {
      // 先存记录再评价：接口从库里读 transcript，不从请求体读。
      const saveRes = await fetch(`/api/recruit/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ transcript }),
      });
      if (!saveRes.ok) throw new Error('save failed');
      onCandidateUpdated((await saveRes.json()).candidate);

      const res = await fetch(`/api/recruit/candidates/${candidate.id}/evaluation`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('evaluate failed');
      const data = await res.json();
      onEvaluated(data.evaluation);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  if (!hasQuestions) {
    return (
      <Card className="p-10 text-center text-sm text-zinc-500">{t('evaluation.needQuestions')}</Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="transcript">{t('evaluation.transcript')}</Label>
        <p className="text-xs text-zinc-500">{t('evaluation.transcriptHint')}</p>
        <Textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={t('evaluation.transcriptPlaceholder')}
          rows={12}
        />
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={generating || !transcript.trim()}>
            {generating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-4 w-4" />
            )}
            {evaluation ? t('evaluation.regenerate') : t('evaluation.generate')}
          </Button>
        </div>
      </div>

      {generating && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('evaluation.generating')}</Card>
      )}

      {!generating && !evaluation && (
        <Card className="p-10 text-center text-sm text-zinc-500">{t('evaluation.empty')}</Card>
      )}

      {!generating && evaluation && (
        <div className="space-y-6">
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-xs text-zinc-500">{t('evaluation.overallScore')}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{evaluation.overallScore}</p>
            </div>
            <div className="text-right">
              <Badge className={RECOMMENDATION_STYLE[evaluation.recommendation]}>
                {t(`recommendation.${evaluation.recommendation}`)}
              </Badge>
              <p className="mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.recommendationReason}
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-2 text-sm font-medium">{t('evaluation.dimensionScores')}</h3>
            <DimensionRadar scores={evaluation.dimensionScores} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-3 text-sm font-medium text-emerald-600">
                {t('evaluation.strengths')}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-6">
              <h3 className="mb-3 text-sm font-medium text-amber-600">
                {t('evaluation.concerns')}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.concerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="mb-2 text-sm font-medium">{t('evaluation.overallComment')}</h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {evaluation.overallComment}
            </p>
          </Card>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('evaluation.questionReview')}</h3>
            {evaluation.questionEvaluations.map((q, i) => (
              <Card key={q.questionId} className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {q.answered ? q.score : '—'}
                  </span>
                </div>
                {q.answered ? (
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs font-medium text-zinc-500">
                        {t('evaluation.answerSummary')}
                      </p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{q.answerSummary}</p>
                    </div>
                    {q.highlights.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-emerald-600">
                          {t('evaluation.highlights')}
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
                          {q.highlights.map((h, j) => (
                            <li key={j}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {q.weaknesses.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-600">
                          {t('evaluation.weaknesses')}
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
                          {q.weaknesses.map((w, j) => (
                            <li key={j}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">{t('evaluation.notAnswered')}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 接入工作台**

`src/components/recruit/candidate-workspace.tsx`：加 import

```tsx
import { EvaluationPanel } from './evaluation-panel';
```

并把 evaluation 那个 TabsContent 换成：

```tsx
<TabsContent value="evaluation" className="mt-6">
  <EvaluationPanel
    candidate={candidate}
    evaluation={evaluation}
    onCandidateUpdated={setCandidate}
    onEvaluated={setEvaluation}
  />
</TabsContent>
```

- [ ] **Step 4: 类型检查 + lint**

Run: `pnpm type-check` —— 必须零错误。

再跑 `pnpm lint`。**注意：本仓库 lint 基线就是失败的**（main 上 1340 个问题，绝大多数是 `@typescript-eslint/no-explicit-any`）。判断标准不是「零错误」，而是**你新增的文件里不出现除 `no-explicit-any` 之外的新规则违规**（`no-explicit-any` 与 `interview.repository.ts` / `resume.repository.ts` 等既有文件同款，属于仓库既定风格）。有其他类型的新错误就修掉。

- [ ] **Step 5: 手动验证 —— 完整走一遍**

Run: `pnpm dev`

从头走完整流程：建岗位 → 加候选人 → 传简历 → 生成题目 → 粘贴面试记录 → 生成评价。

Expected：
- 没生成题目时，评价 Tab 显示「请先生成面试题」
- 粘贴记录点「生成评价」，看到进度提示
- 报告出来后：总分、录取建议徽章及理由、雷达图、优势/顾虑、整体评价、逐题点评齐全
- **记录里没覆盖到的题显示「本题未作答」，分数列是「—」**
- 回到岗位详情页，该候选人的分数和结论出现在表格里，状态变成「已评价」
- 再加一个候选人走完流程，点表头「总分」能按分数排序，未评价的排最后

- [ ] **Step 6: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): 面试评价生成与报告展示"
```

---

## Phase 5：桌面端验证与收尾

### Task 20: 桌面客户端验证与全量检查

**Files:** 不新增文件。这个任务是验证 —— 但**发现问题就在这里修**。

桌面端加载的是同一个 Next server（`electron/main/index.ts:161`），路由天然可用。真正的风险有两个：**SQLite migration 是否随打包带上**、**Electron 里的文件上传是否正常**。

- [ ] **Step 1: 全量测试与静态检查**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: 全部通过

- [ ] **Step 2: 确认 SQLite migration 会被桌面端应用**

Run: `ls drizzle/migrations/ && cat drizzle/migrations/meta/_journal.json | tail -20`
Expected: Task 3 生成的 `0006_*.sql` 在目录里，且 `_journal.json` 里有对应条目。

**这一步不能跳**：桌面端启动时 `SQLiteAdapter` 构造函数会跑 `migrate()`，migration 文件没被打包进去的话，用户升级后打开招聘页会直接报 "no such table: recruit_jobs"。

Run: `grep -n "migrations" config/electron-builder.config.cjs`
Expected: 能看到 `drizzle` 或 `migrations` 出现在 `files`/`extraResources` 配置里。**如果没有**，说明现有打包配置靠 `resolveMigrationsDir` 从别处解析——打开 `src/lib/db/migrations-dir.ts` 确认桌面模式下的解析路径，并按它的约定确保新 migration 落在同一目录（既有的 interview 表能正常工作，说明这条路已经通了，新文件同目录即可）。

- [ ] **Step 3: 构建桌面端**

Run: `pnpm build:desktop`
Expected: 构建成功，无报错

- [ ] **Step 4: 启动桌面端走一遍完整流程**

Run: `pnpm dist:mac`（或在 macOS 上直接跑构建产物）

在桌面客户端里：
1. 顶部导航能看到「招聘」，点进去正常渲染（**不是白屏、不报 no such table**）
2. 新建一个岗位，配好维度
3. 加一个候选人，**用文件选择器上传一份 PDF 简历** —— 这是本任务最关键的验证点
4. 生成面试题
5. 粘贴面试记录，生成评价
6. 关掉客户端重新打开，数据还在

Expected: 全流程与浏览器里一致。

**如果第 3 步的文件选择器打不开或上传失败**：检查 `electron/main/index.ts` 里 `webPreferences` 的配置，以及是否有 CSP 阻止了 `FormData` 请求。现有的简历上传功能走同一条路径，可以对照它是否正常来定位——如果简历上传也不行，那是既有问题，不属于本次改动范围，记录下来单独处理。

- [ ] **Step 5: 中英文切换检查**

在桌面端和浏览器里都切到英文，把招聘模块的四个页面各看一遍。

Expected: 没有裸露的 i18n key（形如 `recruit.questions.intent` 直接显示出来）。有的话回 Task 13 补齐 `messages/en.json`。

- [ ] **Step 6: PostgreSQL 路径验证（可选，但建议做）**

如果本地能起 PG：

```bash
DB_TYPE=postgresql DATABASE_URL=<你的连接串> pnpm db:migrate
DB_TYPE=postgresql DATABASE_URL=<你的连接串> pnpm dev
```

Expected: 三张 recruit 表建出来，招聘流程在 PG 下同样跑通。

跑不了 PG 就跳过，但要确认 `drizzle/pg-migrations/` 下的新 migration 文件内容看起来正确（三条 CREATE TABLE）。

- [ ] **Step 7: 最终 commit**

如果前面几步有修改：

```bash
git add -A
git commit -m "fix(recruit): 桌面端验证发现的问题修复"
```

没有修改就跳过。

---

## 验收清单

实现全部完成后，逐条核对：

- [ ] `/recruit` 能建岗位，维度权重可调，题数分配随权重实时变化
- [ ] 岗位下可加多个候选人，候选人列表能按总分排序，未评价的排最后
- [ ] 简历支持上传 PDF/图片解析，也支持粘贴纯文本
- [ ] 上传候选人简历**不会**在用户自己的简历列表里多出记录
- [ ] 生成的题目数量等于配置值，各维度题数与权重成比例
- [ ] 每道题有考察点、三档评分标准、追问建议、参考要点、时长、难度
- [ ] 题目可单独删除，可一键复制成纯文本
- [ ] 粘贴整段面试记录即可生成评价，无需逐题录入
- [ ] 评价含加权总分、雷达图、逐题点评、优势/顾虑、四档录取建议与理由
- [ ] 记录中未覆盖的题标为「未作答」，且该维度不拉低总分
- [ ] 重复生成评价是覆盖，不会产生第二条记录
- [ ] 中英文切换无裸 key
- [ ] 桌面客户端全流程可用，重启后数据仍在
- [ ] `pnpm test && pnpm type-check && pnpm lint` 全绿
- [ ] 原有的简历上传功能未受 Task 6 重构影响

---

## 附：明确不做的（YAGNI）

以下在 spec 里已明确排除，实现时不要顺手加：

- 多轮面试（一面/二面/HR 面）—— 一个候选人一次面试、一份评价
- 面试录音上传与转写
- 逐题手动填写答案的表单
- 题库沉淀与跨岗位复用
- 多面试官协同评分、评价分享链接
- 题目生成的流式输出
