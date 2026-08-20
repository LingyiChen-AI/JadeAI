# 招聘模块 UI 重新设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已实现的招聘模块从「两级页面 + 全展开题卡」改造成「左栏候选人 + 右侧工作台 + 默认折叠题卡」，解决信息密度过低与流程不可见的问题。

**Architecture:** 用 App Router 的 `[jobId]/layout.tsx` 承载左栏，切候选人走客户端导航不重挂载。题卡默认折叠，面试中一屏扫完。**不改任何业务逻辑、数据模型、API 契约**——所有 fetch 的 URL、请求体、响应处理原样保留。

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind 4 + shadcn/ui · next-intl · recharts · vitest

**Spec:** `docs/superpowers/specs/2026-08-20-recruiter-ui-redesign-design.md`

---

## 关键约定（先读这段）

1. **这是纯 UI 改造。** fetch 的 URL、method、请求体、响应字段处理、状态流转一律不动。改坏了业务逻辑比 UI 难看严重得多。
2. **全站设计规范**（已在上一轮对齐，继续遵守）：
   - 主按钮 `className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"`
   - 次按钮 `variant="outline" className="cursor-pointer gap-2"`
   - 确认弹窗一律 `AlertDialog`，**禁止 `confirm()`**
   - 空态用虚线框 `rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 py-16`，不用 `<Card>`
   - 所有可点击元素加 `cursor-pointer`
   - 页面标题 `text-2xl font-bold`
3. **i18n**：zh/en 键路径必须完全一致，否则英文界面漏裸 key。
4. **本仓库没有 jsdom / testing-library**，UI 不写自动化测试，也不要为此装依赖。只有纯函数写 vitest。
5. **`pnpm lint` 基线本就失败**（main 上 1340 个问题，多为 `no-explicit-any`）。判断标准是「新文件不引入 `no-explicit-any` 之外的新规则违规」，不是零错误。
6. **`pnpm type-check` 必须零错误。**
7. **dev server 可能在后台跑（端口 3000，连 PG）。不要 kill 也不要重启**——需要重启时告诉控制方。
8. **git commit message 禁止带任何 `Co-Authored-By` 后缀。**

**每个任务结束都要 commit。**

---

## 现状要点（省得你去翻）

**`src/components/ui/textarea.tsx`** 的类名含 `field-sizing-content min-h-16`——这就是 `rows={16}` 不生效的原因，浏览器按内容自适应高度。加 `min-h-[320px]` 即可修复。

**`src/components/ui/tabs.tsx`** 的 `TabsList` 支持 `variant="line"`（下划线样式，无背景块）。步骤条用它，不要自己造。

**`src/lib/recruit/scoring.ts`** 已有 `allocateQuestions(dimensions, total)` 和 `computeOverallScore(scores)`，直接用。

**`src/lib/recruit/dimensions.ts`** 已有 `PRESET_DIMENSION_KEYS`（8 个 key 的 `as const` 数组）和 `defaultDimensions(labelOf)`。

**类型在 `src/types/recruit.ts`**：`DimensionConfig{key,label,weight,custom}`、`InterviewQuestion{id,dimension,question,intent,rubric{excellent,pass,fail},followUps[],referencePoints[],estimatedMinutes,difficulty}`、`DimensionScore{key,label,score,weight}`、`QuestionEvaluation{questionId,question,answerSummary,answered,score,highlights,weaknesses}`、`CandidateSummary{id,name,status,overallScore,recommendation,createdAt}`、`RecruitJob`、`RecruitCandidate`、`RecruitEvaluation`、`Recommendation`。

**已跑通的 API**：
```
GET /api/recruit/jobs/[id]         → { job, candidates }   candidates 是 CandidateSummary[]
GET /api/recruit/candidates/[id]   → { candidate, job, evaluation }
```

**客户端 fetch 约定**：带 `x-fingerprint`（来自 `useFingerprint()`）；AI 接口另带 `getAIHeaders()`（来自 `@/stores/settings-store`）。

**路由导航**：`Link` / `useRouter` 一律从 `@/i18n/routing` 导入，不要用 `next/link`、`next/navigation`，否则 locale 前缀会丢。

---

## 文件结构

**新建：**

| 文件 | 职责 |
|---|---|
| `src/lib/recruit/summary.ts` | 纯函数：题目概览统计、候选人侧栏排序 |
| `src/lib/recruit/summary.test.ts` | 上者的测试 |
| `src/components/recruit/dimension-chips.tsx` | 维度标签多选 + 选中才展开权重 |
| `src/app/[locale]/recruit/[jobId]/layout.tsx` | 工作区骨架：岗位头部 + 左栏 + children |
| `src/components/recruit/candidate-sidebar.tsx` | 左栏候选人列表 |
| `src/components/recruit/job-overview.tsx` | 岗位概览 |
| `src/components/recruit/candidate-compare-table.tsx` | 候选人横向对比表 |
| `src/components/recruit/step-tabs.tsx` | 带序号与完成态的步骤条 |
| `src/components/recruit/resume-dropzone.tsx` | 横向紧凑上传区 |

**重写/修改：**

| 文件 | 改动 |
|---|---|
| `src/app/[locale]/recruit/layout.tsx` | 容器放宽到 `max-w-[1600px]` |
| `src/components/recruit/job-list.tsx` | 自带 `max-w-7xl` 包裹（列表页不需要 1600 宽） |
| `src/app/[locale]/recruit/[jobId]/page.tsx` | 只渲染 `<JobOverview>`，从 210 行降到约 15 行 |
| `src/app/[locale]/recruit/[jobId]/c/[candidateId]/page.tsx` | 不变（仍渲染 `<CandidateWorkspace>`） |
| `src/components/recruit/candidate-workspace.tsx` | 去掉面包屑与岗位头部（移入 layout），改用 `<StepTabs>` |
| `src/components/recruit/question-card.tsx` | 折叠/展开、已问勾选、层次重排 |
| `src/components/recruit/questions-panel.tsx` | 概览条、全部展开开关、折叠状态管理 |
| `src/components/recruit/resume-panel.tsx` | 用 `<ResumeDropzone>`、修 textarea 高度 |
| `src/components/recruit/evaluation-panel.tsx` | 记录折叠、报告头、雷达图并排 |
| `src/components/recruit/job-form-dialog.tsx` | 用 `<DimensionChips>` |
| `messages/zh.json` / `messages/en.json` | 新增键 |

**删除：**

| 文件 | 原因 |
|---|---|
| `src/components/recruit/dimension-editor.tsx` | 被 `<DimensionChips>` 取代（仅 job-form-dialog 引用） |
| `src/components/recruit/candidate-table.tsx` | 被 `<CandidateSidebar>` 取代（仅 `[jobId]/page.tsx` 引用） |

---

## Task 1: 纯函数与测试（TDD）

**Files:**
- Create: `src/lib/recruit/summary.test.ts`
- Create: `src/lib/recruit/summary.ts`

题目概览条和侧栏排序是这次唯二有逻辑的地方，抽出来测。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/recruit/summary.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { summarizeQuestions, sortCandidatesForSidebar } from './summary';
import type { CandidateSummary, DimensionConfig, InterviewQuestion } from '@/types/recruit';

function q(id: string, dimension: string, minutes: number): InterviewQuestion {
  return {
    id,
    dimension,
    question: 'Q',
    intent: 'I',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    followUps: [],
    referencePoints: [],
    estimatedMinutes: minutes,
    difficulty: 'medium',
  };
}

const DIMS: DimensionConfig[] = [
  { key: 'professional', label: '专业技能', weight: 3, custom: false },
  { key: 'logic', label: '逻辑思维', weight: 2, custom: false },
];

