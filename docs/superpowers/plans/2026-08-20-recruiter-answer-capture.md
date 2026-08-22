# 面试题主从双栏 + 逐题记录答案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面试题页改成主从双栏（左列题目、右侧常驻当前题细则），并支持面试中逐题记录候选人回答，评估时优先使用这些答案。

**Architecture:** 答案存进 `questions` JSON 里每道题的可选 `answer` 字段——不新增表、不新增列、不需要 migration。评估 prompt 按有无答案分流：有答案的题直接给 Q&A 对并告知模型不要去记录里找，没答案的题保持从 transcript 定位。

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind 4 + shadcn/ui · next-intl · vitest

**Spec:** `docs/superpowers/specs/2026-08-20-recruiter-answer-capture-design.md`

---

## 关键约定（先读这段）

1. **本轮唯一的业务逻辑改动是评估 prompt 与其前置校验**（Task 3、4）。除此之外 fetch 的 URL、请求体、响应处理一律不动。
2. **不需要数据库 migration。** `answer` 是 `questions` JSON 内的字段，`PATCH /api/recruit/candidates/[id]` 的 `questions` 校验本来就是 `z.array(z.any())`，接口零改动。
3. **全站设计规范**：主按钮 `cursor-pointer gap-2 bg-brand hover:bg-brand-hover`；次按钮 `variant="outline" className="cursor-pointer gap-2"`；确认弹窗一律 `AlertDialog` 禁止 `confirm()`；空态虚线框不用 `<Card>`；所有可点击元素加 `cursor-pointer`。
4. **`Card` 组件自带 `flex flex-col`**——想在 Card 上排横向布局必须显式加 `flex-row`；Card 的直接子元素默认被拉满宽，行内按钮要加 `self-start`。这个坑已经踩过两次。
5. **`Textarea` 组件带 `field-sizing-content min-h-16`**，`rows` 属性无效，必须用 `min-h-[...]`。
6. **i18n** 用 Edit 定点插入，**绝不 `JSON.parse` + `JSON.stringify` 整文件重写**——那会把 `editor.fields.months` 的数字键重排，污染无关 diff。
7. `pnpm type-check` 必须零错误。`pnpm lint` 基线本就失败（main 上 1340 个问题），判断标准是「新文件不引入 `no-explicit-any` 之外的新规则违规」。
8. 无 jsdom / testing-library，UI 不写自动化测试，别装新依赖。
9. **dev server 在端口 3000 跑着（连 PostgreSQL），不要 kill 也不要重启。**
10. **截图存 `docs/design/screenshots/`**，不要丢 `/tmp`。截图脚本必须放**项目根目录**才能解析到 `puppeteer-core`。
11. **git commit message 禁止带任何 `Co-Authored-By` 后缀。**

**每个任务结束都要 commit。**

---

## 截图脚本模板（多个任务会用到）

```bash
cat > ./shot-tmp.mjs <<'EOF'
import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const J='e151b4dc-58a5-4af2-bbfb-964c265cbc34', C='07a38475-9d70-425c-994d-0dd1b31fdd01';
const OUT='docs/design/screenshots';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--hide-scrollbars']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
// 页面靠 localStorage 里的 fingerprint 认身份，必须先种再访问目标页
await p.goto('http://localhost:3000/zh/recruit',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.setItem('jade_fingerprint','ui-state-check'));
await p.goto(`http://localhost:3000/zh/recruit/${J}/c/${C}`,{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,1500));
// Radix 的 Tab 要用真实鼠标点击，element.click() 有时不触发
for (const tab of await p.$$('[role="tab"]')) {
  if ((await p.evaluate(e=>e.textContent,tab)).includes('面试题')) { await tab.click(); break; }
}
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:`${OUT}/2026-08-20-<NAME>.png`,fullPage:true});
console.log('saved');
await b.close();
EOF
node ./shot-tmp.mjs && rm -f ./shot-tmp.mjs
```

**截完必须用 Read 工具亲眼看**，别只看脚本有没有报错。

测试数据（fingerprint `ui-state-check`）：jobId `e151b4dc-58a5-4af2-bbfb-964c265cbc34`，candidateId `07a38475-9d70-425c-994d-0dd1b31fdd01`（已有 5 道题 + 一份完整评价）。

---

## Task 1: 类型扩展与答案统计纯函数（TDD）

**Files:**
- Modify: `src/types/recruit.ts`
- Create: `src/lib/recruit/answers.test.ts`
- Create: `src/lib/recruit/answers.ts`

- [ ] **Step 1: 给 InterviewQuestion 加可选 answer 字段**

`src/types/recruit.ts` 的 `InterviewQuestion` 接口，在 `difficulty` 之后追加：

```ts
  /** 面试中记录的候选人回答。空表示这题还没记。 */
  answer?: string;
