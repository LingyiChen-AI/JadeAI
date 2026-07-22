# Direct-Edit Export Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated export workbench where users edit the rendered A4 resume in place, then save the server-confirmed version before downloading any existing export format.

**Architecture:** A local draft controller owns a deep-cloned resume and never touches the formal Zustand store. `ResumePreview` receives an optional editing contract; ordinary preview remains unchanged, while editable render primitives route stable field paths into the draft. A transaction state machine saves with the baseline revision and only then invokes the existing export endpoint.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand (formal editor only), next-intl, dnd-kit, Vitest, Testing Library.

---

## File Structure

**Create**

- `src/lib/export-workbench/draft.ts`: cloning, normalization, canonical dirty comparison, validation, immutable field and structure mutations.
- `src/lib/export-workbench/draft.test.ts`: isolation, nested references, validation, structure and baseline tests.
- `src/lib/export-workbench/export-client.ts`: existing export query mapping, response filename extraction, and blob download boundary.
- `src/lib/export-workbench/export-client.test.ts`: six-format URL and filename regression tests.
- `src/lib/export-workbench/transaction.ts`: save-before-export state machine and retry-export behavior.
- `src/lib/export-workbench/transaction.test.ts`: ordering, failures, re-entry guard, retry, and cleanup tests.
- `src/components/preview/editable-resume-context.tsx`: optional edit context and typed editable field primitive.
- `src/components/preview/editable-resume-context.test.tsx`: in-place input behavior and ordinary-render compatibility.
- `src/components/export-workbench/use-export-workbench.ts`: route loader, draft lifecycle, template resolution, transaction, and unload guard.
- `src/components/export-workbench/use-export-workbench.test.tsx`: hook lifecycle, dirty baseline, and `beforeunload` tests.
- `src/components/export-workbench/export-workbench-page.tsx`: A4-first page, surrounding tools, confirmation dialog, and responsive structure.
- `src/components/export-workbench/export-workbench-page.test.tsx`: main interaction and status tests.
- `src/components/export-workbench/workbench-toolbar.tsx`: Back, unsaved state, template/theme entry, format selector, and primary action.
- `src/components/export-workbench/workbench-structure-tools.tsx`: module/entry add, remove, visibility, and ordering controls around the A4 page.
- `src/app/[locale]/editor/[id]/export/page.tsx`: localized workbench route.

**Modify**

- `src/components/editor/editor-toolbar.tsx`: navigate both export actions to the workbench.
- `src/components/editor/theme-editor.tsx`: add a controlled draft adapter while preserving existing store defaults.
- `src/components/templates/template-selector.tsx`: reuse existing controlled selection without behavioral change.
- `src/components/preview/resume-preview.tsx`: provide optional editable context to both legacy and declarative renderers.
- `src/lib/templates/template-document.ts`: retain source field metadata through declarative transformation.
- `src/components/preview/declarative-template-document.tsx`: render editable runs from source metadata.
- `src/components/preview/templates/*.tsx`: wrap every visible resume scalar/list value with the shared editable primitive while preserving ordinary markup and CSS.
- `src/components/preview/templates/rich-text-contract.test.ts`: verify ordinary rich-text output stays intact in edit-disabled mode.
- `src/components/preview/templates/legacy-template-registry.test.ts`: assert every registered legacy template exposes editable fields in edit mode.
- `messages/zh.json`: add workbench strings.
- `messages/en.json`: add matching English workbench strings.

## Task 1: Isolated Draft Domain

**Files:**
- Create: `src/lib/export-workbench/draft.ts`
- Create: `src/lib/export-workbench/draft.test.ts`

- [ ] **Step 1: Write failing isolation and dirty-baseline tests**

Create a representative resume with nested margins, work entries, highlights, template snapshot, and resolved template. Assert:

```ts
const session = createExportDraft(source);
session.draft.sections[0].content.items[0].highlights[0] = 'changed';
session.draft.themeConfig.margin.top = 8;

expect(source.sections[0].content.items[0].highlights[0]).toBe('original');
expect(session.baseline.sections[0].content.items[0].highlights[0]).toBe('original');
expect(session.draft.themeConfig.margin).not.toBe(source.themeConfig.margin);
expect(isExportDraftDirty(session)).toBe(true);
```