describe('summarizeQuestions', () => {
  it('统计题数与总时长', () => {
    const result = summarizeQuestions([q('1', 'logic', 8), q('2', 'logic', 10)], DIMS);
    expect(result.count).toBe(2);
    expect(result.totalMinutes).toBe(18);
  });

  it('按维度分组，用 label 而不是 key', () => {
    const result = summarizeQuestions(
      [q('1', 'logic', 5), q('2', 'professional', 5), q('3', 'logic', 5)],
      DIMS,
    );
    expect(result.byDimension).toEqual([
      { key: 'professional', label: '专业技能', count: 1 },
      { key: 'logic', label: '逻辑思维', count: 2 },
    ]);
  });

  it('维度顺序跟随配置，而不是题目出现顺序', () => {
    const result = summarizeQuestions([q('1', 'logic', 5), q('2', 'professional', 5)], DIMS);
    expect(result.byDimension.map((d) => d.key)).toEqual(['professional', 'logic']);
  });

  it('配置里没有的维度也要统计，label 退化成 key', () => {
    const result = summarizeQuestions([q('1', 'unknown-dim', 5)], DIMS);
    const unknown = result.byDimension.find((d) => d.key === 'unknown-dim');
    expect(unknown).toEqual({ key: 'unknown-dim', label: 'unknown-dim', count: 1 });
  });

  it('零题时不报错', () => {
    expect(summarizeQuestions([], DIMS)).toEqual({ count: 0, totalMinutes: 0, byDimension: [] });
  });
});

