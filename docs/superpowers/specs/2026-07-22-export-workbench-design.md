# A4 Direct-Edit Export Workbench Design

## Goal

Add an independent export workbench where the rendered A4 resume is itself the editor. Workbench changes stay in an isolated temporary draft until the user explicitly chooses Save and Export. The existing editor layout and all unrelated editor capabilities remain unchanged.

## Confirmed Existing Call Chain

### Editor loading and formal state

`src/app/[locale]/editor/[id]/page.tsx` calls `useEditor(id)`. The hook loads `GET /api/resume/[id]`, normalizes dates and sections, and passes the result to `useResumeStore.setResume()`.

The formal editor reads and writes `useResumeStore.currentResume` and `useResumeStore.sections`. Section mutation methods mark the formal state dirty and call `_scheduleSave()`. The autosave timer eventually invokes `save()`, which sends `PUT /api/resume/[id]` with `expectedRevision`, title, template, theme, binding, and normalized section order.

### Modules, entries, templates, and theme

`EditorSidebar` creates, renames, selects, and reorders modules. `EditorCanvas` and `SectionWrapper` select the section-specific editor components. Those components already implement field updates and entry creation/removal. Section-level drag and drop is active. Item-level sortable primitives exist, but the section editors do not consistently expose entry reordering yet.

`ThemeEditor` currently reads and writes the formal resume store directly. Public template selection resolves the selected version before updating the binding. Theme controls update colors, font, font size, line spacing, section spacing, page margins, and avatar style, then schedule formal autosave.

### Preview and export

`EditorPreviewPanel` combines the formal resume and formal sections and passes the result to `ResumePreview`. Legacy templates render `Resume` directly. Declarative templates normalize the resume into a template document before `DeclarativeTemplateDocument` renders it.

The editor toolbar currently opens `ExportDialog`. It requests `GET /api/resume/[id]/export` using one of these query contracts:

- PDF: `format=pdf`
- Smart one-page PDF: `format=pdf&fitOnePage=true`
- DOCX: `format=docx`
- HTML: `format=html`
- TXT: `format=txt`
- JSON: `format=json`

The export route reloads the saved resume from the repository before generating output. This is the version boundary used by the new transaction. The current dialog awaits `save()` but does not stop when it resolves to `false`; the workbench transaction must not inherit that behavior.

## Scope

The workbench supports direct A4 editing for all existing resume fields, module and entry creation/removal, module and entry ordering, module title and visibility, templates, themes, font settings, colors, spacing, margins, avatar settings, and all six existing export formats.

AI assistance, translation, import, sharing, JD analysis, grammar checks, cover letters, and other editor-only capabilities are not present in the workbench.

## Route and Layout

Add a localized route at `/{locale}/editor/{id}/export`. The existing desktop and mobile editor layouts remain intact. Their export actions navigate to the workbench instead of opening the existing quick-export dialog. The old dialog implementation remains available as reusable export code until its responsibilities are extracted; it is not rendered from the editor page after the navigation change.

The workbench centers an A4 document as its dominant surface. On desktop, a compact module outline and document tools sit around the page. On mobile, the A4 page remains the primary surface, with compact top and bottom controls. Editing occurs inside the document, not in a separate form column.

Template/theme controls, format selection, zoom, unsaved status, Back, and Save and Export remain outside printable document content. Hover and focus tools for structure changes are overlays and never appear in ordinary preview or generated exports.

## Editable Preview Contract

`ResumePreview` gains an optional edit contract. When absent, it produces the same ordinary preview used by the existing editor and other consumers. When present, editable nodes carry stable source metadata and dispatch draft mutations.

The edit contract identifies data through:

- `sectionId`
- optional `itemId`
- a typed `fieldPath`
- field kind such as single-line, multiline, rich text, list value, date, or URL

Legacy template output must use shared editable primitives for values while preserving its current styling and DOM layout when edit mode is disabled. Declarative template-document nodes must retain source metadata while transforming resume content so the editable renderer never attempts to infer fields from rendered text.

Clicking a value changes that rendered position into its appropriate input. Blur, Enter, or an explicit completion action commits into the local draft; Escape restores the value present when editing began. Rich text continues to use the project's existing Markdown-based representation so bold formatting is not lost.

Empty optional fields need discoverable insertion points in edit mode because an absent value has no rendered text to click. These placeholders are workbench-only and are excluded from normal preview and export.

## Draft Isolation

