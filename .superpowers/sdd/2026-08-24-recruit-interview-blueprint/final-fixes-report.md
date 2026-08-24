# Final review fixes report

## Outcome

Resolved all final-review findings in one review-driven TDD pass:

- Blueprint prompts now include each configured dimension's key, weight, description, and exact question allocation from the same `allocateQuestions` contract used by the configuration UI.
- Blueprint validation enforces those exact per-dimension counts.
- Go-role detection recognizes common skill wording such as `Proficiency in Go and MySQL`, `精通 Go，熟悉 MySQL`, and `3 years of Go experience`, while rejecting `go-to-market`, `go-live`, and `Google Cloud` false positives.
- Go interviews with at least eight questions require two `go_fundamentals` slots plus at least one each of `middleware_database`, `project_deep_dive`, `system_scenario`, `communication_pressure`, and `hr_motivation`. Interviews with five through seven questions remain feasible without that full portfolio.
- Every slot's evidence must be a normalized exact member of the source-specific list: `resume` → `resumeFacts`, `jd` → `jdRequirements`, and `gap` → `gaps`. Normalization covers Unicode NFKC, surrounding/repeated whitespace, and case; paraphrases, substrings, and extensions are rejected.
- `GeneratedGroup.slots` now requires exported `IndexedQuestionSlot[]`, matching the runtime ordering dependency.
- Generated output must match every group and the complete blueprint exactly. Missing and extra questions both fail before persistence; the obsolete 70% acceptance helper and truncation behavior were removed.
- The implementation plan and design spec now describe the exact-count policy and strengthened blueprint contracts.

## RED evidence

Initial behavioral regressions:

```text
pnpm test src/lib/ai/recruit-blueprint.test.ts src/lib/ai/recruit-prompts.test.ts
Test Files  2 failed (2)
Tests       16 failed | 52 passed (68)
```

The failures covered allocation, required Go categories, evidence membership, exact-count assembly, common Go wording, and blueprint prompt contents.

Compile-time type regression before correcting `GeneratedGroup`:

```text
pnpm type-check
src/lib/ai/recruit-blueprint.test.ts(305,7): error TS2578: Unused '@ts-expect-error' directive.
```

Realistic overproduction regression found during diff review:

```text
pnpm test src/lib/ai/recruit-blueprint.test.ts
Test Files  1 failed (1)
Tests       1 failed | 39 passed (40)
```

That regression used ten indexed slots and eleven model questions, proving positional binding previously hid the extra result.

## GREEN evidence

Focused route-adjacent verification:

```text
pnpm test src/lib/ai/recruit-blueprint.test.ts src/lib/ai/recruit-prompts.test.ts src/lib/ai/recruit-schema.test.ts
Test Files  3 passed (3)
Tests       92 passed (92)
```

Final full verification before commit:

```text
pnpm test
Test Files  30 passed (30)
Tests       353 passed (353)

pnpm type-check
exit 0

pnpm exec eslint src/lib/ai/recruit-blueprint.ts src/lib/ai/recruit-blueprint.test.ts src/lib/ai/recruit-prompts.ts src/lib/ai/recruit-prompts.test.ts 'src/app/api/recruit/candidates/[id]/questions/route.ts'
exit 0

git diff --check
exit 0
```

Vitest emitted only the repository's existing Vite native-config and `vite-tsconfig-paths` advisory warnings; there were no test failures or runtime warnings from the changed code.

## Commit

- `8d1e975 fix(recruit): enforce interview blueprint contracts`

## Concerns

- No live model-provider generation was run in this final review pass. The prompt and pure orchestration boundaries are covered by automated tests.
- The stricter behavior deliberately rejects and preserves old questions when a provider paraphrases evidence, violates a dimension/category allocation, or returns a missing/extra question. This may surface model drift as a generation failure more often, but prevents invalid partial sets from being saved.