Also assert `acceptSavedResume(session, savedResume)` creates a clean baseline without sharing nested references.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm.cmd vitest run src/lib/export-workbench/draft.test.ts`

Expected: FAIL because `createExportDraft`, `isExportDraftDirty`, and `acceptSavedResume` do not exist.

- [ ] **Step 3: Implement clone, canonical comparison, and saved baseline**

Implement these public contracts:

```ts
export interface ExportDraftSession {
  baseline: Resume;
  draft: Resume;
  pendingBinding: ClientTemplateBindingChoice | null;
}

export function createExportDraft(resume: Resume): ExportDraftSession;
export function isExportDraftDirty(session: ExportDraftSession): boolean;
export function acceptSavedResume(
  session: ExportDraftSession,
  saved: Resume,
): ExportDraftSession;
```

Use `structuredClone` separately for baseline and draft. Normalize every section with `normalizeSectionContent`. Canonical comparison must omit `createdAt`, `updatedAt`, and `resolvedTemplate`, but include title, persisted template binding fields, theme, visibility, section order, and content.

- [ ] **Step 4: Add failing immutable mutation and validation tests**

Cover:

```ts
expect(updateDraftField(session, {
  sectionId: 'work-1', itemId: 'job-1', fieldPath: ['highlights', 0], value: 'new',
}).draft.sections[1].content.items[0].highlights[0]).toBe('new');

expect(validateExportDraft(invalid).issues).toContainEqual({ code: 'missing_section_id' });
```

Add tests for module/entry create, delete, reorder, title, visibility, theme, and template binding changes without mutating the input session.

- [ ] **Step 5: Run RED, implement minimal domain mutations, then run GREEN**

Use discriminated mutation inputs and clone only the changed resume/section/content/array levels. Add comments explaining why mutations cannot call the formal store or autosave.

Run: `pnpm.cmd vitest run src/lib/export-workbench/draft.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/export-workbench/draft.ts src/lib/export-workbench/draft.test.ts
git commit -m "feat: add isolated export draft domain"
```

## Task 2: Export Client and Save-Then-Export Transaction

**Files:**
- Create: `src/lib/export-workbench/export-client.ts`
- Create: `src/lib/export-workbench/export-client.test.ts`
- Create: `src/lib/export-workbench/transaction.ts`
- Create: `src/lib/export-workbench/transaction.test.ts`

- [ ] **Step 1: Write failing six-format contract tests**

Assert exact query mapping:

```ts
expect(buildExportUrl('r1', 'pdf')).toBe('/api/resume/r1/export?format=pdf');
expect(buildExportUrl('r1', 'pdf-one-page')).toBe('/api/resume/r1/export?format=pdf&fitOnePage=true');
expect(buildExportUrl('r1', 'docx')).toBe('/api/resume/r1/export?format=docx');
expect(buildExportUrl('r1', 'html')).toBe('/api/resume/r1/export?format=html');
expect(buildExportUrl('r1', 'txt')).toBe('/api/resume/r1/export?format=txt');
expect(buildExportUrl('r1', 'json')).toBe('/api/resume/r1/export?format=json');
```

Test UTF-8 and RFC 5987 `Content-Disposition` filename parsing and title/timestamp fallback.

- [ ] **Step 2: Run RED, implement export contracts, then run GREEN**

Run: `pnpm.cmd vitest run src/lib/export-workbench/export-client.test.ts`

Expected RED: missing module. Expected GREEN: all URL and filename cases pass.

- [ ] **Step 3: Write failing transaction ordering tests**

Inject `saveDraft`, `exportSaved`, and `download` functions. Record calls and assert:

```ts
expect(events).toEqual(['save:start', 'save:success:4', 'export:start:4', 'download']);
```

Add separate tests asserting save failure produces no export, saved/export failure produces `saved_export_failed`, retry calls only export/download, and two simultaneous `run()` calls share or reject the in-flight operation without a second download.

- [ ] **Step 4: Run RED and implement the transaction state machine**

Public states:

```ts
type ExportTransactionState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'exporting'; saved: Resume }
  | { status: 'success'; saved: Resume }
  | { status: 'save_failed'; error: Error }
  | { status: 'saved_export_failed'; saved: Resume; error: Error };
```

The in-flight promise is assigned before awaiting save. `retryExport()` is valid only from `saved_export_failed`. Add a comment at the save/export boundary explaining that the export API reads repository state.

- [ ] **Step 5: Run focused tests**

Run: `pnpm.cmd vitest run src/lib/export-workbench/export-client.test.ts src/lib/export-workbench/transaction.test.ts`

Expected: PASS, with no duplicate save/download calls.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/export-workbench/export-client.ts src/lib/export-workbench/export-client.test.ts src/lib/export-workbench/transaction.ts src/lib/export-workbench/transaction.test.ts
git commit -m "feat: enforce save before resume export"
```

