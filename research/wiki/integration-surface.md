# integration surface

> status: draft
> owner: elaa
> sources: `./bug-context.md`, `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/workflows/fill_poster/tools.py`, `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/services/pdf/pdf_editor.py`, `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/models/pdf_template.py`, `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/services/visual_content/template_analyzer.py`

the point of this note: narrow the design space for phase 2 by pinning down exactly *where* a new approach plugs into `npc-pr-agent`, and what contract it has to satisfy. the landscape scan in phase 2 then evaluates frameworks against that contract, not against abstract criteria.

## existing anatomy (what we're slotting into)

```
user upload (websocket)
  ↓
src/workflows/fill_poster/tools.py :: fill_pdf_template(replacements: dict[str, str])
  ↓ reads context.pdf_template_id → pdf_template_store.get_template(...)
  ↓
src/models/pdf_template.py :: PDFTemplate
    .fields: list[PDFFieldDefinition]      ← the contract surface
    .pdf_blob_url: str
    .source: "admin_upload" | "user_generated" | "upgrade"
  ↓
src/services/pdf/pdf_editor.py :: PDFEditor.apply_field_update(field_def, new_value)
  ↓ pymupdf search-and-replace using field_def.search_pattern
  ↓
azure blob upload → download_url → frontend
```

key observation from reading the schema: **`PDFFieldDefinition` already has a `bbox` field** (`pdf_template.py:37-40`, `[x0, y0, x1, y1]` in pdf points). it is populated by today's admin-curation flow but is not the primary anchor in `PDFEditor` -- `search_pattern` is. this means the contract is already rich enough for approaches that produce bboxes directly (overlay, layout-ai); we do not need a new schema, only to make `bbox` authoritative when present.

## the unit of work a new approach must produce

whatever approach we choose, its output must be convertible into a `list[PDFFieldDefinition]` for the pdf (plus metadata to create a `PDFTemplate` record with `source="user_generated"`). specifically each field needs:

| field | required | how we get it |
|---|---|---|
| `field_key` | yes | snake_case identifier. can be synthesised (e.g. from label) or from an llm labeler. |
| `label` | yes | human-readable. either detected ("Total Population") or auto-labeled. |
| `current_value` | yes | the value present in the pdf now. |
| `search_pattern` | yes today | the literal text to match. **we can make this optional in a schema migration if bbox-based replace is authoritative.** |
| `page` | yes | page index. trivial. |
| `bbox` | optional today | `[x0, y0, x1, y1]` pdf points. overlay approaches populate this; others can leave empty. |
| `color`, `fontsize_factor`, `format_hint`, `bg_color` | optional | all have defaults; auto-detection is a bonus. |
| `enabled` | default true | leave alone. |

this is the integration contract. every phase-2 landscape note must answer: "can approach x produce a `PDFFieldDefinition` list with sufficient quality for the downstream editor?"

## three candidate insertion points

a new approach can plug in at one of three natural seams. these are not mutually exclusive; picking one is a design call that phase 4 will make.

### seam 1 — replace `PDFEditor` (deepest change)

-   replace `src/services/pdf/pdf_editor.py` with a new editor that anchors on `bbox` instead of `search_pattern`.
-   the rest of the flow (`fill_pdf_template` tool, cosmos template store, websocket contract) is unchanged.
-   **fits approach c (overlay).** a bbox-first editor naturally implements overlay -- redact the bbox, draw the new text.
-   **not needed for approaches a/b.** extract and html-roundtrip produce a full new pdf and don't need to swap the editor.

### seam 2 — add a pre-processor that auto-generates `PDFFieldDefinition`s (most reusable)

-   new module, e.g. `src/services/pdf/pdf_autotemplate.py`, that accepts raw pdf bytes and returns `(PDFTemplate, list[PDFFieldDefinition])`.
-   call sites:
    -   `fill_pdf_template` tool, when `context.pdf_template_id` is absent but a just-uploaded pdf is in context.
    -   admin upload path in `src/routes/templates.py` (approximate -- verify), replacing manual curation.
