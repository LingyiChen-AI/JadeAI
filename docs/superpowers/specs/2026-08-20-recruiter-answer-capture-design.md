# 面试题主从双栏 + 逐题记录答案

日期：2026-08-20
状态：设计已确认，待实现
前置：
- `docs/superpowers/specs/2026-08-19-recruiter-side-design.md`（功能设计，已实现）
- `docs/superpowers/specs/2026-08-20-recruiter-ui-redesign-design.md`（UI 重构，已实现）

## 背景

UI 重构后仍然偏空旷。四种布局方案做成 HTML 原型对比（`docs/design/mockups/2026-08-20-recruiter-layout-options.html`）后选定 **B 主从双栏**：左列题目、右侧常驻当前题细则。

根因诊断：把 1600px 全部拿来放单列内容。题卡横跨整屏，题干只占左边 35%，中间约 700px 空白，维度徽章和时长孤零零飘在右端——眼睛要横扫一整屏才能把「这道题问什么」和「要花几分钟」连起来。

同时新增一项能力：**面试中逐题记录候选人的回答**，供后续评估使用。这两件事是配套的——主从双栏的详情面板常驻当前题，正好把答案输入框放在题目细则下面，问完直接记。

## 与既有决策的关系

最初定的是「粘贴整段面试记录，AI 分析」而非逐题填写。现在改为**并存，逐题优先**：

- 填了答案的题 → 直接把 Q&A 对喂给模型，并明确告知答案是确定的、不要去记录里找
- 没填答案的题 → 保持现状，让模型从粘贴的整段记录里定位
- 两者都没有 → `answered: false`

这不是推翻原决策，而是补上它的短板：让模型从一整段速记里「定位」某道题的回答，天然存在把 A 题的回答归到 B 题的风险。逐题记录时这个信息是已知的，没有理由丢掉再让模型猜。粘贴入口保留，面完才想起来录入、或手里已有一份速记的场景仍然走得通。

## 数据模型

**不新增表、不新增列、不需要 migration。**

`InterviewQuestion` 增加一个可选字段：

```ts
export interface InterviewQuestion {
  // ...现有字段不变
  /** 面试中记录的候选人回答。空表示这题还没记。 */
  answer?: string;
}
```

答案随 `questions` JSON 一起存在 `recruit_candidates.questions` 列里。`updateCandidateInputSchema.questions` 本来就是 `z.array(z.any())`，`PATCH /api/recruit/candidates/[id]` 一行不用改。

生成题目的 route（`/api/recruit/candidates/[id]/questions`）构造 `InterviewQuestion` 时不带 `answer`，字段可选所以无需改动；重新生成题目会整体覆盖 `questions`，已记录的答案随之清空——这是正确行为，题都换了答案没有意义。

## 砍掉「已问」勾选

现有的「已问」勾选是纯前端 `useState`，刷新即丢。有了答案之后，**填了答案就等于问过了**，进度直接从答案派生。

去掉独立勾选框，少一个概念，且派生出的进度是真持久化的。代价是「问了但懒得记」的题会显示成未记录——已确认接受。

## 面试题页布局（B 主从双栏）

```
┌ 题目列表 300px ┬─ 当前题详情 ─────────────────┐
│ ✓1 断点续传分块 │ 2. 讲一个你排查过的线上问题…  │
│ ▸2 排查线上问题 │ 考察点 / 评分标准 / 追问 / 要点│
│  3 Tekton 回滚  │ ─────────────────────────── │
│  4 权限方案选型 │ 候选人回答                    │
│  5 牌局一致性   │ ┌───────────────────────┐ │
│                │ │ 边问边记…              │ │
│ 3/5 已记录      │ └───────────────────────┘ │
└────────────────┴──── 已保存 · 刚刚 ─────────┘
```

**左列表**（固定 300px）：每项显示已答标记、题号、题干（单行截断）、难度色点。当前题高亮（brand 左边条 + 浅底）。底部显示 `3/5 已记录`。

**右详情**（`flex-1`）：题干、维度徽章、难度与时长、考察点、三档评分标准、追问建议、参考要点，下方是答案输入框（`min-h-[160px]`）与保存状态。删除本题的按钮放在详情区右下角。

**当前题的选中状态**用组件内 `useState` 保存题目 id，不进 URL——面试中切题很频繁，不该污染浏览历史。题目列表变化（重新生成）时重置为第一题。

「全部展开/收起」不再需要，B 方案下细则常驻，折叠概念消失。

## 自动保存

面试中输入不能丢，这是这个功能的底线。

- 输入停止 **800ms** 后自动 PATCH 整个 `questions` 数组
- 状态指示在详情区右下角：`保存中…` / `已保存`
- **保存失败时保留本地输入内容**并明确提示（toast + 状态位显示「保存失败，点击重试」），不静默吞掉
- 切换到别的题时，若有未保存的改动立即触发保存，不等防抖