```

字段可选，生成题目的 route 构造对象时不带它，无需改动那边。

- [ ] **Step 2: 写失败的测试**

创建 `src/lib/recruit/answers.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { countAnswered, hasAnyAnswer } from './answers';
import type { InterviewQuestion } from '@/types/recruit';

function q(id: string, answer?: string): InterviewQuestion {
  return {
    id,
    dimension: 'logic',
    question: 'Q',
    intent: 'I',
    rubric: { excellent: 'a', pass: 'b', fail: 'c' },
    followUps: [],
    referencePoints: [],
    estimatedMinutes: 5,
    difficulty: 'medium',
    ...(answer === undefined ? {} : { answer }),
  };
}

describe('countAnswered', () => {
  it('数出填了答案的题', () => {
    expect(countAnswered([q('1', '答了'), q('2'), q('3', '也答了')])).toBe(2);
  });

  it('只有空白字符的不算已记录', () => {
    expect(countAnswered([q('1', '   '), q('2', '\n\t'), q('3', '')])).toBe(0);
  });

  it('没有 answer 字段的不算', () => {
    expect(countAnswered([q('1'), q('2')])).toBe(0);
  });

  it('空数组返回 0', () => {
    expect(countAnswered([])).toBe(0);
  });
});

describe('hasAnyAnswer', () => {
  it('至少一道题有实质内容就返回 true', () => {
    expect(hasAnyAnswer([q('1'), q('2', '答了')])).toBe(true);
  });

  it('全是空白答案返回 false', () => {
    expect(hasAnyAnswer([q('1', '  '), q('2')])).toBe(false);
  });

  it('空数组返回 false', () => {
    expect(hasAnyAnswer([])).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run src/lib/recruit/answers.test.ts`
Expected: FAIL —— `Failed to resolve import "./answers"`

- [ ] **Step 4: 写实现**

创建 `src/lib/recruit/answers.ts`：

```ts
import type { InterviewQuestion } from '@/types/recruit';

/**
 * 已记录答案的题数。空白字符不算——面试官点进某题又退出来时，
 * 输入框可能留下空格，那不该算「记过了」。
 */
export function countAnswered(questions: InterviewQuestion[]): number {
  return questions.filter((q) => Boolean(q.answer?.trim())).length;
}

/**
 * 是否至少有一道题记了答案。
 *
 * 评估接口用它放宽前置校验：只逐题记录、不粘贴整段记录是完全合理的用法，
 * 不该因为 transcript 为空就拒绝。
 */
export function hasAnyAnswer(questions: InterviewQuestion[]): boolean {
  return questions.some((q) => Boolean(q.answer?.trim()));
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run src/lib/recruit/answers.test.ts`
Expected: PASS，7 个测试全绿

- [ ] **Step 6: 全量测试与类型检查**

Run: `pnpm test && pnpm type-check`
Expected: 221 passed（改动前 214 + 新增 7）；type-check 零错误

- [ ] **Step 7: Commit**

```bash
git add src/types/recruit.ts src/lib/recruit/answers.ts src/lib/recruit/answers.test.ts
git commit -m "feat(recruit): 题目支持记录答案，新增答案统计纯函数"
```

---

## Task 2: i18n 新增文案

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

**用 Edit 定点插入，绝不整文件重写。**

- [ ] **Step 1: zh.json 在 `"copied": "已复制到剪贴板",` 之后插入**

```json
      "answer": "候选人回答",
      "answerPlaceholder": "边问边记，不用整理",
      "recorded": "{done}/{total} 已记录",
      "saving": "保存中…",
      "saved": "已保存",
      "saveRetry": "保存失败，点击重试",
      "selectOne": "从左侧选择一道题",
```

- [ ] **Step 2: zh.json 在 `"transcriptHint": "不需要逐题整理，速记或完整记录都可以",` 之后插入**

```json
      "transcriptSupplement": "逐题已记录 {done} 题，这里补充未逐题记录的部分",
```

- [ ] **Step 3: en.json 在 `"copied": "Copied to clipboard",` 之后插入**

```json
      "answer": "Candidate's answer",
      "answerPlaceholder": "Jot it down as they answer",
      "recorded": "{done}/{total} recorded",
      "saving": "Saving…",
      "saved": "Saved",
      "saveRetry": "Save failed — retry",
      "selectOne": "Pick a question on the left",
```

- [ ] **Step 4: en.json 在 `"transcriptHint": "No need to organize by question; rough notes work",` 之后插入**

```json
      "transcriptSupplement": "{done} answers recorded per question — add anything else here",
```

- [ ] **Step 5: 验证 key 路径递归一致**

```bash
node -e "
function paths(o,p=''){return Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?paths(v,p+k+'.'):[p+k]);}
const z=require('./messages/zh.json').recruit,e=require('./messages/en.json').recruit;
const pz=paths(z).sort(),pe=paths(e).sort();
console.log('zh:',pz.length,'en:',pe.length,'一致:',JSON.stringify(pz)===JSON.stringify(pe));
"
```
Expected: `zh: 128 en: 128 一致: true`（改动前 120，新增 8）

- [ ] **Step 6: 确认 diff 无删除行**

Run: `git diff --numstat messages/`
Expected: 每个文件 8 行新增、**0 行删除**。出现删除行说明整文件被重写了，回退重来。

- [ ] **Step 7: Commit**

```bash
git add messages/
git commit -m "feat(recruit): 逐题记录答案所需的文案"
```

---

## Task 3: 评估 prompt 按有无答案分流（TDD）

**Files:**
- Modify: `src/lib/ai/recruit-prompts.test.ts`
- Modify: `src/lib/ai/recruit-prompts.ts`

**这是本轮的核心业务逻辑改动。** 逐题记录最大的价值在这里兑现：消掉「模型把 A 题的回答归到 B 题」这类错误。

- [ ] **Step 1: 追加测试**

在 `src/lib/ai/recruit-prompts.test.ts` 的 `describe('buildEvaluationPrompt', ...)` 块**内部末尾**（最后一个 `it` 之后、`});` 之前）追加：

```ts
  it('填了答案的题，把答案写进 prompt', () => {
    const withAnswer: InterviewQuestion[] = [
      { ...questions[0], id: 'q1', answer: '双十一订单页白屏，先看监控发现接口 500' },
    ];
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: withAnswer,
      transcript: '整段记录',
    });
    expect(prompt).toContain('双十一订单页白屏，先看监控发现接口 500');
    expect(prompt).toContain('recorded answer');
  });

  it('没填答案的题不出现 recorded answer 行', () => {
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: '整段记录',
    });
    expect(prompt).not.toContain('recorded answer');
  });

  it('空白答案视同没填', () => {
    const blank: InterviewQuestion[] = [{ ...questions[0], answer: '   ' }];
    const { prompt } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions: blank,
      transcript: '整段记录',
    });
    expect(prompt).not.toContain('recorded answer');
  });

  it('system prompt 说明有答案的题不要再去记录里找', () => {
    const { system } = buildEvaluationPrompt({
      jobTitle: 'T',
      jobDescription: 'JD',
      resumeText: 'R',
      dimensions: DIMENSIONS,
      questions,
      transcript: 'x',
    });
    expect(system).toContain('recorded answer');
    expect(system).toContain('do not search the transcript');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/lib/ai/recruit-prompts.test.ts`
Expected: FAIL，4 个新测试失败（prompt 里还没有 `recorded answer`）

- [ ] **Step 3: 改 system prompt**

`src/lib/ai/recruit-prompts.ts` 的 `EVALUATION_SYSTEM` 常量，在 `Rules:` 段落里、`- For each question, locate the candidate's answer in the transcript.` 这条**之前**插入一条：

```
- Some questions include a "Candidate's recorded answer" line. For those, score that recorded answer directly — do not search the transcript for them, and always set "answered" to true.
```

- [ ] **Step 4: 改题目块构建**

同一文件里，把 `buildEvaluationPrompt` 中的 `questionBlocks` 构建替换成：

```ts
  const questionBlocks = input.questions
    .map((q, i) => {
      const base = `${i + 1}. [id: ${q.id}] [dimension: ${q.dimension}]
Question: ${q.question}
What it probes: ${q.intent}
Excellent answer: ${q.rubric.excellent}
Passing answer: ${q.rubric.pass}
Failing answer: ${q.rubric.fail}
Reference points: ${q.referencePoints.join('; ')}`;

      // 面试中逐题记下来的答案是确定的，直接给模型，省得它从整段速记里
      // 猜哪句对应哪题——那正是归错题的来源。
      const answer = q.answer?.trim();
      return answer ? `${base}\nCandidate's recorded answer: ${answer}` : base;
    })
    .join('\n\n');
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run src/lib/ai/recruit-prompts.test.ts`
Expected: PASS，10 个测试全绿（原 6 个 + 新增 4 个）

- [ ] **Step 6: 全量测试与类型检查**

Run: `pnpm test && pnpm type-check`
Expected: 225 passed（Task 1 后的 221 + 新增 4）；type-check 零错误

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/recruit-prompts.ts src/lib/ai/recruit-prompts.test.ts
git commit -m "feat(recruit): 评估 prompt 优先使用逐题记录的答案"
```

