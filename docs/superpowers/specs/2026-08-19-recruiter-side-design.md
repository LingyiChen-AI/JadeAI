# 面试官侧（招聘模块）设计

日期：2026-08-19
状态：设计已确认，待实现

## 背景与目标

JadeAI 现有的 `/interview` 是**候选人侧**的 AI 模拟面试：AI 扮演面试官，与用户多轮对话，最后出一份提升报告（`interview_sessions` / `interview_rounds` / `interview_messages` / `interview_reports` 四张表）。

本设计新增**面试官侧**能力，服务于「我要招人」的场景：

1. 建岗位，录入 JD，配置想考察的维度及权重
2. 岗位下添加候选人，上传/粘贴其简历
3. AI 基于 JD + 简历 + 维度权重生成一套个性化面试题，每题附考察点、评分标准、追问建议、参考答案要点、预计时长与难度
4. 线下面完后，把整段面试记录粘贴进来，AI 切分并逐题打分
5. 输出：加权总分、维度雷达图、逐题点评、优势/顾虑清单、录取建议与理由
6. 同一岗位下的候选人可按总分横向对比

桌面客户端（Electron）同步支持。

## 与候选人侧的关系

**完全独立的模块，不复用 `interview_*` 表。**

候选人侧是对话式（rounds → messages），面试官侧是文档式（生成题目 → 回填记录 → 出评价）。两者数据模型、AI prompt、页面交互都不同。强行复用会在 `interview_sessions` 上堆出大量空字段，并让现有组件长满 if 分支。

唯一共享的是：AI provider 封装（`src/lib/ai/provider.ts`）、JSON 解析容错（`src/lib/ai/extract-json.ts`）、简历解析能力（见「必要重构」）。

雷达图不复用 `src/components/interview/radar-chart.tsx`——它绑死了 `interview.report` 的 i18n 命名空间和 `dimension` 字段名，而招聘侧的维度字段是 `key`/`label`。新建 `src/components/recruit/dimension-radar.tsx`，参照其 recharts 用法即可（约 40 行）。

## 数据模型

三张表，SQLite（`src/lib/db/schema-recruit.ts`）与 PostgreSQL（`src/lib/db/pg-schema.ts`）各一份，与现有 `schema-interview.ts` 的组织方式保持一致。

### recruit_jobs

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| userId | text NOT NULL → users.id | 归属人 |
| title | text NOT NULL | 岗位名称 |
| jobDescription | text NOT NULL | JD 原文 |
| dimensions | json NOT NULL | `DimensionConfig[]`，岗位级默认考察标准 |
| questionCount | int NOT NULL default 10 | 生成题目总数，允许 5–20 |
| createdAt / updatedAt | timestamp | |

### recruit_candidates

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| jobId | text NOT NULL → recruit_jobs.id ON DELETE CASCADE | |
| name | text NOT NULL default '' | 候选人姓名 |
| status | enum | `pending` / `questions_ready` / `evaluated` |
| resumeText | text NOT NULL default '' | 简历纯文本（粘贴的原文，或解析产物的文本化兜底） |
| resumeData | json NULL | 结构化简历（上传文件解析所得），可为空 |
| dimensionsOverride | json NULL | 覆盖岗位级维度配置；为空则用岗位的 |
| questions | json NULL | `InterviewQuestion[]`，未生成时为 null |
| transcript | text NOT NULL default '' | 粘贴的整段面试记录 |
| createdAt / updatedAt | timestamp | |

题目以 JSON 存在候选人行上而不单独建表：题目是「针对这份 JD + 这个人的简历」一次性生成的，天然一人一套，无跨候选人复用；面试官删除或重新生成时整体覆盖即可。

