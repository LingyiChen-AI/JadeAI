# Recruit Interview Blueprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form per-dimension question generation with a validated global interview blueprint that guarantees role-appropriate knowledge coverage and fact-grounded questions.

**Architecture:** Add a first model call that extracts résumé facts, JD requirements, gaps, and an exact list of question slots. Validate and normalize that blueprint, group its slots by competency for parallel generation, and bind generated content back to server-owned slot metadata before saving. Existing scoring remains dimension-based while question category, source, and evidence travel with each question.

**Tech Stack:** TypeScript, Next.js route handlers, Vercel AI SDK `generateText`, Zod v4, Vitest, React, next-intl.

**Spec:** `docs/superpowers/specs/2026-08-24-recruit-interview-blueprint-design.md`

## Global Constraints

- Do not copy or fetch third-party GitHub question-bank content at runtime.
- Do not add a database migration; persist new fields inside the existing questions JSON.
- Preserve short stems, follow-up ladders, rubrics, reference answers, red flags, skip status, recorded answers, and dimension-based scoring.
- `resume` questions may use only explicit résumé facts; `jd` questions must be hypothetical; `gap` questions must not imply prior experience.
- For Go roles with at least 8 questions, require two `go_fundamentals` slots and at least one each of `middleware_database`, `project_deep_dive`, `system_scenario`, `communication_pressure`, and `hr_motivation`.
- Persist only when generated questions match every planned slot exactly; any missing or extra result leaves the candidate's existing questions untouched.
- Preserve all pre-existing dirty-worktree changes; stage only named files for each commit and inspect `git diff --cached` before committing.

## File Structure

- Create `src/lib/ai/recruit-blueprint.ts`: blueprint normalization, coverage validation, grouping, and generated-question binding.
- Create `src/lib/ai/recruit-blueprint.test.ts`: pure behavior tests for the blueprint boundary.
- Modify `src/types/recruit.ts`: category, source, slot, blueprint, and question metadata types.
- Modify `src/lib/ai/recruit-schema.ts`: model-output schemas for blueprint and added question metadata compatibility.
- Modify `src/lib/ai/recruit-schema.test.ts`: schema parsing and rejection tests.
- Modify `src/lib/ai/recruit-prompts.ts`: blueprint prompt builder and slot-driven question prompt builder.
- Modify `src/lib/ai/recruit-prompts.test.ts`: prompt contract tests using final prompt output.
- Modify `src/app/api/recruit/candidates/[id]/questions/route.ts`: two-stage orchestration and exact-count save guard.
- Modify `src/lib/recruit/questions.ts`: old-question defaults for category, source, and evidence.
- Modify `src/lib/recruit/questions.test.ts`: compatibility tests.
- Modify `src/components/recruit/interview-stage.tsx`: category label beside the competency label.
- Modify `messages/zh.json` and `messages/en.json`: category labels.

---

### Task 1: Blueprint and Question Metadata Types

**Files:**
- Modify: `src/types/recruit.ts`
- Modify: `src/lib/ai/recruit-schema.ts`
- Test: `src/lib/ai/recruit-schema.test.ts`

**Interfaces:**
- Produces: `InterviewQuestionCategory`, `InterviewQuestionSource`, `QuestionSlot`, `InterviewBlueprint`.
- Produces: `interviewBlueprintOutputSchema` for parsing the first model call.
- Extends: `InterviewQuestion` with optional legacy-compatible `category`, `source`, and `evidence`.

- [ ] **Step 1: Write failing schema tests**

Add tests that parse this exact valid fixture and reject invalid category/source values:

```ts
const validBlueprint = {
  resumeFacts: ['食品产线项目使用 Go、MQTT、ONNX Runtime'],
  jdRequirements: ['Go 并发与高性能服务'],
  gaps: ['简历未证明 Prometheus 实践'],
  slots: [{
    category: 'go_fundamentals',
    source: 'jd',
    dimension: 'professional',
    topic: 'GMP 调度与阻塞',
    evidence: 'JD 要求 3 年以上 Golang 和高性能优化',
    difficulty: 'hard',
  }],
};

expect(interviewBlueprintOutputSchema.parse(validBlueprint)).toEqual(validBlueprint);
expect(() => interviewBlueprintOutputSchema.parse({
  ...validBlueprint,
  slots: [{ ...validBlueprint.slots[0], source: 'guess' }],
})).toThrow();
```