---

## Task 4: 评估接口前置校验放宽

**Files:**
- Modify: `src/app/api/recruit/candidates/[id]/evaluation/route.ts`

现在是「没有 transcript 就 400」。只逐题记录、不粘贴整段记录是完全合理的用法，不该被拒。

- [ ] **Step 1: 改校验**

`src/app/api/recruit/candidates/[id]/evaluation/route.ts` 顶部 import 补一行：

```ts
import { hasAnyAnswer } from '@/lib/recruit/answers';
```

把现有的这段：

```ts
    if (!candidate.transcript?.trim()) {
      return NextResponse.json({ error: 'Interview transcript is required' }, { status: 400 });
    }
```

替换成：

```ts
    // 逐题记录和粘贴整段记录二选一即可——只逐题记的场景 transcript 会是空的。
    if (!candidate.transcript?.trim() && !hasAnyAnswer(questions)) {
      return NextResponse.json({ error: 'Interview transcript is required' }, { status: 400 });
    }
```

注意 `questions` 变量在这一行之前已经定义（`const questions = (candidate.questions as InterviewQuestion[] | null) ?? []`），顺序没问题。

- [ ] **Step 2: 类型检查与测试**

Run: `pnpm type-check && pnpm test`
Expected: type-check 零错误；测试 225 全过