## Task 3: Backward-Compatible Editable Preview Primitive

**Files:**
- Create: `src/components/preview/editable-resume-context.tsx`
- Create: `src/components/preview/editable-resume-context.test.tsx`
- Modify: `src/components/preview/resume-preview.tsx`

- [ ] **Step 1: Write failing ordinary and edit-mode tests**

Render the same primitive without and with an edit contract:

```tsx
render(<EditableResumeValue source={source}>Alice</EditableResumeValue>);
expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

render(
  <EditableResumeProvider value={{ enabled: true, updateField }}>
    <EditableResumeValue source={source}>Alice</EditableResumeValue>
  </EditableResumeProvider>,
);
await user.click(screen.getByText('Alice'));
await user.clear(screen.getByRole('textbox', { name: 'Name' }));
await user.type(screen.getByRole('textbox'), 'Alicia{Enter}');
expect(updateField).toHaveBeenCalledWith(source, 'Alicia');
```

Cover Escape cancellation, multiline blur, list values, empty placeholders, and accessible labels.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd vitest run src/components/preview/editable-resume-context.test.tsx`

Expected: FAIL because the provider and primitive do not exist.

- [ ] **Step 3: Implement the edit context and primitive**

Use this source contract:

```ts
export interface ResumeFieldSource {
  sectionId: string;
  itemId?: string;
  fieldPath: readonly (string | number)[];
  kind: 'text' | 'multiline' | 'rich-text' | 'date' | 'url' | 'list-value';
  label: string;
}
```

When editing is disabled, return children without wrappers that alter layout. When enabled, use an inline, typography-inheriting input/textarea and workbench-only focus outline. Keep draft state inside the field until commit so Escape can restore the entry value.

- [ ] **Step 4: Pass the optional contract through `ResumePreview`**

Add `edit?: EditableResumeContract` to `ResumePreviewProps`, wrap both renderer branches in the provider only when supplied, and keep existing callers source-compatible.

- [ ] **Step 5: Run GREEN and existing preview tests**

Run: `pnpm.cmd vitest run src/components/preview/editable-resume-context.test.tsx src/components/preview/utils.test.ts src/components/preview/templates/rich-text-contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/preview/editable-resume-context.tsx src/components/preview/editable-resume-context.test.tsx src/components/preview/resume-preview.tsx
git commit -m "feat: add optional inline resume editing contract"
```

## Task 4: Preserve Declarative Source Metadata

**Files:**
- Modify: `src/lib/templates/template-document.ts`
- Modify: `src/lib/templates/template-document.test.tsx`
- Modify: `src/components/preview/declarative-template-document.tsx`
- Create: `src/components/preview/declarative-template-document.editing.test.tsx`

- [ ] **Step 1: Write failing metadata tests**

Build a document from a resume containing personal info, work items, dates, rich descriptions, highlights, and skills. Assert each editable text run carries its `ResumeFieldSource`, including item IDs and list indices. Combined display sentences must use multiple runs rather than one ambiguous source.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd vitest run src/lib/templates/template-document.test.tsx src/components/preview/declarative-template-document.editing.test.tsx`

Expected: FAIL because document runs lack source metadata.

- [ ] **Step 3: Extend the template document contract**

Add optional `source?: ResumeFieldSource` to text runs. Populate it while reading normalized resume fields. The serialized HTML path ignores `source`, ensuring exported HTML remains presentation-only.

- [ ] **Step 4: Render sourced runs with `EditableResumeValue`**

In `DeclarativeTemplateDocument`, keep current `dangerouslySetInnerHTML` behavior for edit-disabled rich text. In edit mode, use the editable primitive with the raw source value; do not round-trip rendered HTML into resume data.

- [ ] **Step 5: Run focused and serialization regression tests**

Run: `pnpm.cmd vitest run src/lib/templates/template-document.test.tsx src/components/preview/declarative-template-document.editing.test.tsx src/lib/templates/render-artifacts.test.ts`

