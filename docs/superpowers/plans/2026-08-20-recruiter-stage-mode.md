# 招聘模块 · 面试台模式 实现计划

> 依据 `docs/superpowers/specs/2026-08-20-recruiter-stage-mode-design.md`。
> 每个任务结束时提交一次。

**目标**：把招聘模块的候选人层从「左栏 + 步骤 Tab 工作台」改成「准备 / 面试台 / 复盘」三个独立模式页。

**范围**：只改界面与路由。数据层、AI 层、出题与评估逻辑全部不动，唯一例外是岗位统计多查一个 `status` 字段。

---

## 任务 1 · 候选人状态判定（纯函数 + 测试）

**文件**
- 新建 `src/lib/recruit/candidate-stage.ts`
- 新建 `src/lib/recruit/candidate-stage.test.ts`

**要点**

```ts
export type CandidateStage = 'need_resume' | 'need_questions' | 'interviewing' | 'done';

export interface StageInput {
  resumeText?: string | null;
  questions?: InterviewQuestion[] | null;
  hasEvaluation: boolean;
}

export function candidateStage(input: StageInput): CandidateStage;
```

判定顺序（必须是这个顺序，否则「有评价但简历被清空」会退回第一步）：
1. `hasEvaluation` → `done`
2. `questions?.length` → `interviewing`
3. `resumeText?.trim()` → `need_questions`
4. 否则 → `need_resume`

**测试要覆盖**：四种状态各一条；空白字符的 `resumeText` 视同没有；空数组 `questions` 视同没有；有评价时即使简历为空也是 `done`。

---

## 任务 2 · 岗位统计加「面试中」

**文件**
- 改 `src/lib/recruit/job-stats.ts`：`CandidateStatRow` 加 `status: CandidateStatus`；`JobStats` 加 `interviewing: number`
- 改 `src/lib/recruit/job-stats.test.ts`：补测试
- 改 `src/lib/db/repositories/recruit.repository.ts`：`findCandidateStatsByUserId` 的 select 加 `status: recruitCandidates.status`
- 改 `src/components/recruit/job-list.tsx`：卡片底部从三个数变四个数

**定义**：`interviewing` = `status === 'questions_ready'` 且没有 `recommendation`。已评价的人不算在内。

**注意**：`job-list.tsx` 的 `Stat` 组件间距要重排——四个数挤一行 + 右侧日期会太紧，日期改到标题行右侧或换行。

---

## 任务 3 · 候选人列表页

**文件**
- 新建 `src/components/recruit/candidate-list.tsx`
- 改 `src/app/[locale]/recruit/[jobId]/page.tsx`
- 删 `src/app/[locale]/recruit/[jobId]/layout.tsx`
- 删 `src/components/recruit/candidate-sidebar.tsx`
- 删 `src/components/recruit/job-overview.tsx`（内容拆进新页面）

**页面结构**（单列，`max-w-5xl`）：
1. 面包屑「← 招聘岗位」
2. 岗位标题 + JD 卡片（可折叠、可编辑，从 `job-overview.tsx` 搬）
3. 操作条：搜索框 + 「添加候选人」
4. 候选人表：每行 = 名字 + 分数/结论徽章 + 已记录进度 + 主按钮 + `⋮`（重命名/删除）
5. 候选人对比表（≥2 人已评价）

**主按钮**用任务 1 的 `candidateStage` 决定文案与目标路由。`interviewing` 时按钮文案带 `n/m`，`n` 用 `countAnswered`。

**注意**：
- 重命名和删除的对话框逻辑从 `candidate-sidebar.tsx` 搬过来，别丢掉——上一轮就因为删组件把删除功能弄没了。
- 行内的 `⋮` 菜单不能包在 `<Link>` 里，点菜单会触发导航。整行用 `div` + 按钮，不用 `Link` 包整行。

**API**：需要每个候选人的 `hasEvaluation` 和已答题数。`findCandidateSummaries` 已返回 `overallScore`/`recommendation`（有值即有评价），但没有题目数和已答数。给 `CandidateSummary` 加 `questionCount` 和 `answeredCount` 两个数，在 repository 里从 `questions` JSON 算出来。

---

## 任务 4 · 准备页

**文件**
- 新建 `src/app/[locale]/recruit/[jobId]/c/[candidateId]/prep/page.tsx`
- 新建 `src/components/recruit/prep-panel.tsx`

