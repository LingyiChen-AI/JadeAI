# 招聘模块 UI 重新设计

日期：2026-08-20
状态：设计已确认，待实现
前置：`docs/superpowers/specs/2026-08-19-recruiter-side-design.md`（功能设计，已实现并验证）

## 背景

招聘模块（`/recruit`）功能已完整实现并通过验证，但实测截图暴露出交互与布局问题。本设计只改 UI 与交互，**不改任何业务逻辑、数据模型、API 契约**。

### 实测诊断（1440×900 视口，Chrome headless 截图）

**面试题 Tab —— 最严重。** 5 道题渲染出 2400px 高，要滚 3 屏；默认配置是 10 题，即 5 屏。每张题卡把题干、考察点、优秀/合格/不合格三档标准、追问建议、参考要点全部平铺，单卡 350px。面试官现场需要的是「下一题问什么」，而不是一次读完全部评分细则。展开态内部，四个小标题（考察点/评分标准/追问建议/参考答案要点）字号与颜色完全一致，堆叠后没有视觉层次。

**岗位详情页。** 1440×900 屏幕只用了上方约 40%，下方全空。候选人表格 5 列拉满全宽，姓名列与状态列之间空出约 350px。JD 卡片放一行正文占 250px 高。

**简历 Tab。** 上传区是 280px 高的空卡片，中间只有一个图标、一个按钮、一行小字。粘贴用的 `<Textarea rows={16}>` 实际渲染只有约 3 行高——`rows` 被组件默认样式覆盖，这是真 bug。上传与粘贴两个入口并列，上传的视觉权重压倒性，但粘贴才是更常用的路径。

**三个 Tab。** 字号小、挤在左上角，看不出「简历 → 面试题 → 评价」是强顺序流程。用户点进「面试题」才被告知「请先上传简历」——靠撞墙来发现顺序。

**两级页面。** 岗位详情与候选人工作台是两个路由，点候选人跳走。横向对比候选人时要反复跳页，而横向对比正是「岗位下挂多候选人」这个数据模型的核心价值。

## 已确认的产品决策

| 决策点 | 结论 |
|---|---|
| 面试题的使用场景 | **面试中实时看** → 题卡默认折叠，一屏扫完 |
| 岗位/候选人的导航结构 | **左栏候选人 + 右侧工作台**，不跳页 |
| 新建岗位的维度配置 | **标签多选**，选中才展开权重滑块 |

## A. 导航结构

`/recruit/[jobId]` 从单页变成工作区，用 App Router 的 layout 承载左栏：

```
src/app/[locale]/recruit/[jobId]/layout.tsx        岗位头部 + 左栏候选人列表
  ├ src/app/[locale]/recruit/[jobId]/page.tsx      右侧默认：岗位概览
  └ src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx   右侧：候选人工作台
```

URL 保持路径式，可分享、可刷新。左栏属于 layout，切换候选人走客户端导航，左栏不重新挂载，滚动位置与搜索词不丢。

**布局**：左栏固定 280px，右侧 `flex-1 min-w-0`。整体容器从 `max-w-7xl` 放宽到 `max-w-[1600px]`，让 1440 屏不再大片留白。

**数据获取**：layout 是 Server Component 不便带 fingerprint 头，因此左栏做成客户端组件 `<CandidateSidebar jobId>`，自行调用 `GET /api/recruit/jobs/[id]` 拿 `{ job, candidates }`。右侧页面各自取自己的数据。这会让岗位数据被取两次（layout 一次、概览页一次）。接受这个代价：改动面最小，且都是本地请求；不为此引入 Context 或状态库。

### 左栏候选人列表

- 顶部：搜索框（按姓名过滤，纯前端）+「添加候选人」按钮
- 每行 56px：姓名 · 状态圆点 · 总分 · 结论徽章
- 排序：总分降序，未评价的沉到最后
- 选中行：左侧 2px brand 色边条 + 浅底色
- 空态：虚线框 + 「还没有候选人」

状态圆点配色：`pending` 灰、`questions_ready` 琥珀、`evaluated` 绿。

## B. 岗位概览（右侧默认视图）

替换原岗位详情页的内容区。

- **统计条**：`5 位候选人 · 3 已评价 · 均分 76`。均分只统计已评价者；无人评价时不显示均分。
- **JD**：默认折叠为 3 行（`line-clamp-3`），下方「展开全文 / 收起」切换
- **维度**：chip 形式，每个显示 `专业技能 ×3 · 6题`。题数由 `allocateQuestions(dimensions, questionCount)` 现算，权重的效果直接可见
- **候选人对比表**：仅当已评价人数 ≥ 2 时渲染。行是候选人，列是各维度得分 + 总分 + 结论。这是横向对比的落点。
- 岗位操作（编辑/删除）移到 layout 的岗位头部，概览页不再重复