Expected: PASS, and serialized HTML snapshots remain unchanged except where prior snapshots intentionally omit runtime metadata.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/templates/template-document.ts src/lib/templates/template-document.test.tsx src/components/preview/declarative-template-document.tsx src/components/preview/declarative-template-document.editing.test.tsx
git commit -m "feat: retain editable sources in template documents"
```

## Task 5: Instrument Every Legacy Template

**Files:**
- Modify: all registered files under `src/components/preview/templates/`
- Modify: `src/components/preview/templates/legacy-template-registry.test.ts`
- Modify: `src/components/preview/templates/rich-text-contract.test.ts`

- [ ] **Step 1: Add a failing registry-wide editability contract**

For every slug from the legacy template registry, render a fixture containing a unique value for every supported scalar/list field with editing enabled. Assert the DOM contains an editable source marker for each expected path and the visible text inventory still contains every fixture value.

- [ ] **Step 2: Run RED and capture the missing-path report**

Run: `pnpm.cmd vitest run src/components/preview/templates/legacy-template-registry.test.ts`

Expected: FAIL with the precise template slugs and missing field paths.

- [ ] **Step 3: Replace raw field output with shared primitives**

In each registered template, wrap personal fields, section titles, entry fields, descriptions, technologies, highlights, skills, links, and dates with `EditableResumeValue`. Use stable `section.id`, item/category ID, and array index. Do not change classes, style objects, element order, separators, conditional rendering, or ordinary preview behavior.

For fields currently combined with punctuation, keep punctuation outside editable primitives:

```tsx
<EditableResumeValue source={positionSource}>{item.position}</EditableResumeValue>
{item.company && <>{' at '}<EditableResumeValue source={companySource}>{item.company}</EditableResumeValue></>}
```

For Markdown fields, pass the raw Markdown value to the rich-text primitive and retain `md()` output when edit mode is disabled.

- [ ] **Step 4: Iterate the registry test until every template is GREEN**

Run after each template family: `pnpm.cmd vitest run src/components/preview/templates/legacy-template-registry.test.ts src/components/preview/templates/rich-text-contract.test.ts`

Expected: PASS for all registered slugs with unchanged normal rich-text rendering.

- [ ] **Step 5: Commit**

```powershell
git add src/components/preview/templates
git commit -m "feat: enable inline editing across resume templates"
```

## Task 6: Workbench Hook, Controlled Theme Adapter, and Leave Guard

**Files:**
- Create: `src/components/export-workbench/use-export-workbench.ts`
- Create: `src/components/export-workbench/use-export-workbench.test.tsx`
- Modify: `src/components/editor/theme-editor.tsx`
- Modify: `src/components/templates/template-selector.tsx`

- [ ] **Step 1: Write failing hook lifecycle tests**

Mock GET/PUT/export responses. Assert the hook deep-clones loaded data, mutations do not call `useResumeStore`, template responses cannot overwrite a newer choice, successful save resets dirty state, and export failure retains the saved baseline.

- [ ] **Step 2: Write failing unload-guard tests**

Assert `beforeunload` is registered only while dirty, removed after save, and removed on unmount. Test the shared confirmation callback used by toolbar Back and history navigation.

- [ ] **Step 3: Run RED**

Run: `pnpm.cmd vitest run src/components/export-workbench/use-export-workbench.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 4: Implement the route-local controller**

The hook owns `ExportDraftSession`, selected format, load state, transaction state, template request sequence, and abort controllers. Save sends the full persisted draft payload with `baseline.revision`; it returns the parsed saved resume to the transaction.

Use a mounted generation guard for load/template/save results. Add comments at the two state boundaries: why the formal store is not used, and why baseline updates occur before export.

- [ ] **Step 5: Add controlled props to ThemeEditor**

Add an optional adapter:

```ts
interface ThemeEditorAdapter {
  resume: Resume;
  pendingBinding: ClientTemplateBindingChoice | null;
  updateTheme(updates: Partial<ThemeConfig>): void;
  selectTemplate(choice: ClientTemplateBindingChoice, resolution?: ResolvedTemplate): void;
}
```

When absent, retain the current formal-store behavior exactly. When present, never call `useResumeStore.setState()` or `_scheduleSave()`.

- [ ] **Step 6: Run hook, theme, and template tests**

Run: `pnpm.cmd vitest run src/components/export-workbench/use-export-workbench.test.tsx src/components/templates/template-selector.test.tsx src/lib/templates/editor-template-binding.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/export-workbench/use-export-workbench.ts src/components/export-workbench/use-export-workbench.test.tsx src/components/editor/theme-editor.tsx src/components/templates/template-selector.tsx
git commit -m "feat: add export workbench draft controller"
```

## Task 7: A4-First Workbench Page and Navigation

