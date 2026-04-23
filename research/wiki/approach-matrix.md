# approach matrix — phase 2 rollup

> status: draft (approach d pending deep-research report; this matrix is decidable without it)
> owner: elaa
> sources: `./bug-context.md`, `./integration-surface.md`, `./approach-a-extract-tools.md`, `./approach-b-pdf-to-html.md`, `./approach-c-overlay.md`, `./approach-d-layout-ai.md`
> purpose: pick the framework per approach that proceeds to phase 3; declare which experiments (e1-e4) run and in what order; identify kill-criterion triggers.

## the 4 approaches, post phase 2

the bug-context reframing (`./bug-context.md`) produced 4 candidates. phase 2's landscape scan narrowed each to a single primary framework for phase 3.

| # | approach | primary framework | secondary | seam in npc-pr-agent | phase-3 experiment |
|---|---|---|---|---|---|
| a | extract → auto-PDFFieldDefinition | **pymupdf** (already a dep) | pdfplumber (cross-validation) | seam 2 -- new `pdf_autotemplate` module | **e1** |
| b | pdf → html → html-template-path → pdf | **pdf2htmlex** (license-gated) | adobe pdf extract html mode (data-residency gated) | seam 2 -- new module routes uploads into existing html pipeline | **e3** (gate 2) |
| c | overlay: original as bg + edit layer | **pymupdf redact + insert_text** (machinery already exists in `pdf_editor.py`) | none | seam 1 (promote bbox to authoritative in PDFEditor) + seam 2 (auto-generate bboxed PDFFieldDefinitions) | **e2** |
| d | layout-ai detection primitive | **tbd** (deep-research pending); interim default: azure document intelligence for perimeter + gpt-4o/gemini vision for quality | depends on report | inside a or c, not standalone | feeds e2 or a phase-3.5 sub-experiment |

## why these choices

### approach a -- pymupdf as primary

single biggest factor: **the integration contract is `PDFFieldDefinition`**, and pymupdf's `get_text("dict")` span structure maps to it 1:1. zero install footprint, zero license risk, coordinate system already consistent with the incumbent pdf editor.

pdfplumber secondary is a cross-validation move, not a redundancy. if pymupdf and pdfplumber disagree on a bbox, that is a bug in one of them and we want to find it before shipping.

everything else (docling, unstructured, adobe, pdfminer) was rejected either for abstraction-level mismatch, license/residency gate, or being subsumed by the primary.

### approach b -- pdf2htmlex as primary *and* approach b as a gate-2 experiment

pdf2htmlex is the only open-source pdf-to-html converter with a credible shot at ssim >= 0.95. it is also agpl and unmaintained -- two production-gate problems that are separate from fidelity measurement. phase 3 e3 measures fidelity *first*; the legal/maintenance conversation only matters if fidelity clears the bar.

adobe pdf extract html mode is the commercial alternative if (a) pdf2htmlex's license blocks production use, **or** (b) the output html is too glyph-soup for `template_analyzer.auto_templatize` to digest. either failure pushes us to adobe.

**approach b is not scheduled for gate 1** per `./research-strategy.md`. the expensive-approach gating logic holds: if e1 (extract) or e2 (overlay) already solves the problem at required fidelity, we do not run e3 or e4. e3 exists for the scenario where gate 1 fails.

### approach c -- pymupdf as primary

the incumbent `npc-pr-agent/src/services/pdf/pdf_editor.py` is conceptually already an overlay editor. its `_extract_fonts` + `_register_font_on_page` + `apply_redactions` + `insert_text` pipeline is proven. what's broken is field discovery (`search_pattern` -> bbox), not the overlay mechanics.

**e2 is therefore the cheapest, highest-confidence experiment we can run.** it tests the existing code with bboxes as the authoritative anchor instead of search_pattern. if e2 fails, approach c is dead regardless of library; if it succeeds, we ship seam 1 + seam 2 against minimal new code.

no secondary for c. pikepdf/reportlab/html-composite would be library swaps for a problem that isn't at the library layer.

### approach d -- placeholder, not a blocker

approach d is a primitive, not a standalone editor. phase 3 e1 and e2 can proceed without it because they test pipelines (geometric extract, pymupdf overlay) that do not depend on ai-assisted labelling.

the deep-research report will resolve vendor selection. interim working assumption: **azure document intelligence** is the default for production (inside our perimeter, paid but bounded, no data-exit), with a vision-llm (likely gemini 2.5 pro or gpt-4o) as the secondary for higher quality on chaotic layouts if azure falls short.