Also update a question-output fixture to prove missing `category/source/evidence` remains accepted for provider compatibility.

- [ ] **Step 2: Run schema tests and verify RED**

Run: `pnpm test src/lib/ai/recruit-schema.test.ts`

Expected: FAIL because `interviewBlueprintOutputSchema` and new types do not exist.

- [ ] **Step 3: Add exact types and Zod schemas**

Add:

```ts
export type InterviewQuestionCategory =
  | 'go_fundamentals'
  | 'backend_fundamentals'
  | 'middleware_database'
  | 'project_deep_dive'
  | 'system_scenario'
  | 'communication_pressure'
  | 'hr_motivation';

export type InterviewQuestionSource = 'resume' | 'jd' | 'gap';

export interface QuestionSlot {
  category: InterviewQuestionCategory;
  source: InterviewQuestionSource;
  dimension: string;
  topic: string;
  evidence: string;
  difficulty: QuestionDifficulty;
}

export interface InterviewBlueprint {
  resumeFacts: string[];
  jdRequirements: string[];
  gaps: string[];
  slots: QuestionSlot[];
}
```

Extend `InterviewQuestion` with optional fields to support historical JSON:

```ts
category?: InterviewQuestionCategory;
source?: InterviewQuestionSource;
evidence?: string;
```

Create strict Zod enums and `interviewBlueprintOutputSchema`; keep question-output metadata optional because the server will own and overwrite it.

- [ ] **Step 4: Run schema tests and type-check**

Run: `pnpm test src/lib/ai/recruit-schema.test.ts && pnpm type-check`

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the metadata boundary**

```bash
git add src/types/recruit.ts src/lib/ai/recruit-schema.ts src/lib/ai/recruit-schema.test.ts
git diff --cached
git commit -m "feat(recruit): define interview blueprint metadata"
```

### Task 2: Blueprint Validation, Grouping, and Slot Binding

**Files:**
- Create: `src/lib/ai/recruit-blueprint.ts`
- Create: `src/lib/ai/recruit-blueprint.test.ts`

**Interfaces:**
- Consumes: `InterviewBlueprint`, `QuestionSlot`, `DimensionConfig`, `InterviewQuestion`.
- Produces: `validateBlueprint(input: InterviewBlueprint, options: { questionCount: number; dimensions: DimensionConfig[]; isGoRole: boolean }): InterviewBlueprint`.
- Produces: `groupBlueprintSlots(slots: QuestionSlot[]): Array<{ dimension: string; slots: IndexedQuestionSlot[] }>`.
- Produces: `bindQuestionsToSlots(raw: QuestionsOutput['questions'], slots: QuestionSlot[]): QuestionsOutput['questions']`.

- [ ] **Step 1: Write failing pure-function tests**

Cover these literal cases:

```ts
expect(validateBlueprint(blueprintWith8SlotsAnd2Go, {
  questionCount: 8,
  dimensions,
  isGoRole: true,
}).slots).toHaveLength(8);

expect(() => validateBlueprint(blueprintWithOnly1GoSlot, {
  questionCount: 8,
  dimensions,
  isGoRole: true,
})).toThrow(/go_fundamentals/);

expect(() => validateBlueprint(blueprintWithUnknownDimension, {
  questionCount: 8,
  dimensions,
  isGoRole: true,
})).toThrow(/dimension/);

expect(groupBlueprintSlots([slotA, slotB, slotC])).toEqual([
  { dimension: 'professional', slots: [slotA, slotC] },
  { dimension: 'communication', slots: [slotB] },
]);

expect(bindQuestionsToSlots([rawQuestion], [slotA])[0]).toMatchObject({
  category: slotA.category,
  source: slotA.source,
  dimension: slotA.dimension,
  evidence: slotA.evidence,
  difficulty: slotA.difficulty,
});

```

Also test exact slot count, exact per-dimension allocation from configured weights, source/evidence membership, full Go portfolio coverage at 8+ questions, small-count feasibility, empty topic/evidence rejection, non-Go roles rejecting `go_fundamentals`, and stable first-seen dimension order.