### recruit_evaluations

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| candidateId | text NOT NULL UNIQUE → recruit_candidates.id ON DELETE CASCADE | 一人一份；重新生成时按 candidateId 先删后插 |
| overallScore | int NOT NULL | 服务端按权重计算的加权总分（0–100） |
| dimensionScores | json NOT NULL | `DimensionScore[]` |
| questionEvaluations | json NOT NULL | `QuestionEvaluation[]` |
| recommendation | enum NOT NULL | `strong_hire` / `hire` / `hold` / `no_hire` |
| recommendationReason | text NOT NULL | 结论理由 |
| strengths | json NOT NULL | string[] |
| concerns | json NOT NULL | string[] |
| overallComment | text NOT NULL | 整体面试评价 |
| createdAt | timestamp | |

评价独立成表（而非并进候选人行）的原因：评价是大 JSON，岗位详情页的候选人列表查询不应把它拖出来。这与现有 `interview_sessions → interview_reports` 的分层一致。

## 类型定义

新建 `src/types/recruit.ts`：

```ts
export type DimensionKey =
  | 'stress' | 'logic' | 'communication' | 'professional'
  | 'teamwork' | 'learning' | 'motivation' | 'leadership'
  | (string & {}); // 自定义维度用任意 key

export interface DimensionConfig {
  key: string;
  label: string;      // 展示名，自定义维度由用户输入
  weight: number;     // 正整数，相对权重
  custom: boolean;
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface InterviewQuestion {
  id: string;
  dimension: string;            // 对应 DimensionConfig.key
  question: string;             // 题干
  intent: string;               // 考察点：这道题真正想看什么
  rubric: {
    excellent: string;
    pass: string;
    fail: string;
  };
  followUps: string[];          // 2-3 个追问方向
  referencePoints: string[];    // 优秀回答应覆盖的要点
  estimatedMinutes: number;
  difficulty: QuestionDifficulty;
}

export interface DimensionScore {
  key: string;
  label: string;
  score: number;        // 0-100，模型给出
  weight: number;       // 计算时的权重，冗余存储便于报告复现
}

export interface QuestionEvaluation {
  questionId: string;
  question: string;
  answerSummary: string;   // AI 从 transcript 中定位到的回答摘要
  answered: boolean;       // 记录中是否能找到对应回答
  score: number;           // 0-100
  highlights: string[];
  weaknesses: string[];
}

export type Recommendation = 'strong_hire' | 'hire' | 'hold' | 'no_hire';
```

### 预置维度

`src/lib/recruit/dimensions.ts` 导出 8 个预置维度（label 走 i18n key，非硬编码中文）：

| key | 中文 | 英文 |
|---|---|---|
| stress | 抗压能力 | Stress tolerance |
| logic | 逻辑思维 | Logical thinking |
| communication | 沟通表达 | Communication |
| professional | 专业技能 | Professional skills |
| teamwork | 团队协作 | Teamwork |
| learning | 学习能力 | Learning ability |
| motivation | 稳定性与动机 | Motivation & stability |
| leadership | 领导力 | Leadership |

新建岗位时默认勾选：专业技能(3)、逻辑思维(2)、沟通表达(2)。用户可增删、调权重、添加自定义维度。

## 页面结构

| 路由 | 内容 |
|---|---|
| `/recruit` | 岗位列表（卡片：标题、候选人数、创建时间）+ 新建岗位入口 |
| `/recruit/[jobId]` | JD 概览、维度权重编辑、候选人列表 |
| `/recruit/[jobId]/c/[candidateId]` | 候选人工作台 |

### /recruit/[jobId]

- 顶部：岗位标题、JD 折叠展示、编辑按钮
- 维度权重编辑器：勾选 + 权重滑块/数字输入 + 添加自定义维度 + 题目总数设置
- 候选人列表（表格）：姓名 / 状态 / 加权总分 / 录取建议徽章 / 操作。默认按总分降序，未评价的排在后面 —— 这就是横向对比

### /recruit/[jobId]/c/[candidateId]

用 Tab 切分三段（复用 `src/components/ui` 的 Tabs），Tab 上带完成状态标记：