**Files:**
- Create: `src/components/export-workbench/export-workbench-page.tsx`
- Create: `src/components/export-workbench/export-workbench-page.test.tsx`
- Create: `src/components/export-workbench/workbench-toolbar.tsx`
- Create: `src/components/export-workbench/workbench-structure-tools.tsx`
- Create: `src/app/[locale]/editor/[id]/export/page.tsx`
- Modify: `src/components/editor/editor-toolbar.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Write failing page interaction tests**

Assert the A4 preview receives the draft edit contract, no separate field editor exists, toolbar exposes all six formats, primary action reflects saving/exporting states, saved/export failure shows Retry Export, and repeated clicks remain disabled.

Assert Back with a dirty draft opens the localized confirmation dialog and cancellation retains the rendered draft value.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd vitest run src/components/export-workbench/export-workbench-page.test.tsx`

Expected: FAIL because workbench components do not exist.

- [ ] **Step 3: Implement the responsive A4-first page**

Desktop: compact structure tools beside a centered A4 page; template/theme controls use a sheet or side panel and never replace the page. Mobile: A4 page stays primary, structure/theme actions use sheets, and format plus Save and Export remain reachable in a bottom action area.

Use Lucide icons, accessible names, status regions, stable A4 dimensions, and existing brand/theme tokens. Do not render AI, import, share, JD, translate, grammar, or cover-letter controls.

- [ ] **Step 4: Implement module and entry structure controls**

Use existing section types and `generateId()`. Add dnd-kit pointer and keyboard ordering plus explicit move controls for mobile. All callbacks dispatch draft-domain mutations only.

- [ ] **Step 5: Add the route and change export navigation**

The route unwraps `{ id }` and renders `ExportWorkbenchPage`. In both desktop and mobile toolbar actions, replace `openModal('export')` with:

```ts
router.push(`/editor/${resumeId}/export`);
```

Remove only the now-unused `ExportDialog` mount and export modal branch from `EditorPage`; keep every other layout node and capability untouched.

- [ ] **Step 6: Add matching translations**

Create identical key structures under `exportWorkbench` in `messages/zh.json` and `messages/en.json` for title, dirty state, field placeholders, format labels, validation, save failure, conflict, saved/export failure, retry, leave confirmation, structure commands, and statuses.

- [ ] **Step 7: Run page and editor regressions**

Run: `pnpm.cmd vitest run src/components/export-workbench/export-workbench-page.test.tsx src/components/editor/section-wrapper.test.tsx src/hooks/use-editor.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/components/export-workbench src/app/[locale]/editor/[id]/export/page.tsx src/components/editor/editor-toolbar.tsx src/app/[locale]/editor/[id]/page.tsx messages/zh.json messages/en.json
git commit -m "feat: add A4 direct-edit export workbench"
```

## Task 8: Full Verification and Browser QA

**Files:**
- Modify only files required by defects reproduced during verification.

- [ ] **Step 1: Run all focused feature tests**

Run:

```powershell
pnpm.cmd vitest run src/lib/export-workbench src/components/export-workbench src/components/preview/editable-resume-context.test.tsx src/components/preview/declarative-template-document.editing.test.tsx src/components/preview/templates/legacy-template-registry.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run existing export API regressions**

Run:

```powershell
pnpm.cmd vitest run src/app/api/resume/[id]/export/route.test.ts src/app/api/resume/[id]/export/docx.test.ts src/app/api/resume/[id]/export/builders.test.ts src/app/api/resume/[id]/export/utils.test.ts src/lib/pdf/generate-pdf.test.ts
```

Expected: PASS for PDF, DOCX, HTML, TXT, and JSON paths; one-page PDF remains the existing PDF route with `fitOnePage=true`.

- [ ] **Step 3: Run repository-wide static and test checks**

Run:

```powershell
pnpm.cmd test
pnpm.cmd type-check
pnpm.cmd lint
pnpm.cmd build
```

Record each real exit code. Do not report timed-out, skipped, or environment-blocked commands as passing.

- [ ] **Step 4: Start the application and verify desktop/mobile**

Run: `pnpm.cmd dev`

Use the first free local port. In the browser, verify desktop and mobile viewports, direct editing, template/theme updates, module and entry operations, all formats, save failure, export retry, dirty navigation, and absence of overlap/clipping. Confirm the A4 canvas is nonblank and that normal editor layout is unchanged.

- [ ] **Step 5: Run `git diff --check` and inspect final scope**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; unrelated `.idea/` and `.pnpm-store/` remain untouched.

Any defect found here returns to the owning task: first add a focused failing test, verify the expected failure, implement the smallest fix, and rerun that task's focused suite before repeating this full verification task.