- [ ] **Step 3: 实跑验证两种情况**

先确认「都没有」仍然被拒。用一个干净的候选人：

```bash
JOB=e151b4dc-58a5-4af2-bbfb-964c265cbc34
FP='x-fingerprint: ui-state-check'
NEW=$(curl -s -X POST "http://localhost:3000/api/recruit/jobs/$JOB/candidates" \
  -H 'content-type: application/json' -H "$FP" -d '{"name":"校验测试"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).candidate.id))")
echo "新候选人 $NEW"
# 没题目 → 应该 400 "Generate questions first"
curl -s -X POST "http://localhost:3000/api/recruit/candidates/$NEW/evaluation" -H "$FP" -w "\nstatus=%{http_code}\n"
```
Expected: 400，错误信息是 `Generate questions first`（题目校验在前）。

再验「有答案没 transcript 能过前置校验」——给这个候选人塞一道带答案的题、清空 transcript，然后打评估接口：

```bash
curl -s -o /dev/null -X PATCH "http://localhost:3000/api/recruit/candidates/$NEW" \
  -H 'content-type: application/json' -H "$FP" -d '{
  "questions":[{"id":"t1","dimension":"logic","question":"测试题","intent":"i",
  "rubric":{"excellent":"a","pass":"b","fail":"c"},"followUps":[],"referencePoints":[],
  "estimatedMinutes":5,"difficulty":"medium","answer":"这是逐题记录的答案"}],
  "transcript":""}'
curl -s -X POST "http://localhost:3000/api/recruit/candidates/$NEW/evaluation" -H "$FP" -w "\nstatus=%{http_code}\n"
```
Expected: **不是 400**。因为没配 AI key，预期会走到 AI 调用并返回 400 `API key is required...`（`AIConfigError`）或 500——**关键是错误信息不再是 `Interview transcript is required`**，说明前置校验放行了。把实际返回贴进报告。

验完删掉这个测试候选人：
```bash
curl -s -o /dev/null -X DELETE "http://localhost:3000/api/recruit/candidates/$NEW" -H "$FP"
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/recruit/candidates/"
git commit -m "fix(recruit): 只逐题记录时也允许生成评价"
```

---

## Task 5: 题目列表与详情组件（B 主从双栏）

**Files:**
- Create: `src/components/recruit/question-list.tsx`
- Create: `src/components/recruit/question-detail.tsx`