## C. 候选人工作台

### 步骤条替代 Tab

三个 Tab 升级为带序号与完成态的步骤条，仍可自由点击（不强制顺序，面试中要在题目与评价之间来回切）：

```
① 简历 ✓  →  ② 面试题 ✓  →  ③ 评价
```

- 已完成的步骤显示对勾（简历：`resumeText` 非空；面试题：`questions` 非空；评价：`evaluation` 非空）
- 未满足前置条件的步骤仍可点，进去后显示引导文案（沿用现有的 `needResume` / `needQuestions`）
- 底层仍用 `Tabs` 组件，只换 `TabsTrigger` 的呈现

### 简历 Tab

- 上传区从 280px 高卡片压成 96px 横向 dropzone：图标、说明文字、按钮同一行，左对齐
- 粘贴 textarea 加 `min-h-[320px]`，覆盖组件默认样式（修 `rows={16}` 失效的 bug）
- 两个入口上下排列，视觉权重拉平
- 「已保存」状态指示保留（已在 `c00e99e` 实现）

### 面试题 Tab

**概览条**：`共 5 题 · 预计 42 分钟 · 逻辑思维 5`。维度分布按题目实际归属统计，不是按配置。

**题卡默认折叠**，折叠态单行 56px：

```
☐  1. 你在低代码平台里做断点续传，分块大小是怎么定的？   [逻辑思维] ● 8分钟   ⌄
```

- 左侧「已问」勾选框：勾选后题干变灰并加删除线，纯前端状态（`useState` 的 Set），不落库——面试中的临时进度标记，刷新丢失可接受
- 点击行任意位置展开该题；再点收起
- 右上角「全部展开 / 全部收起」开关，供会前通读

**展开态的层次**：

- 小标题：`text-[11px] uppercase tracking-wide text-zinc-400`
- 正文：`text-sm text-zinc-700 dark:text-zinc-300`
- 三档评分标准改为左侧 2px 色条 + 单行（绿/琥珀/红），不再是三行同色灰字
- 追问建议、参考要点保持列表，但缩进对齐到小标题

删除按钮移入展开态，不再孤零零挂在折叠行右侧 900px 外。

### 评价 Tab

- **未生成时**：记录输入区占主体，保持现状
- **已生成后**：记录折叠成一行 `面试记录（1,240 字）· 展开编辑`，报告占主体
- **报告头**：总分 · `4/5 题作答` · 结论徽章，一行放完（`answeredCount` i18n 键已存在）
- **雷达图**：缩到 240px 高，与「优势 / 顾虑」左右并排（图占 5/12，文字占 7/12），不再各占一整行
- **维度少于 3 个时不画雷达图**，降级为横向条形。雷达图在几何上至少要 3 个轴，1-2 个维度是用户真实会配出来的，硬画只会得到一个孤零零的点加一条斜刻度轴。条形里 `weight === 0`（该维度一题没问到）显示「—」且条为空，与对比表的处理一致。
- 逐题点评保持纵向列表，但未作答的题折叠成一行

## D. 新建岗位对话框

- 8 个预置维度改成两行 chip，未选中为描边、选中为 brand 底色
- 仅选中的维度在下方展开权重滑块，一行放两个
- 自定义维度输入框保留在 chip 区下方
- 弹窗高度**保持 `max-h-[85vh]`**。实现时试过降到 70vh，反而把内容（实测 666px）卡在了 628px 的上限之下，保存按钮被裁切。这次重构的收益是内容本身变矮了，不该再拿一个更小的 cap 去卡它。
- 权重区**单列排布**。试过两列，滑块被同行的固定宽度元素（标签/数值/题数）挤到接近 0 宽，只剩一个孤零零的圆点没有轨道。

## E. 响应式

- 左栏在 `<1024px` 收成顶部下拉选择器（`Select`），右侧内容占满
- 候选人对比表外层加 `overflow-x-auto`
- 题卡折叠行在窄屏隐藏时长与难度，只留题干与维度

## F. 组件清单

**新建：**

| 文件 | 职责 |
|---|---|
| `src/app/[locale]/recruit/[jobId]/layout.tsx` | 工作区骨架：岗位头部 + 左栏 + children |
| `src/components/recruit/candidate-sidebar.tsx` | 左栏候选人列表（搜索、排序、选中态、窄屏下拉） |
| `src/components/recruit/job-overview.tsx` | 岗位概览：统计条、JD 折叠、维度 chip |
| `src/components/recruit/candidate-compare-table.tsx` | 候选人横向对比表 |
| `src/components/recruit/step-tabs.tsx` | 带序号与完成态的步骤条 |
| `src/components/recruit/resume-dropzone.tsx` | 横向紧凑上传区 |
| `src/components/recruit/dimension-chips.tsx` | 维度标签多选 + 按需展开权重 |