**结构**（单列 `max-w-3xl`）：
1. 面包屑「← 候选人列表」+ 候选人名
2. 简历卡：`ResumeDropzone` + `ResumePanel`（原样复用）
3. 维度卡：只读列表，每行 = 维度色点 + 名称 + 权重 + 「n 题」；右上角「改岗位配置」开 `JobFormDialog`
4. 底部固定条：没题目时「生成题目」；有题目时「重新生成」（带确认）+「开始面试」

生成成功后直接 `router.push(.../stage)`。

**注意**：维度取值优先 `candidate.dimensionsOverride`，再退 `job.dimensions`——和 API 的逻辑保持一致。

---

## 任务 5 · 面试台

**文件**
- 新建 `src/app/[locale]/recruit/[jobId]/c/[candidateId]/stage/page.tsx`
- 新建 `src/components/recruit/interview-stage.tsx`
- 新建 `src/components/recruit/stage-rail.tsx`（顶部按维度着色的进度带）
- 删 `src/components/recruit/questions-panel.tsx`
- 删 `src/components/recruit/question-list.tsx`
- 删 `src/components/recruit/question-detail.tsx`

**布局**：外层 `fixed inset-0 z-50 flex flex-col bg-...`，盖住顶部导航。

顶栏：候选人名 · `StageRail` · `n/m` · 已用时长 · 「结束面试」（去 report）
主体 `flex-1 min-h-0`，左右两栏：
- 左（`flex-[1.45]`）：维度 chip + 难度 + 建议时长 → 21px 题干 → 答案 `Textarea`（`min-h-[140px] max-h-[280px]`，2px 品牌色描边）→ 操作行
- 右（`flex-[0.85]`，`overflow-y-auto`）：评分标准三行 / 追问 / 参考答案（默认折叠）

**防抖落库**：从 `questions-panel.tsx` 原样移植——800ms 防抖、`pendingRef` 失败不清、切题前先 `flush()`。这段逻辑已经验证过能用，不要重写。

**键盘**：`⌘↵` 记录并下一题；`⌘←` / `⌘→` 切题；`esc` 退出到候选人列表。全部在切题前先 `flush()`。

**计时**：进入面试台时记一个 `startedAt`（组件内 `useRef`，不落库），显示已用分钟。刷新会重置，这是可接受的——它只是个参考。

**最后一题**按钮文案改成「记录并结束」，点了去 report。

---

## 任务 6 · 复盘页

**文件**
- 新建 `src/app/[locale]/recruit/[jobId]/c/[candidateId]/report/page.tsx`
- 改 `src/components/recruit/evaluation-panel.tsx`：去掉对 `StepTabs` 的依赖（如果有），加面包屑

`EvaluationPanel` 基本原样。「粘贴整段面试记录」留在顶部，折叠态。

---

## 任务 7 · 路由收尾与 i18n

**文件**
- 删 `src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx`
- 改 `messages/zh.json` / `messages/en.json`

**旧路由处理**：`.../c/[candidateId]` 直接删掉。旧链接不存在于任何地方（只有候选人左栏在用，那个也删了）。

**新增 i18n 键**（全部用文本锚点插入，禁止 JSON 序列化回写）：

```
recruit.stage.candidates / interviewed / passed / interviewing   （岗位卡片第四个数）
recruit.list.back / addCandidate / searchPlaceholder / progress
recruit.actions.uploadResume / generateQuestions / startInterview / continueInterview / viewReport
recruit.prep.title / dimensionsReadonly / editJobConfig / generate / regenerate / start
recruit.stage.title / elapsed / finish / prev / recordNext / recordFinish / exit / shortcuts
recruit.report.back
```

**验收命令**

```bash
npx tsc --noEmit                    # 无输出
npx vitest run                      # 全绿
npx eslint src/components/recruit src/app/\[locale\]/recruit   # 不新增非 any 违规
git diff --numstat messages/        # 每个文件只增不删
```

---

## 任务 8 · 端到端验证

用 puppeteer-core + 系统 Chrome（脚本必须放项目根目录），核对：

1. `/zh/recruit` 卡片显示四个数，「面试中」与实际相符
2. `/zh/recruit/[jobId]` 每行主按钮文案正确、点了跳对页面
3. 准备页能传简历、能生成题目
4. 面试台盖住顶栏（顶栏元素不可见）、题干字号 21px、答案框在题干正下方
5. 面试台连记三题 → 刷新 → 答案都在
6. `esc` 退出回候选人列表
7. 复盘页正常渲染

截图落 `docs/design/screenshots/2026-08-20-stage-*.png`，脚本用完删掉。