- [ ] **Step 2: Run the new tests and verify RED**

Run: `pnpm test src/lib/ai/recruit-blueprint.test.ts`

Expected: FAIL because `recruit-blueprint.ts` does not exist.

- [ ] **Step 3: Implement minimal pure functions**

Reuse `allocateQuestions` so prompt, UI, and validation share one deterministic dimension-count contract. Validation must throw descriptive `Error` objects, enforce normalized exact evidence membership, and return a new blueprint without mutating input. `bindQuestionsToSlots` must use positional alignment and return at most `Math.min(raw.length, slots.length)` items.

- [ ] **Step 4: Run blueprint tests and type-check**

Run: `pnpm test src/lib/ai/recruit-blueprint.test.ts && pnpm type-check`

Expected: PASS with no type errors.

- [ ] **Step 5: Commit pure blueprint behavior**

```bash
git add src/lib/ai/recruit-blueprint.ts src/lib/ai/recruit-blueprint.test.ts
git diff --cached
git commit -m "feat(recruit): validate interview blueprints"
```

### Task 3: Global Blueprint Prompt and Slot-Driven Question Prompt

**Files:**
- Modify: `src/lib/ai/recruit-prompts.ts`
- Modify: `src/lib/ai/recruit-prompts.test.ts`

**Interfaces:**
- Produces: `buildInterviewBlueprintPrompt(input: QuestionsPromptInput): { system: string; prompt: string }`.
- Replaces: `DimensionQuestionsPromptInput.count` with `blueprint: InterviewBlueprint` and `slots: QuestionSlot[]` for `buildDimensionQuestionsPrompt`.
- Consumes: the blueprint facts, requirements, gaps, and exact slots.

- [ ] **Step 1: Write failing blueprint-prompt tests**

Assert the final prompt boundary includes the exact operational rules:

```ts
const { system, prompt } = buildInterviewBlueprintPrompt({
  jobTitle: 'Golang 开发工程师',
  jobDescription: '3 年以上 Golang，熟悉 gRPC、Redis、MySQL',
  resumeText: '1 年 Go；项目使用 Gin、gRPC、Redis',
  dimensions: DIMENSIONS,
  questionCount: 10,
});

expect(system).toContain('exactly 10 slots');
expect(system).toContain('at least 2 go_fundamentals');
expect(system).toContain('resumeFacts');
expect(system).toContain('jdRequirements');
expect(system).toContain('gaps');
expect(system).toContain('Never convert an inference into a résumé fact');
expect(prompt).toContain('Golang 开发工程师');
```

For `buildDimensionQuestionsPrompt`, pass two literal slots and assert both topics, evidence strings, sources, categories, global fact lists, and “one output question per slot, in order” appear.

- [ ] **Step 2: Run prompt tests and verify RED**

Run: `pnpm test src/lib/ai/recruit-prompts.test.ts`

Expected: FAIL because the blueprint builder and slot input do not exist.

- [ ] **Step 3: Implement the blueprint system prompt**

The system prompt must:

- output only the strict blueprint JSON shape;
- infer whether the role is Go-specific from title and JD;
- enforce exact slot count and minimum category coverage;
- list allowed categories and sources;
- prohibit invented metrics, architecture, incidents, ownership, and tools;
- assign each slot a valid configured dimension;
- use a mechanism → symptom → engineering decision topic shape for fundamentals.

- [ ] **Step 4: Convert question generation to slot-driven instructions**

Remove autonomous archetype selection from the question prompt. Render each slot as:

```text
Slot 1
category: go_fundamentals
source: jd
dimension: professional
topic: GMP scheduling and blocking calls
evidence: JD requires Go performance optimization
difficulty: hard
```

Include all blueprint fact lists and require exactly one question per slot in the same order. Preserve existing JSON response shape and deep follow-up instructions.

- [ ] **Step 5: Run prompt tests and type-check**