1. **简历**：拖拽 PDF/PNG/JPG/WebP 上传解析，或直接粘贴纯文本。解析结果以结构化形式展示，可编辑姓名。
2. **面试题**：「生成面试题」按钮 → 题目卡片列表。每张卡片显示题干、维度徽章、考察点、三档评分标准、追问建议、参考要点、时长与难度。支持删除单题、整体重新生成、一键复制全部题目为纯文本（面试官要带进会议室）。
3. **评价**：粘贴整段面试记录的大文本框 → 「生成评价」按钮 → 报告区：加权总分、维度雷达图、逐题点评（含 AI 定位到的回答摘要）、优势清单、顾虑清单、录取建议徽章 + 理由、整体评价。支持重新生成（覆盖）。

未完成前置步骤时（如未传简历就点生成题目），按钮禁用并给出提示。

## API

```
POST   /api/recruit/jobs                          创建岗位
GET    /api/recruit/jobs                          岗位列表
GET    /api/recruit/jobs/[id]                     岗位详情（含候选人列表 + 各自评价摘要）
PATCH  /api/recruit/jobs/[id]                     更新岗位（JD / 维度 / 题目数）
DELETE /api/recruit/jobs/[id]                     删除岗位（级联删候选人与评价）

POST   /api/recruit/jobs/[id]/candidates          添加候选人
GET    /api/recruit/candidates/[id]               候选人详情（含题目 + 评价）
PATCH  /api/recruit/candidates/[id]               更新（姓名 / 简历文本 / transcript / 维度覆盖 / 题目增删）
DELETE /api/recruit/candidates/[id]               删除候选人

POST   /api/recruit/candidates/[id]/resume        上传文件解析简历（multipart）
POST   /api/recruit/candidates/[id]/questions     生成面试题（AI 调用 1）
POST   /api/recruit/candidates/[id]/evaluation    生成评价（AI 调用 2）
```

鉴权沿用现有模式：`getUserIdFromRequest(request)` → `resolveUser(fingerprint)`，并在每个 handler 里校验资源归属（岗位的 `userId` 必须等于当前用户；候选人与评价通过 `jobId` 上溯校验）。

Repository 层新建 `src/lib/db/repositories/recruit.repository.ts`，参照 `interview.repository.ts` 的写法。

## AI 调用

两次调用都走现有封装：`extractAIConfig(request)` 取用户自带的 provider/key → `getModel(config)` → `generateText({ model, system, prompt, providerOptions: getJsonProviderOptions(config) })` → `extractJson(result.text, zodSchema)`。Schema 定义在 `src/lib/ai/recruit-schema.ts`。

输出语言跟随 JD 的语言（与 `jd-analysis` 同策略：在 system prompt 中要求检测 JD 主语言并全程使用该语言）。

### 调用 1：生成面试题

输入上下文：JD、简历（结构化优先，否则纯文本）、维度配置、每个维度分配到的题目数。

**关键约束：题目数分配在服务端完成，不交给模型。** 纯函数 `allocateQuestions(dimensions, total)` 按权重做最大余额法分配，保证每个已勾选维度至少 1 题、总数精确等于 `questionCount`。prompt 中直接写明「抗压能力 3 题、逻辑思维 4 题……」。否则权重配置形同虚设。

输出：`InterviewQuestion[]`。`id` 由服务端生成（`crypto.randomUUID()`），不信任模型返回的 id。

失败处理：`extractJson` 抛错时返回 500 与可读错误信息，不写库；`AIConfigError` 返回 400 提示配置 AI。

### 调用 2：生成评价

输入上下文：JD、简历、`InterviewQuestion[]`（含 rubric 与 referencePoints）、`transcript` 全文、维度配置。

模型输出：每题的 `answerSummary` / `answered` / `score` / `highlights` / `weaknesses`，每个维度的 0–100 分，以及 `strengths` / `concerns` / `overallComment` / `recommendation` / `recommendationReason`。

**关键约束：加权总分由服务端计算，不由模型给。** 纯函数 `computeOverallScore(dimensionScores)` 做加权平均并四舍五入。理由有二：LLM 的算术不可靠；总分必须与权重配置严格对应，横向排序才有意义。