只在答案真的变化时才发请求——切题、重新渲染都不该触发保存。

## 评估接口改动

这是本次唯一的业务逻辑改动，需要测试覆盖。

`buildEvaluationPrompt` 的题目块按有无答案分成两类：

**填了答案的题**追加一行确定的答案，并在 system prompt 中明确要求：这些题的答案已给出，直接据此评分，不要再去面试记录里查找。

**没填答案的题**保持现状，让模型从 `transcript` 里定位。

system prompt 增加一条规则：

> Some questions include a recorded answer inline. For those, score the recorded answer directly — do not search the transcript for them. For questions without a recorded answer, locate the answer in the transcript as before.

用户提示词里的题目块格式：

```
2. [id: q2] [dimension: logic]
Question: 讲一个你排查过的线上问题
What it probes: 看拆解路径
Excellent answer: 有假设有验证
Passing answer: 能说清现象
Failing answer: 只复述结论
Reference points: 定位手段; 验证方式
Candidate's recorded answer: 双十一订单页白屏，先看监控…     ← 仅在有答案时出现
```

服务端对 transcript 的前置校验要放宽：现在是「没有 transcript 就返回 400」，改为「既没有 transcript、又没有任何一道题填了答案，才返回 400」。只逐题记录、不粘贴整段记录是完全合理的用法。

## 评价 Tab

粘贴框保留，位置和交互不变，但补一行说明它现在只负责未逐题记录的部分（i18n 新增一个键）。

## 顺带收窄的空旷

同一根因也存在于另外两个页面，一并处理：

- 岗位概览页：内容区限 `max-w-4xl`（896px），不再拉满 1600
- 评价 Tab 的报告区：限 `max-w-5xl`（1024px）

面试题页因为是主从双栏、横向空间用得满，不限宽。

## 组件清单

**新建：**

| 文件 | 职责 |
|---|---|
| `src/components/recruit/question-list.tsx` | 左侧题目列表（已答标记、选中态、进度） |
| `src/components/recruit/question-detail.tsx` | 右侧当前题详情 + 答案输入 + 自动保存 |
| `src/lib/recruit/answers.ts` | 纯函数：统计已记录题数、判断是否有任何答案 |
| `src/lib/recruit/answers.test.ts` | 上者的测试 |

**修改：**

| 文件 | 改动 |
|---|---|
| `src/types/recruit.ts` | `InterviewQuestion` 加可选 `answer` |
| `src/components/recruit/questions-panel.tsx` | 改为主从双栏容器，去掉折叠与「已问」状态 |
| `src/lib/ai/recruit-prompts.ts` | 题目块按有无答案分流 + system prompt 增规则 |
| `src/lib/ai/recruit-prompts.test.ts` | 覆盖两类题目的 prompt 构建 |
| `src/app/api/recruit/candidates/[id]/evaluation/route.ts` | 前置校验放宽 |
| `src/components/recruit/job-overview.tsx` | 内容限宽 |
| `src/components/recruit/evaluation-panel.tsx` | 报告区限宽 + 粘贴框说明 |
| `messages/zh.json` / `messages/en.json` | 新增键 |

**删除：** `src/components/recruit/question-card.tsx`（被 `question-list` + `question-detail` 取代）

## 新增 i18n

| 键 | 中文 | 英文 |
|---|---|---|
| `questions.answer` | 候选人回答 | Candidate's answer |
| `questions.answerPlaceholder` | 边问边记，不用整理 | Jot it down as they answer |
| `questions.recorded` | {done}/{total} 已记录 | {done}/{total} recorded |
| `questions.saving` | 保存中… | Saving… |
| `questions.saved` | 已保存 | Saved |
| `questions.saveRetry` | 保存失败，点击重试 | Save failed — retry |
| `questions.selectOne` | 从左侧选择一道题 | Pick a question on the left |
| `evaluation.transcriptSupplement` | 逐题已记录 {done} 题，这里补充未逐题记录的部分 | {done} answers recorded per question — add anything else here |

## 测试

纯函数写 vitest：

- `countAnswered(questions)` → 已填答案的题数（空白字符串不算）
- `hasAnyAnswer(questions)` → 是否至少有一道题填了答案，供 API 前置校验用

`buildEvaluationPrompt` 的测试补两条：有答案的题在 prompt 里出现 `recorded answer` 行；没答案的题不出现。

UI 无自动化测试（仓库无 jsdom / testing-library），靠 type-check、生产构建、Chrome headless 截图核对。截图按 `docs/design/screenshots/` 归档。

## 明确不做

键盘快捷键切题、答案的富文本或语音输入、答案的历史版本、逐题手动打分（评分仍由 AI 出）、答案的字数统计与计时。