本任务只建组件，Task 6 才接进面板。**中间态 type-check 可能因为 `question-card` 还在被引用而正常通过，这没问题。**

- [ ] **Step 1: 创建题目列表**

创建 `src/components/recruit/question-list.tsx`：

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countAnswered } from '@/lib/recruit/answers';
import type { InterviewQuestion } from '@/types/recruit';

const DIFFICULTY_DOT: Record<string, string> = {
  easy: 'bg-emerald-500',
  medium: 'bg-amber-500',
  hard: 'bg-red-500',
};

interface QuestionListProps {
  questions: InterviewQuestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function QuestionList({ questions, selectedId, onSelect }: QuestionListProps) {
  const t = useTranslations('recruit.questions');
  const done = countAnswered(questions);

  return (
    <div className="flex w-full flex-col gap-3 lg:w-[300px] lg:flex-none">
      <nav className="flex flex-col gap-1">
        {questions.map((q, i) => {
          const answered = Boolean(q.answer?.trim());
          const active = q.id === selectedId;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelect(q.id)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-brand bg-brand/5 font-medium'
                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]',
                  answered
                    ? 'bg-brand text-white'
                    : 'border border-zinc-300 text-zinc-400 dark:border-zinc-600',
                )}
              >
                {answered ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{q.question}</span>
              <span
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DIFFICULTY_DOT[q.difficulty])}
              />
            </button>
          );
        })}
      </nav>

      <p className="px-3 text-xs text-zinc-400">
        {t('recorded', { done, total: questions.length })}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 创建题目详情**

创建 `src/components/recruit/question-detail.tsx`。自动保存的防抖与状态都在这里：

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DimensionConfig, InterviewQuestion } from '@/types/recruit';

const RUBRIC_BAR = {
  excellent: 'bg-emerald-500',
  pass: 'bg-amber-500',
  fail: 'bg-red-500',
} as const;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface QuestionDetailProps {
  question: InterviewQuestion;
  index: number;
  dimensions: DimensionConfig[];
  saveState: SaveState;
  /** 答案变化时调用，父组件负责防抖与落库 */
  onAnswerChange: (questionId: string, answer: string) => void;
  /** 立即保存待存内容——保存失败后点「重试」用 */
  onFlush: () => void;
  onRemove: () => void;
}

export function QuestionDetail({
  question,
  index,
  dimensions,
  saveState,
  onAnswerChange,
  onFlush,
  onRemove,
}: QuestionDetailProps) {
  const t = useTranslations('recruit.questions');
  const label = dimensions.find((d) => d.key === question.dimension)?.label ?? question.dimension;
  // 父组件用 key={question.id} 渲染本组件，切题即重挂载，
  // 所以草稿用 useState 初始化就够，不需要 effect 同步。
  // 切题时冲刷未保存内容的责任在父组件的 onSelect 里。
  const [draft, setDraft] = useState(question.answer ?? '');

  return (
    <div className="min-w-0 flex-1 rounded-xl border bg-white p-5 dark:bg-zinc-900">
      <h3 className="text-[15px] font-semibold leading-relaxed">
        {index + 1}. {question.question}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{label}</Badge>
        <span className="text-xs text-zinc-400">
          {question.difficulty} · {t('minutes', { count: question.estimatedMinutes })}
        </span>
      </div>

      <Section title={t('intent')}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{question.intent}</p>
      </Section>

      <Section title={t('rubric')}>
        <div className="grid gap-1.5">
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

      <div className="mt-5 border-t pt-4">
        <Label htmlFor="answer" className="text-sm font-medium">
          {t('answer')}
        </Label>
        <Textarea
          id="answer"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onAnswerChange(question.id, e.target.value);
          }}
          placeholder={t('answerPlaceholder')}
          // Textarea 带 field-sizing-content，rows 无效，必须用 min-h
          className="mt-2 min-h-[160px]"
        />

        <div className="mt-2 flex items-center justify-between">
          <SaveIndicator state={saveState} onRetry={onFlush} />
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
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useTranslations('recruit.questions');
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('saving')}
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        {t('saved')}
      </span>
    );
  }
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-red-600"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {t('saveRetry')}
      </button>
    );
  }
  return <span />;
}