-   **fits approaches a, b, c, d equally.** this is the natural home for whichever approach wins phase 3. the rest of the system is unchanged.
-   **this is the preferred seam.** it gives us the most flexibility and the smallest blast radius.

### seam 3 — branch at `fill_pdf_template` entry (shallowest)

-   add a pre-step inside `fill_pdf_template` (`tools.py:40`) that checks for "uploaded-but-uncurated" state and synthesises a minimal `PDFTemplate` + `PDFFieldDefinition`s on the fly, caching in cosmos.
-   requires minimal edits: a new helper call + a new `PDFTemplate.source` value ("user_generated" already exists, use it).
-   **fits any approach**, but less clean than seam 2. keep as fallback if phase 2 reveals a reason seam 2 is impractical.

## contract specifics phase 2 must evaluate per approach

### approach a -- extract -> PDFFieldDefinition

-   produces `search_pattern` naturally (it's the extracted text). produces `bbox` naturally. `current_value` = `search_pattern`.
-   weakness: may produce over-granular fields (one `PDFFieldDefinition` per glyph run). phase 2 note must discuss segmentation: how do we know "255,000" is one field and not four?
-   integration cost: low.

### approach b -- pdf->html->html template path->pdf

-   does not produce `PDFFieldDefinition`s directly. it produces jinja placeholders in html via `template_analyzer.auto_templatize`.
-   to satisfy the contract, we'd need a *reverse* mapper: from the html template + original pdf, produce `PDFFieldDefinition`s pointing at the pdf's original text regions. or: **skip `PDFFieldDefinition` entirely** and route uploaded pdfs into the html-template path, bypassing the pdf editor.
-   this approach bifurcates the codebase into "pre-curated pdf templates (old path)" and "uploaded pdfs (new html-based path)." that bifurcation is a design cost phase 4 must weigh.
-   integration cost: medium-high. but reuses the html pipeline's proven auto-templatization.

### approach c -- overlay

-   produces `bbox` authoritatively. `search_pattern` can be synthesised from extracted text inside the bbox, or left empty if seam 1 is taken.
-   requires a seam-1 change to `PDFEditor` so `bbox` can be authoritative. moderate.
-   integration cost: medium. high reward (fidelity on non-edited regions is automatic).

### approach d -- layout-ai as primitive

-   used inside a or c to improve field detection. not a standalone approach.
-   produces `bbox` + `label` directly from a vision llm. confidence scores useful for the "which to trust" problem.
-   integration cost: inherited from a or c.

## what the chosen approach must *not* break

-   existing pre-curated `PDFTemplate` records in cosmos. their `search_pattern`-driven fills must continue to work. any schema migration must be additive.
-   the `PDFFieldDefinition.format_hint` mechanism. if auto-detection can't infer a format, use "auto".
-   the `fill_pdf_template` websocket action-event contract (progress events named "Send Input", "Draft"/etc). event names come from `get_draft_action_name(context)`; keep it intact.
-   the download_url contract returned as `fill_pdf_template`'s json response. frontend reads specific keys (`download_url`, `changes`, `not_found_fields`).

## open questions to resolve before phase 3

o1.  confirm where the admin upload path actually lives (`src/routes/templates.py` is the first guess; grep before writing phase-3 code).
o2.  confirm whether any existing production templates have empty `bbox` -- if so, we can't assume bbox is always populated for pre-curated records, so seam-1 must fall back to `search_pattern`.
o3.  confirm the cosmos partition-key policy on `pdf_templates`; user-generated templates per session may explode the container if we don't thiink about lifecycle. see `PDFTemplate` docstring: partition key is `/category`.

## recommended seam

**seam 2** (new auto-template pre-processor module) is the preferred integration point for the chosen approach. it accommodates all four approaches, has the smallest blast radius on existing code, and matches the existing pattern (the html path is already split the same way: `template_analyzer.auto_templatize()` is a separate module from the fillers).

if the chosen approach is overlay (c), add **seam 1** as a companion change so `bbox` becomes an authoritative replacement anchor. this is additive to the schema (bbox already exists), not breaking.

this recommendation is non-binding on phase 4. phase 4 gets to override with hindsight.
