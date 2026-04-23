# research strategy

> status: draft
> owner: elaa
> supersedes: any earlier plan in conversation transcripts

## phases

```
phase 0: understand the bug       →  phase 1: derive requirements
                                          ↓
                         phase 2: landscape scan / framework survey
                                          ↓
                    phase 3: minimal prototypes (one per approach)
                                          ↓
                         phase 4: recommendation + integration plan
```

research (phases 0-2) and experiments (phase 3) feed each other. a research finding can kill an experiment before it's built; an experiment result can correct a research claim. phases are sequenced, but within a phase the listed work items run in parallel when they have no dependencies.

---

## phase 0 -- understand the bug (done in intake)

goal: know *why* this R&D exists in operational, code-level terms before proposing anything.

inputs:
- clickup ticket `86ewuq5my`
- initiating brief `research/raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf`
- `npc-pr-agent` source: `src/workflows/fill_poster/`, `src/services/pdf/pdf_editor.py`, `src/services/visual_content/template_analyzer.py`

output: `research/wiki/bug-context.md` -- captures what the incumbent pdf-fill path does, why it fails on arbitrary uploads, and how that re-frames the four approaches in the brief.

exit criterion: bug-context.md cites specific file:line references and has been reviewed.

status: **done**.

---

## phase 1 -- derive requirements

goal: turn the bug + brief into a concrete requirements list that every downstream approach must meet. without this, approach comparisons become aesthetic arguments.

work items (in parallel):

1.  **functional requirements note** (`wiki/requirements-functional.md`)
    -   what the user must be able to do: upload an arbitrary pdf; select which values are editable; change those values; download a modified pdf.
    -   derive from the brief's "users need the ability to upload these PDFs and modify specific values dynamically."

2.  **non-functional requirements note** (`wiki/requirements-nonfunctional.md`)
    -   fidelity threshold (see work item 4).
    -   latency budget (inherit from `npc-pr-agent` existing flows -- check `docs/` for slos).
    -   language support: english + arabic / rtl at minimum.
    -   deployment constraints: azure, must integrate into existing websocket-based session flow.

3.  **integration surface note** (`wiki/integration-surface.md`)
    -   map out exactly where in `npc-pr-agent` a new approach would plug in. candidate insertion points: replace `PDFEditor`; add a pre-processor that auto-generates `PDFFieldDefinition` from uploaded pdf; branch on "uploaded vs. pre-registered" at the `fill_pdf_template` tool entry.
    -   output of this note is the contract the chosen approach must satisfy.

4.  **fidelity metric definition** (`wiki/fidelity-evaluation.md`)
    -   how we measure "layout precision, visual design, formatting fidelity" consistently across experiments.
    -   concrete: per-pixel mae + ssim at 150dpi for full-page comparison; per-region ssim for overlay experiments (only non-edited regions); optional lpips for text-heavy zones.
    -   thresholds: "acceptable" = ssim >= 0.98 full-page, mae <= 2%; "excellent" = ssim >= 0.995. these are claims, not gospel -- revisit after first measurement.

exit criterion: all four notes written, fidelity metric has a tested python snippet in `wiki/fidelity-evaluation.md` that other experiments will import.

---

## phase 2 -- landscape scan / framework survey

goal: for each of the four bug-aware approaches (a/b/c/d from `bug-context.md`), enumerate the frameworks and services that implement it, what they cost, what they're known to fail on.

no code runs in this phase. it's reading, citing, and writing. every claim in the wiki must cite a source file in `research/raw/` or a linked external doc.

work items (in parallel, one per approach):

1.  `wiki/approach-a-extract-tools.md` -- pymupdf, pdfplumber, adobe pdf extract api, docling, unstructured.io, pdfminer.six. table: what each returns, position-fidelity guarantees, price, known weaknesses on illustrator/canva exports.

2.  `wiki/approach-b-pdf-to-html.md` -- pdf2htmlex, mutool convert -F html, pdf.js, adobe pdf extract's html output, commercial (aspose, apryse/pdftron). table: fidelity, font handling, arabic support, licensing (pdf2htmlex is agpl -- flag).