The workbench never mounts its draft into `useResumeStore` and never calls formal mutation methods or `_scheduleSave()`.

Loading creates two independent normalized copies:

1. `baseline`, representing the last server-confirmed workbench version.
2. `draft`, created separately with `structuredClone` so sections, entries, arrays, template snapshots, theme margins, and other nested objects share no references with the baseline or formal editor store.

A focused draft controller owns title, sections, template binding, resolved preview template, theme, structure operations, and dirty comparison. Existing pure normalization, template selection, rendering, ID generation, and export-contract helpers are reused. Components that currently write the formal store receive optional controlled adapters; their existing default behavior remains unchanged for the formal editor.

Dirty state is derived from a canonical serializable snapshot rather than object identity. Dates and non-persisted preview-only fields are normalized before comparison.

## Save and Export Transaction

The primary action follows this strict order:

1. Validate the draft and required structural fields.
2. Atomically acquire an in-flight guard; further clicks are ignored and controls become disabled.
3. Send the complete draft to `PUT /api/resume/[id]` with the baseline revision.
4. Stop immediately on an unsuccessful response or invalid response body.
5. Use the returned saved resume as the new baseline and current draft, including the returned revision and resolved template.
6. Request the selected format from the existing export endpoint.
7. Derive the download name from the response `Content-Disposition` when available, with the existing title/timestamp convention as fallback.
8. Download the response and show success.

No export request begins before the save response is confirmed.

If saving fails, the draft remains unchanged and export is not called. If saving succeeds but exporting fails, state becomes `saved_export_failed`. The UI says the resume was saved but export failed and provides Retry Export. That retry uses the already-saved baseline and performs no additional PUT unless the user edits again.

Abort controllers and mounted guards prevent state updates after navigation. Object URLs are always revoked. The in-flight guard is released in `finally` without allowing a second download from the same action.

## Leaving Protection

Back and Close use the same dirty predicate. A dirty draft opens a localized confirmation dialog; cancellation keeps the draft intact. Browser history navigation is guarded within the workbench. Refresh and tab close register `beforeunload` only while dirty.

After a successful save, the server response replaces both baseline and draft, so the page is clean even if export subsequently fails. If the user edits after a saved export failure, the next primary action saves the new revision before exporting.

## Validation and Errors

Validation rejects malformed section collections and missing identifiers required by the persistence contract. User-facing validation, save conflict, save failure, saved-but-export-failed, retry, dirty, and leave-confirmation messages are added to both `messages/zh.json` and `messages/en.json` under one workbench namespace.

A revision conflict is treated as a save failure. It does not overwrite the draft or silently reload remote content. The user can return to the editor or refresh after reviewing the conflict message.

## Accessibility

Every editable field has an accessible label derived from the module and field translations. Icon-only controls use Lucide icons with `aria-label` and tooltips. In-flight and result states use appropriate status semantics. Drag operations retain keyboard sensors, and move-up/move-down commands are available when precise drag interaction is impractical on mobile.

## Test Strategy

Tests are written before production changes and cover:

1. Draft creation does not mutate the formal resume.
2. Nested section, entry, list, margin, and template data share no references.
3. Editable preview changes for content, template, and theme draft mutations.
4. Save resolves successfully before export is invoked.
5. Save failure prevents export and preserves the draft.
6. Export failure after save exposes retry without a duplicate save.
7. Repeated clicks produce one PUT and one download.
8. Dirty navigation invokes confirmation and cancellation preserves the draft.
9. Successful save resets the dirty baseline.
10. Existing PDF, one-page PDF, DOCX, HTML, TXT, and JSON query contracts remain unchanged.
11. Ordinary preview mode renders without editing controls or source metadata behavior changes.
12. Representative legacy and declarative templates map editable fields to the correct structured draft paths.

Focused Vitest suites run first, followed by the complete test suite, TypeScript checking, linting, and a production build when the environment permits. Desktop and mobile behavior is verified against the running Next.js application in a browser.

## Non-Goals and Constraints

The work does not redesign the existing editor, duplicate document generation, add a second export API, or mutate formal data and later attempt rollback. It does not introduce unrelated refactors. Renderer changes are limited to a backward-compatible edit contract and source metadata needed for direct A4 editing.

The broadest risk is template coverage because legacy templates currently render raw fields independently. Coverage tests must ensure edit markers are present and ordinary rendering remains unchanged across the template registry. Declarative combined display runs may need a structured edit affordance for each contributing source field rather than treating a combined sentence as one scalar value.