Run: `pnpm test src/lib/ai/recruit-prompts.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 6: Commit prompt builders**

This file already contains approved uncommitted prompt improvements. Review the complete staged diff and commit them together with the blueprint conversion rather than discarding them.

```bash
git add src/lib/ai/recruit-prompts.ts src/lib/ai/recruit-prompts.test.ts
git diff --cached
git commit -m "feat(recruit): generate questions from interview blueprint"
```

### Task 4: Two-Stage Route Orchestration and Save Protection

**Files:**
- Modify: `src/app/api/recruit/candidates/[id]/questions/route.ts`
- Test: `src/lib/ai/recruit-blueprint.test.ts`

**Interfaces:**
- Consumes: `buildInterviewBlueprintPrompt`, `interviewBlueprintOutputSchema`, `validateBlueprint`, `groupBlueprintSlots`, `bindQuestionsToSlots`.
- Produces: persisted `InterviewQuestion[]` with server-generated IDs, `status: 'pending'`, and server-owned slot metadata.

- [ ] **Step 1: Add failing orchestration-boundary tests to pure helpers**

Add a helper `assembleGeneratedQuestions(groups, plannedCount)` with this contract:

```ts
type GeneratedGroup = {
  slots: IndexedQuestionSlot[];
  questions: QuestionsOutput['questions'];
};

assembleGeneratedQuestions(groups: GeneratedGroup[], plannedCount: number): QuestionsOutput['questions'];
```

Test that it preserves blueprint order using an explicit `slotIndex` attached internally during grouping, rejects both 6/10 and 7/10 results, rejects 11/10 rather than truncating, and exposes the indexed-slot requirement in its public input type.

- [ ] **Step 2: Run helper tests and verify RED**

Run: `pnpm test src/lib/ai/recruit-blueprint.test.ts`

Expected: FAIL because `assembleGeneratedQuestions` does not exist.

- [ ] **Step 3: Implement ordered assembly**

Keep the public `QuestionSlot` unchanged. Pair each slot with its original index during grouping, expose that indexed slot type to assembly, bind returned questions positionally within a group, flatten, sort by original index, and require the assembled count to equal `plannedCount` exactly.

- [ ] **Step 4: Replace route planning with two model stages**

In the route:

1. Build and call the blueprint prompt with `maxOutputTokens: 8192`.
2. Parse with `interviewBlueprintOutputSchema`.
3. Validate against configured dimensions and exact `job.questionCount`.
4. Group slots and generate groups concurrently with `Promise.allSettled`.
5. Assemble generated questions and reject any missing or extra results before any repository update.
6. Add UUID and `status: 'pending'` only after successful assembly.
7. Persist once; do not clear old questions before success.

Detect a Go role using a small exported pure helper tested with `Golang`, `Go backend`, `Java`, and false-positive text such as `Google Cloud`.

- [ ] **Step 5: Run route-adjacent tests and type-check**

Run: `pnpm test src/lib/ai/recruit-blueprint.test.ts src/lib/ai/recruit-schema.test.ts src/lib/ai/recruit-prompts.test.ts && pnpm type-check`

Expected: PASS.

- [ ] **Step 6: Commit orchestration**

The route already contains the approved uncommitted `status: 'pending'` change. Keep it in the staged diff.

```bash
git add src/app/api/recruit/candidates/[id]/questions/route.ts src/lib/ai/recruit-blueprint.ts src/lib/ai/recruit-blueprint.test.ts
git diff --cached
git commit -m "feat(recruit): orchestrate two-stage question generation"
```

### Task 5: Historical Compatibility and Category Display

**Files:**
- Modify: `src/lib/recruit/questions.ts`
- Modify: `src/lib/recruit/questions.test.ts`
- Modify: `src/components/recruit/interview-stage.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

**Interfaces:**
- Extends: `normalizeQuestion` to always return canonical category/source/evidence values.
- Consumes: `InterviewQuestion.category` in the interview-stage header.

- [ ] **Step 1: Write failing normalization tests**

Add:

```ts
const [legacy] = normalizeQuestions([legacyQuestion] as never)!;
expect(legacy).toMatchObject({
  category: 'project_deep_dive',
  source: 'resume',
  evidence: '',
});

const [modern] = normalizeQuestions([{
  ...legacyQuestion,
  category: 'go_fundamentals',
  source: 'jd',
  evidence: 'JD 要求 Go 高性能优化',
}] as never)!;
expect(modern).toMatchObject({
  category: 'go_fundamentals',
  source: 'jd',
  evidence: 'JD 要求 Go 高性能优化',
});
```

- [ ] **Step 2: Run normalization tests and verify RED**