3.  `wiki/approach-c-overlay.md` -- pymupdf redact+insert, pdfplumber bbox + reportlab overlay, pike-pdf. discuss font-matching strategies (pymupdf's embedded font extraction already exists in `pdf_editor.py:_extract_fonts` -- reusable).

4.  `wiki/approach-d-layout-ai.md` -- gpt-4o vision, gemini 2.5 pro vision, azure document intelligence, layoutlm v3, doclaynet, donut. table: input (page image vs. pdf), output (bboxes with labels vs. free text), cost per page, latency, and whether they're a *detector* (primitive) or a *solver* (end-to-end).

exit criterion: an `approach-matrix.md` table rolling up all four with a recommended candidate framework per approach, chosen for phase 3.

---

## phase 3 -- minimal prototypes

goal: one prototype per approach, built against the *same* two pdfs (`datasets/samples/`), measured with the *same* fidelity metric from phase 1.

each prototype is self-contained under `benchmarks/<name>/` with `readme.md`, `requirements.txt`, `run.py`, results json in `benchmarks/results/`.

sequenced cheapest-first so expensive approaches can be killed by cheaper results:

### gate 1 -- cheap, open-source (parallel)

-   **e1: extract-to-structure** -- pymupdf + pdfplumber on both samples; re-render to pdf from extracted boxes; measure full-page ssim vs original.
    -   kill criterion: both extractors under 0.90 ssim -> approach a is not viable alone; downgrade to "candidate detector for a/b/c".
-   **e2: overlay editing** -- identify one value per sample to edit; redact in place; draw new text at the same bbox with best-effort font match; measure ssim on non-edited regions only.
    -   kill criterion: non-edited region ssim < 0.99 -> overlay is leaking and this approach is dead.

**decision at gate 1:** if either experiment hits its target, short-circuit to phase 4 with that approach as the recommendation. do not spend money on gate 2 unless gate 1 leaves us without a viable path.

### gate 2 -- expensive, paid-api (parallel, only if needed)

-   **e3: pdf -> html -> pdf** -- convert both samples to html (pdf2htmlex + one commercial converter); render html to pdf via playwright (which is already in `npc-pr-agent`); measure full-page ssim.
    -   kill criterion: best converter < 0.90 full-page ssim -> approach b dies.
-   **e4: layout-ai detection** -- send rendered page images to gpt-4o vision and gemini 2.5 pro with structured output schema ("list all label -> value pairs with bboxes"); hand-label ground truth; measure precision/recall.
    -   kill criterion: recall < 80% -> auto-detection isn't usable; approach d survives only as a manual-fallback primitive.

### e5 -- arabic / rtl stress test (runs on winner only)

once gate 1 or gate 2 produces a winner, re-run against an arabic poster. arabic is our single biggest integration risk because every pdf tool handles rtl and shaping differently. we need this sample from minhal before the experiment can run.

exit criterion: each experiment's results json is committed, each has a sibling typst report in `reports/src/` (e.g. `reports/src/extract-feasibility-v0.1.typ`).

---

## phase 4 -- recommendation + integration plan

goal: produce the actual deliverable of this R&D.

outputs:

1.  `reports/src/dynamic-pdf-recommendation-v1.0.typ` -- one typst report following the repo convention. sections: tl;dr, context, findings across phase 3, decision, integration plan, risks and open questions.
2.  `wiki/integration-plan.md` -- file-by-file change plan for `npc-pr-agent`: which module(s) to touch, what the contract becomes, migration strategy for existing pre-curated templates.
3.  a clickup task in list `901813626574` for the integration work, linking to the report.

exit criterion: recommendation report is at `final` status and the integration plan is specific enough that implementation work can start without further R&D.

---

## sequencing and effort estimate

| phase | effort | blocking next phase? |
|---|---|---|
| 0 | done | - |
| 1 | ~1 day (4 notes, some short) | yes -- fidelity metric is shared by all experiments |
| 2 | ~2 days (4 landscape notes, parallel) | yes -- locks the tool choices for each experiment |
| 3 gate 1 | ~2 days (e1, e2 in parallel) | *conditional* -- if gate 1 wins, phase 3 ends here |
| 3 gate 2 | ~3 days (e3, e4 in parallel, paid-api friction) | yes if reached |
| 3 e5 | ~1 day | yes |
| 4 | ~1 day writeup | no |

total likely: 6-8 working days if gate 1 produces a winner, 10-12 if we go through gate 2.

## non-goals

-   shipping a production implementation in this repo. integration happens in `npc-pr-agent` via a separate pr, after phase 4.
-   evaluating every pdf library in existence. the brief asks for a recommendation, not a survey paper.
-   inventing a new fidelity metric. ssim + per-pixel mae are standard and enough.