describe('sortCandidatesForSidebar', () => {
  function c(name: string, score: number | null): CandidateSummary {
    return {
      id: name,
      name,
      status: score === null ? 'pending' : 'evaluated',
      overallScore: score,
      recommendation: score === null ? null : 'hire',
      createdAt: '2026-08-20T00:00:00.000Z',
    };
  }

  it('按总分降序', () => {
    const result = sortCandidatesForSidebar([c('低', 60), c('高', 90), c('中', 75)]);
    expect(result.map((x) => x.name)).toEqual(['高', '中', '低']);
  });

  it('未评价的沉到最后，哪怕分数为 0 的排在它前面', () => {
    const result = sortCandidatesForSidebar([c('没评价', null), c('零分', 0)]);
    expect(result.map((x) => x.name)).toEqual(['零分', '没评价']);
  });

  it('同分按姓名排，保证顺序稳定', () => {
    const result = sortCandidatesForSidebar([c('B', 80), c('A', 80)]);
    expect(result.map((x) => x.name)).toEqual(['A', 'B']);
  });

  it('多个未评价的之间也按姓名排', () => {
    const result = sortCandidatesForSidebar([c('乙', null), c('甲', null)]);
    expect(result.map((x) => x.name)).toEqual(['甲', '乙']);
  });

  it('不修改传入的数组', () => {
    const input = [c('低', 60), c('高', 90)];
    sortCandidatesForSidebar(input);
    expect(input.map((x) => x.name)).toEqual(['低', '高']);
  });

  it('空数组返回空数组', () => {
    expect(sortCandidatesForSidebar([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm vitest run src/lib/recruit/summary.test.ts`
Expected: FAIL —— `Failed to resolve import "./summary"`

- [ ] **Step 3: 写实现**

创建 `src/lib/recruit/summary.ts`：

```ts
import type { CandidateSummary, DimensionConfig, InterviewQuestion } from '@/types/recruit';

export interface DimensionCount {
  key: string;
  label: string;
  count: number;
}

export interface QuestionsSummary {
  count: number;
  totalMinutes: number;
  byDimension: DimensionCount[];
}

/**
 * 面试题 Tab 顶部概览条的数据。
 *
 * 维度顺序跟随岗位配置而不是题目出现顺序——面试官配的时候是那个顺序，
 * 看统计时顺序一致才对得上。配置外的维度（模型偶尔会返回意外 key）
 * 追加在后面，不丢。
 */
export function summarizeQuestions(
  questions: InterviewQuestion[],
  dimensions: DimensionConfig[],
): QuestionsSummary {
  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.dimension, (counts.get(q.dimension) ?? 0) + 1);
  }

  const byDimension: DimensionCount[] = [];
  for (const d of dimensions) {
    const count = counts.get(d.key);
    if (count) {
      byDimension.push({ key: d.key, label: d.label, count });
      counts.delete(d.key);
    }
  }
  // 配置里没有的维度，label 退化成 key
  for (const [key, count] of counts) {
    byDimension.push({ key, label: key, count });
  }

  return {
    count: questions.length,
    totalMinutes: questions.reduce((sum, q) => sum + q.estimatedMinutes, 0),
    byDimension,
  };
}

/**
 * 左栏候选人排序：总分降序，未评价的沉底。
 *
 * 未评价的混在中间，横向对比就没法看了。同分按姓名排是为了顺序稳定，
 * 否则每次渲染顺序可能变。
 */
export function sortCandidatesForSidebar(candidates: CandidateSummary[]): CandidateSummary[] {
  return [...candidates].sort((a, b) => {
    const aScored = a.overallScore !== null;
    const bScored = b.overallScore !== null;
    if (aScored !== bScored) return aScored ? -1 : 1;
    if (aScored && bScored && a.overallScore !== b.overallScore) {
      return (b.overallScore as number) - (a.overallScore as number);
    }
    return a.name.localeCompare(b.name);
  });
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm vitest run src/lib/recruit/summary.test.ts`
Expected: PASS，11 个测试全绿

- [ ] **Step 5: 跑全量测试**

Run: `pnpm test`
Expected: 214 passed（改动前 203 + 新增 11）

- [ ] **Step 6: Commit**

```bash
git add src/lib/recruit/summary.ts src/lib/recruit/summary.test.ts
git commit -m "feat(recruit): 题目概览统计与候选人侧栏排序"
```

---

## Task 2: i18n 新增文案

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

先把文案铺好，后面的组件才有 key 可用。

**重要：用定点插入（Edit 工具按锚点插入），不要 `JSON.parse` 再 `JSON.stringify` 整个文件重写**——那样会把 `editor.months` 里的数字键 `"10"`/`"11"`/`"12"` 重排到 `"01"` 前面（JS 对象整数键按数值优先枚举），污染无关区块的 diff。

- [ ] **Step 1: zh.json 新增 overview 与 steps 块**

在 `messages/zh.json` 的 `"recruit"` 对象内，`"dimensions"` 块**之前**插入：

```json
  "overview": {
    "stats": "{total} 位候选人 · {evaluated} 已评价",
    "avgScore": "均分 {score}",
    "expandJd": "展开全文",
    "collapseJd": "收起",
    "compare": "候选人对比",
    "selectCandidate": "从左侧选择一位候选人"
  },
  "steps": {
    "resume": "简历",
    "questions": "面试题",
    "evaluation": "评价"
  },
```

- [ ] **Step 2: zh.json 在 candidates 块内新增 search**

找到 `"candidates"` 块里的 `"namePlaceholder": "候选人姓名",`，在其后插入：

```json
      "search": "搜索候选人",
```

- [ ] **Step 3: zh.json 在 questions 块内新增四个键**

找到 `"questions"` 块里的 `"copied": "已复制到剪贴板",`，在其后插入：

```json
      "summary": "共 {count} 题 · 预计 {minutes} 分钟",
      "expandAll": "全部展开",
      "collapseAll": "全部收起",
      "asked": "已问",
```

- [ ] **Step 4: zh.json 在 evaluation 块内新增一个键**

找到 `"evaluation"` 块里的 `"transcriptHint": "不需要逐题整理，速记或完整记录都可以",`，在其后插入：

```json
      "transcriptCollapsed": "面试记录（{chars} 字）· 展开编辑",
```

- [ ] **Step 5: en.json 做完全对应的四处插入**

`"dimensions"` 之前：

```json
  "overview": {
    "stats": "{total} candidates · {evaluated} evaluated",
    "avgScore": "Avg {score}",
    "expandJd": "Show full JD",
    "collapseJd": "Collapse",
    "compare": "Candidate comparison",
    "selectCandidate": "Pick a candidate on the left"
  },
  "steps": {
    "resume": "Resume",
    "questions": "Questions",
    "evaluation": "Evaluation"
  },
```

`"namePlaceholder": "Candidate name",` 之后：

```json
      "search": "Search candidates",
```

`"copied": "Copied to clipboard",` 之后：

```json
      "summary": "{count} questions · {minutes} min",
      "expandAll": "Expand all",
      "collapseAll": "Collapse all",
      "asked": "Asked",
```

`"transcriptHint": "No need to organize by question; rough notes work",` 之后：

```json
      "transcriptCollapsed": "Transcript ({chars} chars) · Edit",
```

- [ ] **Step 6: 验证 key 路径递归一致**

Run:
```bash
node -e "
function paths(o,p=''){return Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?paths(v,p+k+'.'):[p+k]);}
const z=require('./messages/zh.json').recruit,e=require('./messages/en.json').recruit;
const pz=paths(z).sort(),pe=paths(e).sort();
console.log('zh:',pz.length,'en:',pe.length,'一致:',JSON.stringify(pz)===JSON.stringify(pe));
"
```
Expected: `zh: 120 en: 120 一致: true`（改动前是 105，本任务新增 15 个）

- [ ] **Step 7: 确认 diff 范围干净**

Run: `git diff --numstat messages/`
Expected: 每个文件约 18 行新增、0 行删除。**如果出现删除行，说明你重写了整个文件，回退重来。**

- [ ] **Step 8: Commit**

```bash
git add messages/
git commit -m "feat(recruit): UI 重构所需的新增文案"
```

---

## Task 3: 维度标签多选组件

**Files:**
- Create: `src/components/recruit/dimension-chips.tsx`
- Modify: `src/components/recruit/job-form-dialog.tsx`
- Delete: `src/components/recruit/dimension-editor.tsx`

原来 8 个维度各占一行（开关 + 名称 + 滑块 + 数字 + 题数），8 行 40 个控件塞在滚动弹窗里。改成两行 chip，选中的才展开权重。

- [ ] **Step 1: 创建组件**

创建 `src/components/recruit/dimension-chips.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { PRESET_DIMENSION_KEYS } from '@/lib/recruit/dimensions';
import { allocateQuestions } from '@/lib/recruit/scoring';
import { cn } from '@/lib/utils';
import type { DimensionConfig } from '@/types/recruit';

interface DimensionChipsProps {
  value: DimensionConfig[];
  onChange: (next: DimensionConfig[]) => void;
  /** 传入后每个已选维度显示分到几题，权重的效果肉眼可见 */
  questionCount?: number;
}

export function DimensionChips({ value, onChange, questionCount }: DimensionChipsProps) {
  const t = useTranslations('recruit.dimensions');
  const [customName, setCustomName] = useState('');

  const selectedByKey = new Map(value.map((d) => [d.key, d]));
  const allocation = questionCount ? allocateQuestions(value, questionCount) : null;

  function togglePreset(key: string) {
    if (selectedByKey.has(key)) {
      onChange(value.filter((d) => d.key !== key));
    } else {
      onChange([...value, { key, label: t(key), weight: 2, custom: false }]);
    }
  }

  function setWeight(key: string, weight: number) {
    onChange(value.map((d) => (d.key === key ? { ...d, weight } : d)));
  }

  function addCustom() {
    const name = customName.trim();
    if (!name || selectedByKey.has(name)) return;
    // 自定义维度的 key 用名字本身，好在 prompt 和打分结果里对得上
    onChange([...value, { key: name, label: name, weight: 2, custom: true }]);
    setCustomName('');
  }

  function remove(key: string) {
    onChange(value.filter((d) => d.key !== key));
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('title')}</Label>
        <p className="mt-1 text-xs text-zinc-500">{t('hint')}</p>
      </div>

      {/* 预置维度：两行 chip，未选中时不占纵向空间 */}
      <div className="flex flex-wrap gap-2">
        {PRESET_DIMENSION_KEYS.map((key) => {
          const selected = selectedByKey.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => togglePreset(key)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors',
                selected
                  ? 'border-brand bg-brand text-white'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300',
              )}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
              {t(key)}
            </button>
          );
        })}
        {value
          .filter((d) => d.custom)
          .map((d) => (
            <span
              key={d.key}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand bg-brand/10 px-3 py-1.5 text-sm text-brand"
            >
              {d.label}
              <button
                type="button"
                onClick={() => remove(d.key)}
                className="cursor-pointer"
                aria-label={d.label}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
      </div>

      {/* 权重：只为已选中的维度展开，两列排布 */}
      {value.length > 0 && (
        <div className="grid gap-x-6 gap-y-3 rounded-lg border bg-zinc-50 p-4 sm:grid-cols-2 dark:bg-zinc-900">
          {value.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400">
                {d.label}
              </span>
              <Slider
                className="flex-1 cursor-pointer"
                min={1}
                max={5}
                step={1}
                value={[d.weight]}
                onValueChange={([w]) => setWeight(d.key, w)}
              />
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                {d.weight}
              </span>
              {allocation && (
                <span className="w-12 shrink-0 text-right text-xs text-zinc-400">
                  {t('perDimension', { count: allocation[d.key] ?? 0 })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

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
        <Button type="button" variant="outline" onClick={addCustom} className="cursor-pointer gap-2">
          <Plus className="h-4 w-4" />
          {t('addCustom')}
        </Button>
      </div>

      {value.length === 0 && <p className="text-sm text-red-500">{t('atLeastOne')}</p>}
    </div>
  );
}
```

- [ ] **Step 2: 接入 job-form-dialog**

`src/components/recruit/job-form-dialog.tsx`：

把 `import { DimensionEditor } from './dimension-editor';` 改成：
```tsx
import { DimensionChips } from './dimension-chips';
```

把 JSX 里的：
```tsx
          <DimensionEditor
            value={dimensions}
            onChange={setDimensions}
            questionCount={questionCount}
          />
```
改成：
```tsx
          <DimensionChips
            value={dimensions}
            onChange={setDimensions}
            questionCount={questionCount}
          />
```

同一文件里把 `DialogContent` 的 `max-h-[85vh]` 改成 `max-h-[70vh]`。

- [ ] **Step 3: 删除旧组件**

Run: `git rm src/components/recruit/dimension-editor.tsx`

- [ ] **Step 4: 类型检查**

Run: `pnpm type-check`
Expected: 零错误。若报找不到 `dimension-editor`，说明还有别处引用，`grep -rn "DimensionEditor" src/` 查出来改掉。

- [ ] **Step 5: 视觉核对**

dev server 应已在端口 3000 运行。用 Chrome headless 截图（项目已有 `puppeteer-core` 依赖，脚本必须放在项目根目录才能解析到）：

```bash
cat > ./shot-tmp.mjs <<'EOF'
import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT='/tmp';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:3000/zh/recruit',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.setItem('jade_fingerprint','ui-state-check'));
await p.goto('http://localhost:3000/zh/recruit',{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,1200));
await p.evaluate(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('新建岗位'))?.click();});
await new Promise(r=>setTimeout(r,900));
await p.screenshot({path:`${OUT}/newjob.png`,fullPage:true});
console.log('saved /tmp/newjob.png');
await b.close();
EOF
node ./shot-tmp.mjs && rm -f ./shot-tmp.mjs
```

然后用 Read 工具查看 `/tmp/newjob.png`。

Expected：8 个维度排成两行 chip，默认三个（专业技能/逻辑思维/沟通表达）为 brand 绿底带对勾；下方灰底区两列显示这三个的权重滑块与题数；弹窗不需要滚动。

- [ ] **Step 6: Commit**

```bash
git add src/components/recruit/ && git commit -m "feat(recruit): 维度改为标签多选，选中才展开权重"
```

---

## Task 4: 工作区骨架与左栏候选人

**Files:**
- Modify: `src/app/[locale]/recruit/layout.tsx`
- Modify: `src/components/recruit/job-list.tsx`
- Create: `src/app/[locale]/recruit/[jobId]/layout.tsx`
- Create: `src/components/recruit/candidate-sidebar.tsx`

这一步之后，岗位页会同时渲染左栏和旧的详情内容（暂时重复），Task 5 再把旧内容换掉。**这是刻意的分步，中间态难看是正常的。**

- [ ] **Step 1: 放宽外层容器**

`src/app/[locale]/recruit/layout.tsx` 把 `max-w-7xl` 改成 `max-w-[1600px]`：

```tsx
import { Header } from '@/components/layout/header';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export default function RecruitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background">
      <Header />
      {/* 工作区要用满宽屏；岗位列表页自己再收窄 */}
      <main className="mx-auto max-w-[1600px] px-4 py-8">{children}</main>
      <SettingsDialog />
    </div>
  );
}
```

- [ ] **Step 2: 岗位列表页自己收窄**

岗位卡片列表撑到 1600 宽会太散。`src/components/recruit/job-list.tsx` 里 `return (` 紧接着的那行是无属性的 `<div>`，改成：

```tsx
    <div className="mx-auto max-w-7xl">
```

（它下面一行是 `<div className="mb-6 flex items-center justify-between">`，别改错。）

- [ ] **Step 3: 创建工作区 layout**

创建 `src/app/[locale]/recruit/[jobId]/layout.tsx`：

```tsx
import { CandidateSidebar } from '@/components/recruit/candidate-sidebar';

/**
 * 岗位工作区：左栏候选人 + 右侧内容。
 *
 * 左栏放在 layout 而不是各页面里，切换候选人时走客户端导航，
 * 左栏不重新挂载——搜索词和滚动位置都不会丢。
 */
export default async function JobWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <CandidateSidebar jobId={jobId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: 创建左栏组件**

创建 `src/components/recruit/candidate-sidebar.tsx`：

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Plus, Search, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { JobFormDialog } from './job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { sortCandidatesForSidebar } from '@/lib/recruit/summary';
import { cn } from '@/lib/utils';
import type { CandidateSummary, RecruitJob, Recommendation } from '@/types/recruit';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-zinc-300 dark:bg-zinc-600',
  questions_ready: 'bg-amber-400',
  evaluated: 'bg-emerald-500',
};

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export function CandidateSidebar({ jobId }: { jobId: string }) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);
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

  const sorted = useMemo(() => {
    const filtered = query.trim()
      ? candidates.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
      : candidates;
    return sortCandidatesForSidebar(filtered);
  }, [candidates, query]);

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
      await load();
      router.push(`/recruit/${jobId}/c/${data.candidate.id}`);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  async function handleDeleteJob() {
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

  return (
    <aside className="w-full shrink-0 lg:w-[280px]">
      <div className="mb-4">
        <Link
          href="/recruit"
          className="inline-flex cursor-pointer items-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('title')}
        </Link>
        <div className="mt-1 flex items-start justify-between gap-2">
          <h1 className="min-w-0 truncate text-xl font-bold" title={job?.title}>
            {job?.title ?? ''}
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <MoreVertical className="h-4 w-4 text-zinc-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('editJob')}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setDeleteJobOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteJob')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('candidates.search')}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button
          size="icon"
          onClick={() => setAddOpen(true)}
          className="h-9 w-9 shrink-0 cursor-pointer bg-brand hover:bg-brand-hover"
          title={t('candidates.add')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('candidates.empty')}
        </div>
      ) : (
        <nav className="space-y-1">
          {sorted.map((c) => {
            const href = `/recruit/${jobId}/c/${c.id}`;
            const active = pathname.endsWith(`/c/${c.id}`);
            return (
              <Link
                key={c.id}
                href={href}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 transition-colors',
                  active
                    ? 'border-brand bg-brand/5'
                    : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800',
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[c.status])} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || '—'}</span>
                {c.overallScore !== null && (
                  <span className="shrink-0 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                    {c.overallScore}
                  </span>
                )}
                {c.recommendation && (
                  <Badge
                    className={cn('shrink-0 px-1.5 py-0 text-[10px]', RECOMMENDATION_STYLE[c.recommendation])}
                  >
                    {t(`recommendation.${c.recommendation}`)}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {job && (
        <JobFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          job={job}
          onSaved={(updated) => setJob(updated)}
        />
      )}

      <AlertDialog open={deleteJobOpen} onOpenChange={setDeleteJobOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteJobConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              className="cursor-pointer bg-red-600 hover:bg-red-700"
            >
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <Button variant="outline" onClick={() => setAddOpen(false)} className="cursor-pointer">
              {t('cancel')}
            </Button>
            <Button
              onClick={handleAddCandidate}
              disabled={!newName.trim()}
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
```

- [ ] **Step 5: 类型检查**

Run: `pnpm type-check`
Expected: 零错误。若 `Button` 不支持 `size="icon"`，打开 `src/components/ui/button.tsx` 查 cva 的 size 枚举，换成实际支持的值（如 `icon-sm`）。

- [ ] **Step 6: 页面可访问**

Run:
```bash
curl -s -o /dev/null -w "job=%{http_code}\n" "http://localhost:3000/zh/recruit/e151b4dc-58a5-4af2-bbfb-964c265cbc34"
curl -s -o /dev/null -w "cand=%{http_code}\n" "http://localhost:3000/zh/recruit/e151b4dc-58a5-4af2-bbfb-964c265cbc34/c/07a38475-9d70-425c-994d-0dd1b31fdd01"
```
Expected: 都是 200。此时页面上会同时有左栏和旧的详情内容，重复是预期的，Task 5 处理。

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/recruit/" src/components/recruit/
git commit -m "feat(recruit): 岗位工作区骨架与左栏候选人列表"
```

---

## Task 5: 岗位概览与候选人对比表

**Files:**
- Create: `src/components/recruit/candidate-compare-table.tsx`
- Create: `src/components/recruit/job-overview.tsx`
- Rewrite: `src/app/[locale]/recruit/[jobId]/page.tsx`
- Delete: `src/components/recruit/candidate-table.tsx`

对比表需要每个候选人的维度分，而 `GET /api/recruit/jobs/[id]` 返回的 `CandidateSummary` 只有总分。**不要为此改 API**——对比表在客户端并发拉取各已评价候选人的详情（`GET /api/recruit/candidates/[id]`）。候选人通常个位数，可接受。

- [ ] **Step 1: 创建对比表**

创建 `src/components/recruit/candidate-compare-table.tsx`：

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { cn } from '@/lib/utils';
import type {
  CandidateSummary,
  DimensionConfig,
  DimensionScore,
  Recommendation,
  RecruitEvaluation,
} from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface Row {
  id: string;
  name: string;
  overallScore: number;
  recommendation: Recommendation;
  scoreByKey: Map<string, DimensionScore>;
}

interface CandidateCompareTableProps {
  jobId: string;
  dimensions: DimensionConfig[];
  /** 只传已评价的候选人 */
  evaluated: CandidateSummary[];
}

export function CandidateCompareTable({ jobId, dimensions, evaluated }: CandidateCompareTableProps) {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    // 摘要接口不返回维度分，逐个拉详情。候选人通常个位数，并发即可。
    const results = await Promise.all(
      evaluated.map(async (c) => {
        try {
          const res = await fetch(`/api/recruit/candidates/${c.id}`, {
            headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
          });
          if (!res.ok) return null;
          const data = await res.json();
          const evaluation = data.evaluation as RecruitEvaluation | null;
          if (!evaluation) return null;
          return {
            id: c.id,
            name: c.name,
            overallScore: evaluation.overallScore,
            recommendation: evaluation.recommendation,
            scoreByKey: new Map(evaluation.dimensionScores.map((d) => [d.key, d])),
          } satisfies Row;
        } catch {
          return null;
        }
      }),
    );
    setRows(results.filter((r): r is Row => r !== null).sort((a, b) => b.overallScore - a.overallScore));
  }, [evaluated, fingerprint]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  if (rows === null) return <Skeleton className="h-40 rounded-xl" />;
  if (rows.length < 2) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium">{t('overview.compare')}</h2>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">{t('candidates.name')}</th>
              {dimensions.map((d) => (
                <th key={d.key} className="px-3 py-3 text-center font-medium">
                  {d.label}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-medium">{t('candidates.score')}</th>
              <th className="px-4 py-3 font-medium">{t('candidates.recommendation')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/recruit/${jobId}/c/${r.id}`}
                    className="cursor-pointer font-medium hover:text-brand"
                  >
                    {r.name || '—'}
                  </Link>
                </td>
                {dimensions.map((d) => {
                  const s = r.scoreByKey.get(d.key);
                  // weight 为 0 表示这个维度一道题都没问到，显示 — 而不是 0，
                  // 否则「没考」和「考了得 0 分」看起来一样。
                  const notAsked = !s || s.weight === 0;
                  return (
                    <td
                      key={d.key}
                      className={cn(
                        'px-3 py-3 text-center tabular-nums',
                        notAsked && 'text-zinc-300 dark:text-zinc-600',
                      )}
                    >
                      {notAsked ? '—' : s.score}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center font-semibold tabular-nums">{r.overallScore}</td>
                <td className="px-4 py-3">
                  <Badge className={RECOMMENDATION_STYLE[r.recommendation]}>
                    {t(`recommendation.${r.recommendation}`)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 创建岗位概览**

创建 `src/components/recruit/job-overview.tsx`：

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateCompareTable } from './candidate-compare-table';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { allocateQuestions } from '@/lib/recruit/scoring';
import { cn } from '@/lib/utils';
import type { CandidateSummary, DimensionConfig, RecruitJob } from '@/types/recruit';

export function JobOverview({ jobId }: { jobId: string }) {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [jdExpanded, setJdExpanded] = useState(false);

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

  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (!job) return null;

  const dimensions = job.dimensions as DimensionConfig[];
  const allocation = allocateQuestions(dimensions, job.questionCount);
  const evaluated = candidates.filter((c) => c.overallScore !== null);
  // 均分只算已评价的人；一个都没评价时不显示，避免出现「均分 0」的误导
  const avgScore =
    evaluated.length > 0
      ? Math.round(evaluated.reduce((s, c) => s + (c.overallScore as number), 0) / evaluated.length)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-zinc-500">
        <span>{t('overview.stats', { total: candidates.length, evaluated: evaluated.length })}</span>
        {avgScore !== null && (
          <span className="text-zinc-700 dark:text-zinc-300">
            {t('overview.avgScore', { score: avgScore })}
          </span>
        )}
      </div>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-medium">{t('jobDescription')}</h2>
        <p
          className={cn(
            'whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400',
            !jdExpanded && 'line-clamp-3',
          )}
        >
          {job.jobDescription}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setJdExpanded((v) => !v)}
          className="mt-1 h-auto cursor-pointer px-0 text-xs text-brand hover:bg-transparent hover:text-brand-hover"
        >
          {jdExpanded ? t('overview.collapseJd') : t('overview.expandJd')}
        </Button>

        <div className="mt-4 flex flex-wrap gap-2">
          {dimensions.map((d) => (
            <span
              key={d.key}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {d.label} ×{d.weight} · {t('dimensions.perDimension', { count: allocation[d.key] ?? 0 })}
            </span>
          ))}
        </div>
      </Card>

      {evaluated.length >= 2 && (
        <CandidateCompareTable jobId={jobId} dimensions={dimensions} evaluated={evaluated} />
      )}

      <p className="text-center text-sm text-zinc-400">{t('overview.selectCandidate')}</p>
    </div>
  );
}
```

- [ ] **Step 3: 重写岗位详情页**

把 `src/app/[locale]/recruit/[jobId]/page.tsx` 整个替换成：

```tsx
'use client';

import { use } from 'react';
import { JobOverview } from '@/components/recruit/job-overview';

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return <JobOverview jobId={jobId} />;
}
```

- [ ] **Step 4: 删除旧表格组件**

Run: `git rm src/components/recruit/candidate-table.tsx`

- [ ] **Step 5: 类型检查与测试**

Run: `pnpm type-check && pnpm test`
Expected: type-check 零错误；测试 214 全过。若报找不到 `candidate-table`，`grep -rn "CandidateTable" src/` 查残留引用。

- [ ] **Step 6: 视觉核对**

用 Task 3 Step 5 的截图脚本（改 URL 为 `http://localhost:3000/zh/recruit/e151b4dc-58a5-4af2-bbfb-964c265cbc34`，去掉点击弹窗那段），存到 `/tmp/job-overview.png`，然后用 Read 工具查看。

Expected：左侧 280px 候选人栏（岗位名 + 搜索 + 候选人行），右侧统计条 + JD 折叠卡 + 维度 chip；不再有旧的宽表格；页面横向填满，不再是上方 40% 有内容下方全空。

- [ ] **Step 7: Commit**

```bash
git add "src/app[locale]/recruit/" src/components/recruit/
git commit -m "feat(recruit): 岗位概览与候选人横向对比表"
```

---

## Task 6: 步骤条替代 Tab

**Files:**
- Create: `src/components/recruit/step-tabs.tsx`
- Modify: `src/components/recruit/candidate-workspace.tsx`

三个 Tab 升级为带序号与完成勾的步骤条。仍可自由点击——面试中要在题目和评价之间来回切，不能强制顺序。

同时把候选人工作台里的面包屑和岗位名去掉（Task 4 已移入左栏），避免重复。

- [ ] **Step 1: 创建步骤条**

创建 `src/components/recruit/step-tabs.tsx`。底层仍是 Radix Tabs 的 `TabsList`，用它的 `variant="line"`（下划线样式，无背景块）：

```tsx
'use client';

import { Check } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface Step {
  value: string;
  label: string;
  /** 该步骤的产出是否已存在 */
  done: boolean;
}

/**
 * 带序号与完成态的步骤条。刻意不禁用未完成的步骤——
 * 面试中要在题目和评价之间来回切，强制顺序反而碍事。
 */
export function StepTabs({ steps }: { steps: Step[] }) {
  return (
    <TabsList variant="line" className="h-auto w-full justify-start gap-6 border-b p-0">
      {steps.map((s, i) => (
        <TabsTrigger
          key={s.value}
          value={s.value}
          className="h-auto flex-none cursor-pointer gap-2 px-0 pb-3 text-sm"
        >
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
              s.done
                ? 'bg-brand text-white'
                : 'border border-zinc-300 text-zinc-400 dark:border-zinc-600',
            )}
          >
            {s.done ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          {s.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
```

- [ ] **Step 2: 改写候选人工作台**

把 `src/components/recruit/candidate-workspace.tsx` 整个替换成：

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StepTabs, type Step } from './step-tabs';
import { ResumePanel } from './resume-panel';
import { QuestionsPanel } from './questions-panel';
import { EvaluationPanel } from './evaluation-panel';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { RecruitCandidate, RecruitEvaluation, RecruitJob } from '@/types/recruit';

interface CandidateWorkspaceProps {
  jobId: string;
  candidateId: string;
}

export function CandidateWorkspace({ candidateId }: CandidateWorkspaceProps) {
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

  // candidateId 变化时要重新拉——左栏切换候选人不会重新挂载本组件
  useEffect(() => {
    if (fpLoading) return;
    setLoading(true);
    load();
  }, [fpLoading, load]);

  if (loading) return <Skeleton className="h-96 rounded-xl" />;
  if (!candidate || !job) return null;

  const steps: Step[] = [
    { value: 'resume', label: t('steps.resume'), done: Boolean(candidate.resumeText?.trim()) },
    { value: 'questions', label: t('steps.questions'), done: (candidate.questions ?? []).length > 0 },
    { value: 'evaluation', label: t('steps.evaluation'), done: evaluation !== null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{candidate.name || '—'}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t(`status.${candidate.status}`)}</p>
      </div>

      <Tabs defaultValue="resume">
        <StepTabs steps={steps} />

        <TabsContent value="resume" className="mt-6">
          <ResumePanel candidate={candidate} onUpdated={setCandidate} />
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          <QuestionsPanel job={job} candidate={candidate} onUpdated={setCandidate} />
        </TabsContent>

        <TabsContent value="evaluation" className="mt-6">
          <EvaluationPanel
            candidate={candidate}
            evaluation={evaluation}
            onCandidateUpdated={setCandidate}
            onEvaluated={setEvaluation}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

注意 `jobId` 现在没用到了（面包屑移走了），但**保留在 props 里**——页面组件仍在传，改签名会连带改页面。留着并在解构时省略即可（上面的写法就是这样）。

- [ ] **Step 3: 类型检查**

Run: `pnpm type-check`
Expected: 零错误。若 lint 抱怨 `jobId` 未使用，那是 `no-unused-vars` 对解构参数的检查——上面的写法把它从解构里省掉了，不会触发。

- [ ] **Step 4: 视觉核对**

用截图脚本访问候选人页 `http://localhost:3000/zh/recruit/e151b4dc-58a5-4af2-bbfb-964c265cbc34/c/07a38475-9d70-425c-994d-0dd1b31fdd01`，存 `/tmp/steps.png`，Read 查看。

Expected：三个步骤带圆形序号；已完成的（简历、面试题）显示绿底对勾；当前步骤有下划线；页面上只有一个候选人名，没有重复的岗位名面包屑。

- [ ] **Step 5: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): Tab 升级为带完成态的步骤条"
```

---

## Task 7: 简历 Tab 紧凑化与 textarea 修复

**Files:**
- Create: `src/components/recruit/resume-dropzone.tsx`
- Modify: `src/components/recruit/resume-panel.tsx`

上传区从 280px 高的空卡片压成 96px 横向条。顺带修 `rows={16}` 失效的 bug。

**bug 成因**：`src/components/ui/textarea.tsx` 的类名含 `field-sizing-content min-h-16`，浏览器按内容自适应高度，`rows` 属性被无视。加 `min-h-[320px]` 即可——`field-sizing-content` 仍生效（内容多时继续长高），但下限被抬到 320px。

- [ ] **Step 1: 创建横向上传区**

创建 `src/components/recruit/resume-dropzone.tsx`：

```tsx
'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResumeDropzoneProps {
  uploading: boolean;
  onFile: (file: File) => void;
}

/**
 * 横向紧凑上传区。原来是 280px 高的空卡片，中间只放一个按钮——
 * 占了屏幕四分之一却只承载一个动作。
 */
export function ResumeDropzone({ uploading, onFile }: ResumeDropzoneProps) {
  const t = useTranslations('recruit.resume');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-4 rounded-xl border-2 border-dashed border-zinc-200 px-5 py-4 dark:border-zinc-700">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // 清空 input，否则同一个文件重传第二次不会触发 change
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      {uploading ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-400" />
      ) : (
        <Upload className="h-5 w-5 shrink-0 text-zinc-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{uploading ? t('parsing') : t('upload')}</p>
        {!uploading && <p className="mt-0.5 text-xs text-zinc-400">{t('uploadHint')}</p>}
      </div>
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="shrink-0 cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
      >
        {t('upload')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 改写简历面板**

把 `src/components/recruit/resume-panel.tsx` 整个替换成：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResumeDropzone } from './resume-dropzone';
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
      toast.success(t('resume.saved'));
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  // 上传 PDF 时服务端已经把解析结果落库了，此时 text 与库里一致。
  // 只置灰按钮而不给任何提示的话，「有内容却点不动」看起来就是坏的。
  const dirty = text !== candidate.resumeText;

  return (
    <div className="space-y-5">
      <ResumeDropzone uploading={uploading} onFile={handleFile} />

      <div className="space-y-2">
        <Label htmlFor="resume-text">{t('resume.paste')}</Label>
        <Textarea
          id="resume-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('resume.pastePlaceholder')}
          // Textarea 组件带 field-sizing-content，rows 属性会被无视，
          // 必须用 min-h 抬高下限。
          className="min-h-[320px]"
        />
        <div className="flex items-center justify-end gap-3">
          {!dirty && text.trim() && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {t('resume.saved')}
            </span>
          )}
          <Button
            onClick={handleSaveText}
            disabled={saving || !dirty}
            className="cursor-pointer gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('resume.savePaste')}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm type-check`
Expected: 零错误

- [ ] **Step 4: 视觉核对**

截图候选人页的简历 Tab（默认就是它），存 `/tmp/resume.png`，Read 查看。

Expected：上传区是一条约 96px 高的横向虚线框（图标、文案、按钮同一行）；下方粘贴框明显变高（至少 320px），不再是 3 行；「已保存」标记在按钮左侧。

- [ ] **Step 5: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): 简历上传区紧凑化并修复粘贴框高度"
```

---

## Task 8: 题卡折叠与层次重排

**Files:**
- Modify: `src/components/recruit/question-card.tsx`

这是本次改造收益最大的一步。5 道题原本渲染 2400px，改后折叠态约 280px。

题卡的展开状态由父组件控制（Task 9 的「全部展开」开关要能统一操作），本任务只改卡片本身。

- [ ] **Step 1: 重写题卡**

把 `src/components/recruit/question-card.tsx` 整个替换成：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Trash2, Clock, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const DIFFICULTY_DOT: Record<string, string> = {
  easy: 'bg-emerald-500',
  medium: 'bg-amber-500',
  hard: 'bg-red-500',
};

const RUBRIC_BAR: Record<'excellent' | 'pass' | 'fail', string> = {
  excellent: 'bg-emerald-500',
  pass: 'bg-amber-500',
  fail: 'bg-red-500',
};

interface QuestionCardProps {
  index: number;
  question: InterviewQuestion;
  dimensions: DimensionConfig[];
  expanded: boolean;
  onToggleExpanded: () => void;
  asked: boolean;
  onToggleAsked: () => void;
  onRemove: () => void;
}

export function QuestionCard({
  index,
  question,
  dimensions,
  expanded,
  onToggleExpanded,
  asked,
  onToggleAsked,
  onRemove,
}: QuestionCardProps) {
  const t = useTranslations('recruit.questions');
  const label = dimensions.find((d) => d.key === question.dimension)?.label ?? question.dimension;

  return (
    <Card className="overflow-hidden p-0">
      {/* 折叠行：面试中一屏要能扫完，所以只放题干和最必要的元信息 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleAsked}
          title={t('asked')}
          className={cn(
            'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors',
            asked
              ? 'border-brand bg-brand text-white'
              : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600',
          )}
        >
          {asked && <Check className="h-3 w-3" />}
        </button>

        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm font-medium',
              asked && 'text-zinc-400 line-through dark:text-zinc-500',
            )}
          >
            {index + 1}. {question.question}
          </span>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
            {label}
          </Badge>
          <span className="hidden shrink-0 items-center gap-1 text-xs text-zinc-400 sm:inline-flex">
            <span className={cn('h-1.5 w-1.5 rounded-full', DIFFICULTY_DOT[question.difficulty])} />
            <Clock className="h-3 w-3" />
            {t('minutes', { count: question.estimatedMinutes })}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-zinc-400 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t bg-zinc-50/50 px-4 py-4 dark:bg-zinc-900/50">
          <Section title={t('intent')}>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{question.intent}</p>
          </Section>

          <Section title={t('rubric')}>
            <div className="space-y-1.5">
              {(['excellent', 'pass', 'fail'] as const).map((level) => (
                <div key={level} className="flex gap-2">
                  <span className={cn('w-0.5 shrink-0 rounded-full', RUBRIC_BAR[level])} />
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="text-zinc-500 dark:text-zinc-400">{t(level)}：</span>
                    {question.rubric[level]}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {question.followUps.length > 0 && (
            <Section title={t('followUps')}>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                {question.followUps.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Section>
          )}

          {question.referencePoints.length > 0 && (
            <Section title={t('referencePoints')}>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                {question.referencePoints.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="cursor-pointer gap-2 text-zinc-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              {t('remove')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** 小标题弱化、正文正常，四个区块才有层次；原来全是同色同字号的灰字堆叠。 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm type-check`
Expected: **会报错**——`questions-panel.tsx` 还在用旧的 props（没有 `expanded` / `onToggleExpanded` / `asked` / `onToggleAsked`）。这是预期的，Task 9 修。**本任务不要为了让 type-check 过而改 questions-panel**，那是下一个任务的事。

如果你想在本任务结束时保持 type-check 干净，可以合并 Task 8 和 Task 9 一起做一次 commit。控制方接受任一种做法，但**不要写临时的兼容层再删掉**。

- [ ] **Step 3: Commit（与 Task 9 合并提交亦可）**

```bash
git add src/components/recruit/question-card.tsx
git commit -m "feat(recruit): 题卡改为折叠展开并重排信息层次"
```

---

## Task 9: 面试题面板的概览条与折叠管理

**Files:**
- Modify: `src/components/recruit/questions-panel.tsx`

承接 Task 8：管理每题的展开状态与「已问」标记，加顶部概览条和「全部展开/收起」开关。**做完这个任务 type-check 才会重新变绿。**

「已问」是纯前端状态，不落库——面试中的临时进度标记，刷新丢失可接受。这是刻意的取舍，不要顺手加持久化。

- [ ] **Step 1: 改写面板**

把 `src/components/recruit/questions-panel.tsx` 整个替换成：

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Copy, Loader2, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { QuestionCard } from './question-card';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { summarizeQuestions } from '@/lib/recruit/summary';
import type {
  DimensionConfig,
  InterviewQuestion,
  RecruitCandidate,
  RecruitJob,
} from '@/types/recruit';

interface QuestionsPanelProps {
  job: RecruitJob;
  candidate: RecruitCandidate;
  onUpdated: (candidate: RecruitCandidate) => void;
}

export function QuestionsPanel({ job, candidate, onUpdated }: QuestionsPanelProps) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const { fingerprint } = useFingerprint();
  const [generating, setGenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 「已问」只活在本次会话里：面试中的临时进度标记，不值得为它加一列存储
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set());

  const dimensions: DimensionConfig[] = candidate.dimensionsOverride ?? job.dimensions;
  const questions = candidate.questions ?? [];
  const hasResume = Boolean(candidate.resumeText?.trim());

  const summary = useMemo(() => summarizeQuestions(questions, dimensions), [questions, dimensions]);
  const allExpanded = questions.length > 0 && expandedIds.size === questions.length;

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function toggleAllExpanded() {
    setExpandedIds(allExpanded ? new Set() : new Set(questions.map((q) => q.id)));
  }

  async function doGenerate() {
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
      // 新题目跟旧的没有对应关系，清掉展开与已问状态
      setExpandedIds(new Set());
      setAskedIds(new Set());
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (questions.length > 0) setRegenerateOpen(true);
    else doGenerate();
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
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {t('questions.needResume')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
          </Button>
          {questions.length > 0 && (
            <Button variant="outline" onClick={handleCopyAll} className="cursor-pointer gap-2">
              <Copy className="h-4 w-4" />
              {t('questions.copyAll')}
            </Button>
          )}
        </div>

        {questions.length > 0 && !generating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAllExpanded}
            className="cursor-pointer gap-2 text-zinc-500"
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-4 w-4" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
            {allExpanded ? t('questions.collapseAll') : t('questions.expandAll')}
          </Button>
        )}
      </div>

      {questions.length > 0 && !generating && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>
            {t('questions.summary', { count: summary.count, minutes: summary.totalMinutes })}
          </span>
          {summary.byDimension.map((d) => (
            <span key={d.key} className="text-zinc-400">
              {d.label} {d.count}
            </span>
          ))}
        </div>
      )}

      {generating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 py-16 dark:border-zinc-700">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">{t('questions.generating')}</p>
        </div>
      )}

      {!generating && questions.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('questions.empty')}
        </div>
      )}

      {!generating && (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              index={i}
              question={q}
              dimensions={dimensions}
              expanded={expandedIds.has(q.id)}
              onToggleExpanded={() => setExpandedIds((s) => toggle(s, q.id))}
              asked={askedIds.has(q.id)}
              onToggleAsked={() => setAskedIds((s) => toggle(s, q.id))}
              onRemove={() => handleRemove(q.id)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('questions.regenerateConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doGenerate}
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {tc('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查与测试**

Run: `pnpm type-check && pnpm test`
Expected: type-check 零错误（Task 8 引入的报错在此消除）；测试 214 全过

- [ ] **Step 3: 视觉核对**

截图候选人页并点到「面试题」步骤（Radix Tab 要用真实鼠标点击，`element.click()` 有时不触发）：

```bash
cat > ./shot-tmp.mjs <<'EOF'
import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const J='e151b4dc-58a5-4af2-bbfb-964c265cbc34', C='07a38475-9d70-425c-994d-0dd1b31fdd01';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
await p.goto('http://localhost:3000/zh/recruit',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.setItem('jade_fingerprint','ui-state-check'));
await p.goto(`http://localhost:3000/zh/recruit/${J}/c/${C}`,{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,1500));
for (const tab of await p.$$('[role="tab"]')) {
  if ((await p.evaluate(e=>e.textContent,tab)).includes('面试题')) { await tab.click(); break; }
}
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:'/tmp/questions.png',fullPage:true});
console.log('saved /tmp/questions.png');
await b.close();
EOF
node ./shot-tmp.mjs && rm -f ./shot-tmp.mjs
```

用 Read 工具查看 `/tmp/questions.png`。

Expected：**5 道题全部折叠，整页高度约 600px 以内**（改动前是 2400px）；每行一句题干 + 维度徽章 + 难度点 + 时长；顶部有 `共 5 题 · 预计 42 分钟 · 逻辑思维 5` 概览条和「全部展开」按钮。

- [ ] **Step 4: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): 面试题概览条与折叠状态管理"
```

---

## Task 10: 评价面板重排

**Files:**
- Modify: `src/components/recruit/evaluation-panel.tsx`

生成报告后，12 行的记录输入框还杵在最上面把报告推下去。改成：已生成时记录折成一行，报告占主体；雷达图与优势/顾虑左右并排。

- [ ] **Step 1: 改写面板**

把 `src/components/recruit/evaluation-panel.tsx` 整个替换成：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DimensionRadar } from './dimension-radar';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
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
  const tc = useTranslations('common');
  const { fingerprint } = useFingerprint();
  const [transcript, setTranscript] = useState(candidate.transcript);
  const [generating, setGenerating] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  // 已有报告时记录默认折叠，把版面让给报告
  const [transcriptOpen, setTranscriptOpen] = useState(!evaluation);

  const hasQuestions = (candidate.questions ?? []).length > 0;
  const answeredCount = evaluation?.questionEvaluations.filter((q) => q.answered).length ?? 0;

  async function doGenerate() {
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
      setTranscriptOpen(false);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (evaluation) setRegenerateOpen(true);
    else doGenerate();
  }

  if (!hasQuestions) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {t('evaluation.needQuestions')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 记录区：没有报告时占主体；有报告后折成一行 */}
      {transcriptOpen ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="transcript">{t('evaluation.transcript')}</Label>
            {evaluation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTranscriptOpen(false)}
                className="cursor-pointer text-xs text-zinc-500"
              >
                {t('overview.collapseJd')}
              </Button>
            )}
          </div>
          <p className="text-xs text-zinc-500">{t('evaluation.transcriptHint')}</p>
          <Textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={t('evaluation.transcriptPlaceholder')}
            className="min-h-[240px]"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={generating || !transcript.trim()}
              className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {evaluation ? t('evaluation.regenerate') : t('evaluation.generate')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setTranscriptOpen(true)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <ChevronDown className="h-4 w-4 shrink-0" />
          {t('evaluation.transcriptCollapsed', { chars: transcript.length })}
        </button>
      )}

      {generating && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 py-16 dark:border-zinc-700">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">{t('evaluation.generating')}</p>
        </div>
      )}

      {!generating && !evaluation && (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('evaluation.empty')}
        </div>
      )}

      {!generating && evaluation && (
        <div className="space-y-5">
          {/* 报告头：总分、作答数、结论一行放完 */}
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tabular-nums">{evaluation.overallScore}</span>
              <div className="text-xs text-zinc-500">
                <p>{t('evaluation.overallScore')}</p>
                <p className="mt-0.5 text-zinc-400">
                  {t('evaluation.answeredCount', {
                    answered: answeredCount,
                    total: evaluation.questionEvaluations.length,
                  })}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <Badge className={cn('shrink-0', RECOMMENDATION_STYLE[evaluation.recommendation])}>
                {t(`recommendation.${evaluation.recommendation}`)}
              </Badge>
              <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                {evaluation.recommendationReason}
              </p>
            </div>
          </Card>

          {/* 雷达图与优势/顾虑并排，不再各占一整行 */}
          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="p-4 lg:col-span-5">
              <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-400">
                {t('evaluation.dimensionScores')}
              </h3>
              <DimensionRadar scores={evaluation.dimensionScores} />
            </Card>
            <div className="space-y-4 lg:col-span-7">
              <Card className="p-5">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-emerald-600">
                  {t('evaluation.strengths')}
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-amber-600">
                  {t('evaluation.concerns')}
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {evaluation.concerns.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          <Card className="p-5">
            <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
              {t('evaluation.overallComment')}
            </h3>
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {evaluation.overallComment}
            </p>
          </Card>

          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">
              {t('evaluation.questionReview')}
            </h3>
            {evaluation.questionEvaluations.map((q, i) => (
              <Card key={q.questionId} className={cn('p-4', !q.answered && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {q.answered ? q.score : '—'}
                  </span>
                </div>
                {q.answered ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-zinc-700 dark:text-zinc-300">{q.answerSummary}</p>
                    {q.highlights.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-emerald-700 dark:text-emerald-400">
                        {q.highlights.map((h, j) => (
                          <li key={j}>{h}</li>
                        ))}
                      </ul>
                    )}
                    {q.weaknesses.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-amber-700 dark:text-amber-400">
                        {q.weaknesses.map((w, j) => (
                          <li key={j}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-400">{t('evaluation.notAnswered')}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('evaluation.regenerateConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doGenerate}
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {tc('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: 缩小雷达图**

`src/components/recruit/dimension-radar.tsx` 的 `<ResponsiveContainer width="100%" height={320}>` 改成 `height={240}`——它现在只占 5/12 宽，320 高会显得瘦长。

- [ ] **Step 3: 类型检查与测试**

Run: `pnpm type-check && pnpm test`
Expected: type-check 零错误；测试 214 全过

- [ ] **Step 4: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): 评价报告重排，记录可折叠"
```

---

## Task 11: 响应式与全量核对

**Files:** 视核对结果而定，可能不改文件。

- [ ] **Step 1: 全量静态检查**

Run: `pnpm test && pnpm type-check`
Expected: 214 测试全过；type-check 零错误

Run: `pnpm lint 2>&1 | tail -3`
Expected: 问题总数不超过 1360（main 基线 1340）。用下面这条确认新增的都是 `no-explicit-any`：
```bash
pnpm lint 2>&1 | grep -A 40 "components/recruit\|app/\[locale\]/recruit" | grep -E "error|warning" | grep -v "no-explicit-any" | head
```
Expected: 无输出。有输出就把那些违规修掉。

- [ ] **Step 2: 生产构建**

Run: `pnpm build 2>&1 | grep -E "recruit|Compiled|Failed|error" | head -20`
Expected: `✓ Compiled successfully`，且列出 `/[locale]/recruit`、`/[locale]/recruit/[jobId]`、`/[locale]/recruit/[jobId]/c/[candidateId]` 三个页面

- [ ] **Step 3: 三档视口截图**

```bash
cat > ./shot-tmp.mjs <<'EOF'
import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const J='e151b4dc-58a5-4af2-bbfb-964c265cbc34', C='07a38475-9d70-425c-994d-0dd1b31fdd01';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage();
await p.goto('http://localhost:3000/zh/recruit',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.setItem('jade_fingerprint','ui-state-check'));
for (const [name,w,h] of [['desktop',1440,900],['tablet',768,1024],['mobile',375,812]]) {
  await p.setViewport({width:w,height:h,deviceScaleFactor:2});
  await p.goto(`http://localhost:3000/zh/recruit/${J}/c/${C}`,{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,1500));
  await p.screenshot({path:`/tmp/rw-${name}.png`,fullPage:true});
  console.log('saved',name);
}
await b.close();
EOF
node ./shot-tmp.mjs && rm -f ./shot-tmp.mjs
```

用 Read 工具依次查看 `/tmp/rw-desktop.png`、`/tmp/rw-tablet.png`、`/tmp/rw-mobile.png`。

核对：
- desktop：左栏 280px + 右侧内容，无横向滚动条，页面横向填满
- tablet / mobile：左栏堆到上方（`lg:flex-row` 在 <1024px 退化为纵向），内容不被撑破，无横向溢出
- 三档下步骤条都完整可见

**若 mobile 下出现横向溢出**，最可能是候选人对比表——给它的外层补 `overflow-x-auto`（`candidate-compare-table.tsx` 的 `<Card>` 已带 `overflow-x-auto`，若仍溢出检查是否有更外层的固定宽度）。

- [ ] **Step 4: 英文界面无裸 key**

```bash
for p in "/en/recruit" "/en/recruit/e151b4dc-58a5-4af2-bbfb-964c265cbc34"; do
  echo -n "$p → "
  curl -s "http://localhost:3000$p" | grep -oE "recruit\.[a-zA-Z]+\.[a-zA-Z]+" | grep -v i18nKey | head -3 || echo "无裸 key"
done
```
Expected: 两行都是「无裸 key」

- [ ] **Step 5: 确认业务逻辑未被动过**

Run:
```bash
git diff main..HEAD --stat -- src/app/api/ src/lib/db/ src/lib/ai/ src/types/
```
Expected: **无输出**。本次改造只应触及 `src/components/recruit/`、`src/app/[locale]/recruit/`、`src/lib/recruit/summary.ts`、`messages/`。若 API、数据层、AI 层有改动，说明越界了，查清楚并回退。

- [ ] **Step 6: 若有修改则提交**

```bash
git add -A && git commit -m "fix(recruit): 响应式与核对发现的问题修复"
```

没有修改就跳过。

---

## 验收清单

- [ ] 面试题 Tab 默认全折叠，5 道题整页高度在 600px 以内（改动前 2400px）
- [ ] 题卡可单独展开，也可「全部展开/收起」
- [ ] 「已问」勾选后题干变灰划掉
- [ ] 顶部概览条显示题数、总时长、各维度题数
- [ ] 左栏候选人列表带搜索，按分数降序、未评价沉底，选中行有 brand 边条
- [ ] 切换候选人不跳页、左栏不重新挂载、搜索词不丢
- [ ] 岗位概览的 JD 默认折 3 行可展开
- [ ] ≥2 人已评价时出现横向对比表，未考的维度显示「—」而非 0
- [ ] 简历上传区约 96px 高，粘贴框至少 320px 高
- [ ] 三个步骤显示序号与完成勾
- [ ] 评价生成后记录折成一行，雷达图与优势/顾虑并排
- [ ] 新建岗位弹窗不需要滚动，维度是两行 chip
- [ ] 中英文均无裸 key
- [ ] `pnpm test && pnpm type-check` 全绿，生产构建通过
- [ ] `git diff main..HEAD -- src/app/api/ src/lib/db/ src/lib/ai/ src/types/` 为空

---

## 明确不做

题目拖拽排序、候选人批量操作、打印专用样式、题目内容编辑（只支持删除）、「已问」状态持久化、对比表的图表可视化。