## gate 1 vs gate 2 (from research-strategy.md, reaffirmed)

**gate 1 (cheap, open-source, in parallel):**

-   **e1 -- extract-to-structure.** pymupdf (+ pdfplumber cross-check) on both sample pdfs. re-render to pdf from extracted spans. full-page ssim vs original at 150 dpi.
-   **e2 -- overlay editing.** pymupdf redact + insert on both sample pdfs. one pre-chosen field edit per sample. masked ssim on non-edited regions.

if **either** clears its threshold, short-circuit to phase 4 with that approach as the recommendation. **do not run gate 2 if gate 1 produces a winner.**

**gate 2 (expensive, paid api, only if gate 1 leaves no winner):**

-   **e3 -- pdf -> html -> pdf.** pdf2htmlex + adobe pdf extract html mode. playwright re-render. full-page ssim + `auto_templatize` digestibility probe.
-   **e4 -- layout-ai detection.** blocked on deep-research report pick; likely azure document intelligence + gpt-4o/gemini vision. precision/recall against hand-labelled ground truth.

**e5 -- arabic / rtl stress test** runs on the winner only, once we have the arabic sample ([data task in clickup](https://app.clickup.com/t/86exbw6fw)).

## explicit kill criteria (per experiment)

restated from each approach note:

| exp | kill if | next move if killed |
|---|---|---|
| e1 | full-page ssim < 0.90 on both samples after extract+re-render | approach a alone is not viable; demote pymupdf to "detector for c" |
| e2 | masked ssim < 0.99 on non-edited region | approach c is leaking at the compositor layer; abandon |
| e3 | best converter < 0.90 full-page ssim, **or** `auto_templatize` fails on output | approach b dies; unless adobe html beats pdf2htmlex |
| e4 | recall < 0.80 on sample pdfs | approach d not viable as solver; survives only as manual-fallback primitive |

## the orthogonal risk (not captured in kill criteria)

fidelity is not the only failure mode. three orthogonal concerns that the numeric thresholds will not catch:

1.  **auto-templatize digestibility (approach b).** pdf2htmlex can pass 0.95 ssim and still be unusable if the resulting html is glyph-soup that the llm cannot convert into meaningful jinja placeholders. e3 must run a human-scored templatize probe alongside the visual diff.
2.  **arabic / rtl (approach c and beyond).** every experiment passes until we test arabic; then any of them can die. e5 is not optional.
3.  **legal / licensing (approach b).** pdf2htmlex agpl is a commercial-gate question, not a technical one. e3 proving fidelity doesn't mean we can ship pdf2htmlex; it means we can *argue* for shipping it.

## recommended phase-3 execution order

```
week 1: e1 + e2 in parallel (gate 1)
        ↓
        gate 1 decision point
        ↓
  winner? → phase 4 drafts recommendation; e5 queues on arabic sample arrival
        ↓
  no winner? → e3 + e4 in parallel (gate 2), auto_templatize probe included in e3
        ↓
        gate 2 decision point
        ↓
  winner? → phase 4; e5 queues
  no winner? → approach matrix revision; commercial escalation (apryse) or manual-mapping ux compromise
```

## open questions that carry into phase 3

-   **gate 1 timing**: do we run e1 and e2 back-to-back or truly in parallel? parallel is faster but a failure in e1 might change how we scope e2 (which field to edit on each sample). recommend: back-to-back, e1 first, because its output (extracted spans) informs e2's field-choice.
-   **arabic sample arrival**: the `[Data]` clickup task ([86exbw6fw](https://app.clickup.com/t/86exbw6fw)) is the real-world blocker. chasing minhal today is the single highest-leverage action toward phase-3 completion.
-   **deep-research report integration**: when it lands, update `approach-d-layout-ai.md` wholesale and revise this matrix's approach-d row. no other rows should need updating unless the report finds a vendor that changes the gate 2 math.

## decision needed from you (el) before phase 3 starts

1.  confirm gate 1 scope: e1 + e2 only, using pymupdf. approach d work deferred until phase 3 sub-experiment.
2.  confirm you want me to start e1 scaffold now, or wait for the arabic sample first so the same harness works for e5.

default if you don't respond: **start e1 scaffold immediately** against the english samples. e5 can run later on the same harness; it doesn't need to be designed in advance.