Run: `pnpm test src/lib/recruit/questions.test.ts`

Expected: FAIL because metadata defaults are missing.

- [ ] **Step 3: Implement compatibility defaults**

Validate category/source against literal sets in `normalizeQuestion`; invalid legacy values receive the same defaults. Preserve skip status, answer, follow-ups, reference points, and red flags unchanged.

- [ ] **Step 4: Add category translations and badge**

Add `recruit.questions.categories.<category>` in both locale files. In `interview-stage.tsx`, render an outline badge immediately after the competency badge:

```tsx
{current.category && (
  <Badge variant="outline" className="text-zinc-500">
    {t(`questions.categories.${current.category}`)}
  </Badge>
)}
```

Do not show `source` or `evidence` in this release.

- [ ] **Step 5: Run compatibility tests, lint, and type-check**

Run:

```bash
pnpm test src/lib/recruit/questions.test.ts
pnpm exec eslint src/lib/recruit/questions.ts src/lib/recruit/questions.test.ts src/components/recruit/interview-stage.tsx
pnpm type-check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit compatibility and UI**

These files already contain approved uncommitted skip-status changes. Preserve them and inspect the staged diff before committing.

```bash
git add src/lib/recruit/questions.ts src/lib/recruit/questions.test.ts src/components/recruit/interview-stage.tsx messages/zh.json messages/en.json
git diff --cached
git commit -m "feat(recruit): display interview question categories"
```

### Task 6: Evaluation Context and End-to-End Verification

**Files:**
- Modify: `src/lib/ai/recruit-prompts.ts`
- Modify: `src/lib/ai/recruit-prompts.test.ts`
- Modify: `src/app/api/recruit/candidates/[id]/evaluation/route.ts` only if filtering needs adjustment after type changes.
- Test: existing recruit test suite.

**Interfaces:**
- Extends: `buildEvaluationPrompt` question blocks with category, source, and evidence.
- Preserves: `questionsForEvaluation` filtering of `status === 'skipped'`.

- [ ] **Step 1: Write a failing evaluation-prompt test**

Create a `jd` scenario fixture and assert:

```ts
expect(prompt).toContain('Category: system_scenario');
expect(prompt).toContain('Source: jd');
expect(prompt).toContain('Evidence: JD requires high-concurrency AI conversations');
expect(system).toContain('A JD-sourced scenario is hypothetical');
```

Also retain the existing test that skipped questions are removed before evaluation.

- [ ] **Step 2: Run prompt and skip tests and verify RED**

Run: `pnpm test src/lib/ai/recruit-prompts.test.ts src/lib/recruit/questions.test.ts src/lib/recruit/answers.test.ts`

Expected: the new metadata assertions FAIL while skip tests remain green.

- [ ] **Step 3: Add metadata to evaluation context**

Render metadata only when present and instruct the evaluator not to treat JD/gap scenarios as evidence that the candidate performed that work. Do not change scoring aggregation.

- [ ] **Step 4: Run full automated verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm lint
git diff --check
```

Expected: all commands exit 0; Vitest reports zero failed files and tests.

- [ ] **Step 5: Perform one controlled generation smoke test**

Use the existing Go candidate only after confirming the running development server uses the current code. Regenerate questions through the local UI or route, then verify the saved set contains:

- at least two `go_fundamentals` questions;
- at least one database/middleware question;
- project, system scenario, communication/pressure, and HR coverage;
- no claim that the candidate used `runtime.LockOSThread`, Worker Pool, Prometheus, or another implementation absent from the résumé;
- exactly the configured total question count; any incomplete or extra generation must fail without overwriting the previous set.

Do not record answers, skip questions, or generate an evaluation during this smoke test.

- [ ] **Step 6: Commit final evaluation context**

```bash
git add src/lib/ai/recruit-prompts.ts src/lib/ai/recruit-prompts.test.ts src/app/api/recruit/candidates/[id]/evaluation/route.ts
git diff --cached
git commit -m "feat(recruit): ground interview evaluation context"
```

- [ ] **Step 7: Report evidence**

Report exact test counts, type-check/lint results, smoke-test category distribution, any generation failures, and all commits created. Do not claim completion without fresh command output from Step 4 and observed question data from Step 5.