模型仍然给出 `recommendation`（它是综合判断，不只是分数的函数），但服务端在总分与建议明显矛盾时（如总分 < 40 却给 strong_hire）不做强制纠正，只如实存储——纠正规则难以定得合理，且报告同时展示分数与建议，面试官自己能判断。

记录中找不到某题回答时，该题 `answered: false`、`score` 记 0，且**该题不计入所属维度得分**（prompt 中明确要求模型仅基于已回答的题目给维度分）。若某维度全部未作答，该维度不计入加权总分。

## 必要重构

现有 `src/app/api/resume/parse/route.ts` 把「多模态简历解析」与「写入 resumes 表创建简历」焊在同一个 handler 里。招聘侧只需要前半段——候选人的简历不应污染用户自己的简历列表。

做法：把解析逻辑（文件校验、system prompt、`generateText` 调用、`extractJson`）抽到 `src/lib/ai/parse-resume.ts`，导出 `parseResumeFile(file, aiConfig): Promise<ParsedResume>`。`/api/resume/parse` 改为调用它再走原有的落库逻辑，对外行为完全不变；`/api/recruit/candidates/[id]/resume` 调用它后只写入 `recruit_candidates.resumeData` 与 `resumeText`。

不做与本需求无关的其他重构。

## 桌面客户端

Electron 主进程加载同一个 Next standalone server（`electron/main/index.ts:161`），因此新路由与新 API 天然可用。需要额外做的：

1. `src/components/layout/header.tsx` 的 `NAV_ITEMS` 增加 `{ href: '/recruit', i18nKey: 'recruit.nav', match: '/recruit' }`
2. `messages/zh.json` 与 `messages/en.json` 增加 `recruit` 命名空间
3. **SQLite 与 PostgreSQL 两套 schema 都要加表，两套 migration 都要生成**（`drizzle/migrations` 与 `drizzle/pg-migrations`）。桌面端默认 SQLite，漏掉 SQLite migration 会直接导致客户端打不开新页面。

验证点：在 Electron 里实测一次 PDF 上传解析。现有简历上传走同一条 `<input type="file">` + `FormData` 路径，风险低，但必须实测确认。

## 测试

沿用项目现有的 vitest 配置。优先覆盖纯函数与边界：

- `allocateQuestions(dimensions, total)`：权重分配、每维度至少 1 题、总数精确、单维度、权重全相等、total 小于维度数时的降级行为
- `computeOverallScore(dimensionScores)`：加权平均、全零、维度缺失（未作答维度被排除）、权重和为 0 的兜底
- 维度配置的 zod 校验：权重必须为正整数、key 不得重复、至少勾选一个维度
- AI 输出 schema 解析：合法 JSON、带 markdown 代码围栏的 JSON、字段缺失时的报错
- `recruit.repository.ts` 的 CRUD 与级联删除，参照 `user.repository.local-user.test.ts` 的写法

## 明确不做（YAGNI）

- 多轮面试（一面/二面/HR 面）——一个候选人一次面试、一份评价
- 面试录音上传与转写
- 逐题手动填写答案的表单（已确定走「粘贴整段记录 + AI 分析」）
- 题库沉淀与跨岗位复用
- 多面试官协同评分、评价分享链接
- 题目生成的流式输出——用带进度提示的 loading 即可

## 已确认的产品决策

| 决策点 | 结论 |
|---|---|
| 模块边界 | 独立 `/recruit`，不复用候选人侧的表 |
| 组织粒度 | 岗位 → 多候选人 |
| 维度 | 预置 8 个 + 权重 + 自定义 |
| 答案录入 | 粘贴整段面试记录，AI 分析 |
| 题目附带信息 | 考察点、评分标准、追问建议、参考要点、时长、难度（全要） |
| 简历来源 | 上传文件解析 + 粘贴纯文本 |
| 录取建议刻度 | 4 档：strong_hire / hire / hold / no_hire |
| 默认题目数 | 10（可调 5–20） |
| 生成交互 | 非流式，带进度提示的 loading |