/** 小标题弱化、正文正常，四个区块才有层次。 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm type-check`
Expected: 零错误

- [ ] **Step 4: Commit**

```bash
git add src/components/recruit/
git commit -m "feat(recruit): 题目列表与详情组件"
```

---

## Task 6: 面板改为主从双栏并接入自动保存

**Files:**
- Modify: `src/components/recruit/questions-panel.tsx`
- Delete: `src/components/recruit/question-card.tsx`

防抖与落库逻辑放在面板里——它持有 `candidate` 和 `onUpdated`，是唯一知道怎么写回服务端的地方。

- [ ] **Step 1: 改写面板**

把 `src/components/recruit/questions-panel.tsx` **整个文件**替换成：

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Copy, Loader2 } from 'lucide-react';
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
import { QuestionList } from './question-list';
import { QuestionDetail, type SaveState } from './question-detail';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { summarizeQuestions } from '@/lib/recruit/summary';
import type {
  DimensionConfig,
  InterviewQuestion,
  RecruitCandidate,
  RecruitJob,
} from '@/types/recruit';

const AUTOSAVE_DELAY = 800;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const dimensions: DimensionConfig[] = candidate.dimensionsOverride ?? job.dimensions;
  const questions = useMemo(() => candidate.questions ?? [], [candidate.questions]);
  const hasResume = Boolean(candidate.resumeText?.trim());
  const summary = useMemo(() => summarizeQuestions(questions, dimensions), [questions, dimensions]);

  // 待保存的答案：key 是题目 id。落库前一直留在这里，
  // 保存失败也不清空——否则面试中输入的内容就真丢了。
  const pendingRef = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 题目变化时把选中项复位到第一题（重新生成、切换候选人都会走到这）
  useEffect(() => {
    if (questions.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && questions.some((q) => q.id === prev) ? prev : questions[0].id));
  }, [questions]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const next = questions.map((q) =>
      pending.has(q.id) ? { ...q, answer: pending.get(q.id) } : q,
    );
    setSaveState('saving');
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
      pending.clear();
      setSaveState('saved');
      onUpdated(data.candidate);
    } catch {
      // 刻意不清 pending：内容还在，用户点重试即可重发
      setSaveState('error');
      toast.error(t('errors.saveFailed'));
    }
  }, [questions, candidate.id, fingerprint, onUpdated, t]);

  const handleAnswerChange = useCallback(
    (questionId: string, answer: string) => {
      pendingRef.current.set(questionId, answer);
      setSaveState('saving');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY);
    },
    [flush],
  );

  // 卸载时清掉定时器，避免对已卸载组件 setState
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

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
      // 题都换了，之前记的答案没有意义，pending 也一并丢弃
      pendingRef.current.clear();
      setSaveState('idle');
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerate() {
    if (questions.length > 0) setRegenerateOpen(true);
    else void doGenerate();
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

  const selected = questions.find((q) => q.id === selectedId) ?? null;
  const selectedIndex = selected ? questions.findIndex((q) => q.id === selected.id) : -1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {questions.length > 0 ? t('questions.regenerate') : t('questions.generate')}
        </Button>
        {questions.length > 0 && (
          <Button variant="outline" onClick={handleCopyAll} className="cursor-pointer gap-2">
            <Copy className="h-4 w-4" />
            {t('questions.copyAll')}
          </Button>
        )}
        {questions.length > 0 && !generating && (
          <span className="ml-auto text-xs text-zinc-400">
            {t('questions.summary', { count: summary.count, minutes: summary.totalMinutes })}
          </span>
        )}
      </div>

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

      {!generating && questions.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <QuestionList
            questions={questions}
            selectedId={selectedId}
            // 切题前先把防抖窗口里未落库的输入冲刷掉。QuestionDetail 带
            // key={id} 会整体重挂载，指望它自己在卸载时保存是不可靠的。
            onSelect={(id) => {
              void flush();
              setSelectedId(id);
            }}
          />
          {selected ? (
            <QuestionDetail
              key={selected.id}
              question={selected}
              index={selectedIndex}
              dimensions={dimensions}
              saveState={saveState}
              onAnswerChange={handleAnswerChange}
              onFlush={() => void flush()}
              onRemove={() => handleRemove(selected.id)}
            />
          ) : (
            <div className="flex-1 rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
              {t('questions.selectOne')}
            </div>
          )}
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
              onClick={() => void doGenerate()}
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

- [ ] **Step 2: 删除旧题卡**

Run: `git rm src/components/recruit/question-card.tsx`

- [ ] **Step 3: 类型检查与测试**

Run: `pnpm type-check && pnpm test`
Expected: type-check 零错误；测试 225 全过。若报找不到 `question-card`，`grep -rn "QuestionCard" src/` 查残留引用。

- [ ] **Step 4: 视觉核对**

用文首的截图脚本模板，`<NAME>` 填 `qa-master-detail`，存到 `docs/design/screenshots/2026-08-20-qa-master-detail.png`。

**必须用 Read 工具亲眼看。**

Expected：左侧 300px 题目列表（题号圆圈、题干截断、难度色点、底部 `0/5 已记录`），右侧当前题详情（题干、维度、考察点、三档评分标准、追问、要点、答案输入框）。第一题默认选中，左边条是 brand 绿。

- [ ] **Step 5: 实跑验证自动保存**

在浏览器里手动做一遍（或用 puppeteer 脚本）：
1. 在答案框输入文字
2. 停手约 1 秒，右下角应出现「已保存」
3. 刷新页面，答案还在
4. 左侧该题的圆圈变成绿底对勾，底部计数变成 `1/5 已记录`

用脚本验证的写法：

```bash
cat > ./verify-save.mjs <<'EOF'
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
await p.type('#answer','自动保存验证：候选人说了缓存击穿的排查过程。');
await new Promise(r=>setTimeout(r,2000));
console.log('输入后状态条:', await p.evaluate(()=>document.body.innerText.match(/已保存|保存中|保存失败/)?.[0] ?? '无'));
await p.reload({waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,1500));
for (const tab of await p.$$('[role="tab"]')) {
  if ((await p.evaluate(e=>e.textContent,tab)).includes('面试题')) { await tab.click(); break; }
}
await new Promise(r=>setTimeout(r,1200));
console.log('刷新后答案:', await p.evaluate(()=>document.querySelector('#answer')?.value ?? '(空)'));
console.log('进度:', await p.evaluate(()=>document.body.innerText.match(/\d+\/\d+ 已记录/)?.[0] ?? '无'));
await p.screenshot({path:'docs/design/screenshots/2026-08-20-qa-autosave.png',fullPage:true});
await b.close();
EOF
node ./verify-save.mjs && rm -f ./verify-save.mjs
```

Expected 输出：
```
输入后状态条: 已保存
刷新后答案: 自动保存验证：候选人说了缓存击穿的排查过程。
进度: 1/5 已记录
```

把实际输出贴进报告。**如果刷新后答案是空的，说明自动保存没生效，必须查清楚再往下走**——这是这个功能的底线。

- [ ] **Step 6: Commit**

```bash
git add src/components/recruit/ docs/design/screenshots/
git commit -m "feat(recruit): 面试题改为主从双栏，支持逐题记录答案"
```

---

## Task 7: 收窄另外两页的空旷 + 评价页说明

**Files:**
- Modify: `src/components/recruit/job-overview.tsx`
- Modify: `src/components/recruit/evaluation-panel.tsx`

同一根因（内容拉满 1600）也存在于这两页。面试题页因为是主从双栏、横向用得满，不限宽。

- [ ] **Step 1: 岗位概览限宽**

`src/components/recruit/job-overview.tsx` 里，组件 return 的最外层 `<div className="space-y-6">` 改成：

```tsx
    <div className="max-w-4xl space-y-6">
```

- [ ] **Step 2: 评价报告区限宽**

`src/components/recruit/evaluation-panel.tsx` 里，最外层 `<div className="space-y-6">` 改成：

```tsx
    <div className="max-w-5xl space-y-6">
```

- [ ] **Step 3: 粘贴框补说明**

同一文件，找到展开态记录区里的这一行：

```tsx
          <p className="text-xs text-zinc-500">{t('evaluation.transcriptHint')}</p>
```

替换成（已逐题记录时换成补充说明）：

```tsx
          <p className="text-xs text-zinc-500">
            {recordedCount > 0
              ? t('evaluation.transcriptSupplement', { done: recordedCount })
              : t('evaluation.transcriptHint')}
          </p>
```

并在组件顶部、`hasQuestions` 那行附近补上计数（同时补 import）：

```tsx
import { countAnswered } from '@/lib/recruit/answers';
import type { InterviewQuestion } from '@/types/recruit';
```

```tsx
  const recordedCount = countAnswered((candidate.questions as InterviewQuestion[] | null) ?? []);
```

- [ ] **Step 4: 类型检查与测试**

Run: `pnpm type-check && pnpm test`
Expected: type-check 零错误；测试 225 全过

- [ ] **Step 5: 视觉核对**

截两张：岗位概览页和评价页。用文首模板改 URL 与输出名：
- 概览：访问 `http://localhost:3000/zh/recruit/${J}`（不用点 Tab），存 `docs/design/screenshots/2026-08-20-overview-narrow.png`
- 评价：点「评价」Tab，存 `docs/design/screenshots/2026-08-20-eval-narrow.png`

**两张都要用 Read 工具亲眼看。** Expected：内容不再横跨整屏，右侧是干净留白而非「断掉的卡片」；评价页粘贴框上方的说明文字随已记录题数变化。

- [ ] **Step 6: Commit**

```bash
git add src/components/recruit/ docs/design/screenshots/
git commit -m "feat(recruit): 概览与评价页内容限宽，粘贴框补充说明"
```

---

## Task 8: 全量核对

**Files:** 视核对结果而定，可能不改文件。

- [ ] **Step 1: 静态检查**

Run: `pnpm test && pnpm type-check`
Expected: 225 测试全过；type-check 零错误

Run:
```bash
pnpm lint 2>&1 | grep -A 40 "components/recruit\|lib/recruit\|app/\[locale\]/recruit" \
  | grep -E "error|warning" | grep -v "no-explicit-any" | head
```
Expected: 无输出

- [ ] **Step 2: 生产构建**

Run: `pnpm build 2>&1 | grep -E "recruit|Compiled successfully|Failed|Error:" | head -15`
Expected: `✓ Compiled successfully`，三个招聘页面与七个 API 路由都在

- [ ] **Step 3: 三档视口**

改文首模板，循环 `[['desktop',1440,900],['tablet',768,1024],['mobile',375,812]]`，每档点到「面试题」Tab 后截图存 `docs/design/screenshots/2026-08-20-qa-<name>.png`，并打印横向溢出检测：

```js
const o = await p.evaluate(()=>({d:document.documentElement.scrollWidth,w:window.innerWidth}));
console.log(name, '横向溢出=', o.d > o.w + 1);
```
Expected: 三档都是 `false`。**三张图都要用 Read 工具看**——重点确认窄屏下列表堆到详情上方、答案框仍可用。

- [ ] **Step 4: 英文无裸 key**

```bash
for p in "/en/recruit" "/en/recruit/e151b4dc-58a5-4af2-bbfb-964c265cbc34"; do
  echo -n "$p → "
  n=$(curl -s "http://localhost:3000$p" | grep -oE "recruit\.[a-zA-Z]+\.[a-zA-Z]+" | grep -v i18nKey | head -3)
  echo "${n:-无裸 key}"
done
```
Expected: 两行都是「无裸 key」

- [ ] **Step 5: 确认改动范围**

```bash
git diff --stat 0773d09..HEAD -- src/lib/db/ drizzle/
```
Expected: **无输出**。本轮不该碰数据层，也不该有 migration。

- [ ] **Step 6: 若有修改则提交**

```bash
git add -A && git commit -m "fix(recruit): 全量核对发现的问题修复"
```

没有修改就跳过。

---

## 验收清单

- [ ] 面试题页是左列表 + 右详情，横向空间用满
- [ ] 左列表项显示已答标记（绿底对勾 / 灰圈题号）、题干截断、难度色点
- [ ] 底部显示 `N/M 已记录`，随输入实时变化
- [ ] 答案输入停手约 1 秒自动保存，状态条显示「已保存」
- [ ] **刷新页面后答案仍在**
- [ ] 保存失败时内容不丢，状态条可点重试
- [ ] 切题时上一题未保存的输入会立即落库
- [ ] 重新生成题目后答案一并清空（题都换了）
- [ ] 只逐题记录、不粘贴整段记录时也能生成评价（不再报 `Interview transcript is required`）
- [ ] 有答案的题在评估 prompt 里带 `Candidate's recorded answer` 行，没答案的题不带
- [ ] 岗位概览页与评价报告区不再横跨整屏
- [ ] 评价页粘贴框上方说明随已记录题数变化
- [ ] 中英文无裸 key，三档视口无横向溢出
- [ ] `pnpm test && pnpm type-check` 全绿，生产构建通过
- [ ] `git diff -- src/lib/db/ drizzle/` 为空（无数据层改动、无 migration）

---

## 明确不做

键盘快捷键切题、答案的富文本或语音输入、答案的历史版本、逐题手动打分（评分仍由 AI 出）、答案的字数统计与计时。