**重写：**

| 文件 | 改动 |
|---|---|
| `src/app/[locale]/recruit/[jobId]/page.tsx` | 只渲染 `<JobOverview>` |
| `src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx` | 去掉自带的返回链接与标题（移入 layout） |
| `src/components/recruit/candidate-workspace.tsx` | 用 `<StepTabs>`，去掉面包屑与岗位头部 |
| `src/components/recruit/question-card.tsx` | 折叠/展开、已问勾选、层次重排 |
| `src/components/recruit/questions-panel.tsx` | 概览条、全部展开开关、折叠状态管理 |
| `src/components/recruit/resume-panel.tsx` | 用 `<ResumeDropzone>`、修 textarea 高度 |
| `src/components/recruit/evaluation-panel.tsx` | 记录折叠、报告头、雷达图并排 |
| `src/components/recruit/job-form-dialog.tsx` | 用 `<DimensionChips>` |
| `src/components/recruit/dimension-editor.tsx` | 删除，被 `<DimensionChips>` 取代 |
| `src/components/recruit/candidate-table.tsx` | 删除，被 `<CandidateSidebar>` 取代 |

## G. 新增 i18n

`recruit` 命名空间下新增（zh/en 各一份，路径必须完全一致）：

| 键 | 中文 | 英文 |
|---|---|---|
| `overview.stats` | `{total} 位候选人 · {evaluated} 已评价` | `{total} candidates · {evaluated} evaluated` |
| `overview.avgScore` | `均分 {score}` | `Avg {score}` |
| `overview.expandJd` | 展开全文 | Show full JD |
| `overview.collapseJd` | 收起 | Collapse |
| `overview.compare` | 候选人对比 | Candidate comparison |
| `overview.selectCandidate` | 从左侧选择一位候选人 | Pick a candidate on the left |
| `candidates.search` | 搜索候选人 | Search candidates |
| `questions.summary` | 共 {count} 题 · 预计 {minutes} 分钟 | {count} questions · {minutes} min |
| `questions.expandAll` | 全部展开 | Expand all |
| `questions.collapseAll` | 全部收起 | Collapse all |
| `questions.asked` | 已问 | Asked |
| `evaluation.transcriptCollapsed` | 面试记录（{chars} 字）· 展开编辑 | Transcript ({chars} chars) · Edit |
| `steps.resume` / `steps.questions` / `steps.evaluation` | 简历 / 面试题 / 评价 | Resume / Questions / Evaluation |

## H. 测试

本仓库无 jsdom / testing-library，UI 不写自动化测试（不为此引入新依赖）。

可测的纯逻辑抽到 `src/lib/recruit/` 并写 vitest：

- `summarizeQuestions(questions, dimensions)` → `{ count, totalMinutes, byDimension }`，供概览条使用
- `sortCandidatesForSidebar(candidates)` → 总分降序、未评价沉底、同分按姓名

其余靠 `pnpm type-check`、生产构建、Chrome headless 截图核对。

## 实现中踩到的坑

**`Card` 组件自带 `flex flex-col`。** 想在 Card 上直接排横向布局时，必须显式加 `flex-row`——传 `flex-wrap` 之类不会覆盖它（tailwind-merge 认为二者不冲突）。同样，Card 的直接子元素默认被 `align-items: stretch` 拉满宽，行内链接式按钮要加 `self-start` 才会收缩到内容宽度，否则配合 `<button>` 的 UA 默认 `text-align: center` 会视觉居中。

这个坑在本次重构里踩到两次：JD「展开全文」按钮居中、评价报告头上下堆叠。

## I. 硬性约束

- **不改业务逻辑**：fetch 的 URL、请求体、响应处理、状态流转、AI 调用一律不动
- **不改数据模型与 API 契约**
- 不动 `src/components/recruit/` 与 `src/app/[locale]/recruit/` 之外的文件，`messages/*.json` 除外（只增键，不改既有文案）
- 遵守全站设计规范（`bg-brand hover:bg-brand-hover` 主按钮、`AlertDialog` 而非 `confirm()`、`cursor-pointer`、虚线框空态）

## J. 明确不做

题目拖拽排序、候选人批量操作、打印专用样式、题目编辑（只支持删除）、「已问」状态持久化、候选人对比的图表可视化。
