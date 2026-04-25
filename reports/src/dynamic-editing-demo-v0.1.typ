#import "theme.typ": *

#show: report.with(
  title: "Dynamic PDF editing -- demo report",
  subtitle: "Phase-3 e6 lab: overlay engine + minimal UI. Latin gate-1 evidence.",
  date: "2026-04-25",
  version: "0.1",
  doc-type: "benchmark report",
)

= Bottom line

The same #chip("PDFEditor") engine that handles pre-curated templates in production handles auto-detected numeric spans on the two sample posters with the same fidelity. Masked SSIM on non-edited regions is #metric("0.99997", color: colors.success) on the QMS poster and #metric("0.99986", color: colors.success) on the water infographic, both well above the 0.99 gate. The latin failure modes from the prior #chip("e2-overlay") attempt (Helv fallback, black colour, cover-rect seam, adjacent-label clipping) are gone. Approach C (overlay) clears gate-1 for latin numerics. Arabic is still gated on a shaping fix and is excluded from the demo by design.

= Context

The R&D problem in `research/wiki/bug-context.md` reframed the brief: arbitrary uploaded posters cannot be edited by the production fill_poster path because that path needs a pre-curated #chip("PDFFieldDefinition") list. The four candidate approaches were enumerated in `research/wiki/approach-matrix.md`. Phase 3 gate 1 was supposed to test approach A (extract) and approach C (overlay) on cheap open-source primitives.

E1 (extract) ran first; results in `benchmarks/results/e1_2026-04-23_72e77368.json`. E2 (overlay) was retracted -- commit `5032188` -- because the harness was scoring SSIM on tiny edit regions (false positive) and not eyeballing the actual edits (font fell back, colour wrong, seam visible, adjacent label clipped). The retraction note said the next step was to port the per-span detection from `npc-pr-agent/src/services/pdf/pdf_editor.py` rather than rebuild the engine from scratch.

E6 is that port, plus a lab UI that lets a non-engineer drive the loop end-to-end.

= Findings

#panel(title: "Engine port: what changed vs e2", color: colors.primary)[
  #set text(size: 9pt)
  #table(
    columns: (1.4fr, 2fr, 2fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (left + horizon, left + horizon, left + horizon),
    table.header(
      table.cell(fill: colors.ink)[Concern],
      table.cell(fill: colors.ink)[E2 behaviour],
      table.cell(fill: colors.ink)[E6 behaviour (ported)],
    ),
    [Font],     [Fell back to #chip("helv") whenever the embedded subset alias was non-trivial.], [Extracts embedded buffer once, registers per-page with a #chip("[:10]") alias; uses Lusail-Bold / Lusail-Bd from the sample.],
    table.hline(stroke: 0.3pt + colors.rule),
    [Colour],   [Hardcoded black.], [Reads #chip("span['color']") as packed RGB, applies as `(r,g,b)/255`. QMS orange and water cyan come back exact.],
    table.hline(stroke: 0.3pt + colors.rule),
    [Cover rect], [Search-hit rect verbatim. Caused clipping of the label directly below ("Over Speed (Ra" -> "d (Ra").], [Trims #chip("10%") off the top (ascenders) and #chip("20%") off the bottom (descenders) before drawing the cover.],
    table.hline(stroke: 0.3pt + colors.rule),
    [Background], [Sampled one point adjacent to the bbox.], [Border-strip sample over a 2x scaled pixmap with luminance #chip("< 80") and text-colour-distance #chip("< 60") filters; majority-vote dominant colour.],
    table.hline(stroke: 0.3pt + colors.rule),
    [Disambiguation], [None. #chip("search_for") returns every instance.], [Bbox-hint -> #chip("min(instances, key=center_distance)") so percent values that repeat across pages don't get mis-edited.],
  )
]

#v(0.3em)

#panel(title: "Gate-1 metrics", color: colors.success)[
  #set text(size: 9pt)
  Source: `benchmarks/results/e6_2026-04-25_81f06122.json`. DPI 150, masked SSIM with +3pt pad around each edit bbox.
  #v(0.4em)
  #table(
    columns: (2fr, 0.8fr, 0.8fr, 1fr, 1.4fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (left + horizon, right + horizon, center + horizon, right + horizon, right + horizon),
    table.header(
      table.cell(fill: colors.ink)[Sample],
      table.cell(fill: colors.ink)[Edits],
      table.cell(fill: colors.ink)[All ok],
      table.cell(fill: colors.ink)[Edit time],
      table.cell(fill: colors.ink)[Masked SSIM],
    ),
    [qms_psa_121_feb_2024_poster.pdf], [4], [yes], [0.26 s], [#text(weight: "bold", fill: colors.success)[0.99997]],
    table.hline(stroke: 0.3pt + colors.rule),
    [water_infographics_en_filled.pdf], [3], [yes], [0.03 s], [#text(weight: "bold", fill: colors.success)[0.99986]],
  )
]

#v(0.3em)

#callout(title: "Eyeball check on the qms 135,238 -> 150,000 edit", color: colors.success)[
  Same Lusail-Bold orange. No cover-rect seam. The adjacent label "Over Speed (Ra" is preserved -- the e2 clipping is gone. Crops in `benchmarks/results/e6-smoke-crops/`.
]

= What this does NOT cover

#panel(title: "Out of scope for the demo", color: colors.warning)[
  #set text(size: 9pt)
  - *Arabic / RTL shaping.* `insert_text` writes glyphs in logical order without harfbuzz shaping. Arabic spans are surfaced in the UI but flagged `editable=false`. Real fix is `insert_htmlbox` + harfbuzz, or routing arabic edits through approach B (PDF -> HTML -> PDF).
  - *Glyph coverage on free-input characters.* Subsetted fonts only carry the glyphs the original document used. Replacing a digit with a digit always works; replacing with a glyph not in the subset silently substitutes. Production needs a glyph-coverage preflight.
  - *Patterned / image backgrounds.* Background sampler is luminance + text-colour aware on solid panels and accent-coloured pills (covered by both samples). Photographic / gradient backgrounds are flagged as a known risk in `research/wiki/approach-c-overlay.md` and are not exercised here.
  - *Multi-edit collisions.* Each edit runs independently; we do not currently detect overlapping edit regions.
]

= Decision and recommendation

#panel(title: "Recommendation", color: colors.primary, keep: false)[
  Adopt approach C (overlay) for the latin path. The demo proves auto-detection + overlay produces the same fidelity as the pre-curated production path on the two samples in scope. Integration in `npc-pr-agent` reuses `PDFEditor` verbatim; the new piece is the auto-detection step.

  Two open questions block a committed integration:

  1. *Arabic in v1?* If yes, we need to run E3 (PDF -> HTML -> PDF) before integrating, and the integration becomes a hybrid. If v1 ships latin-first, integration is a single-day port.
  2. *User declares editability or system auto-detects?* The demo auto-detects every numeric / percent span. Production may want a "select which fields are editable" gate before exposing the full table.

  Both questions should be resolved with Minhal before we open an `npc-pr-agent` PR.
]

#v(0.3em)

= Reproduce

```bash
docker compose up --build         # ui at http://localhost:8201
docker compose run --rm --no-deps lab \
  python -m benchmarks.lab.run_e6 # writes benchmarks/results/e6_<date>_<hash>.json
```

= Citations

- engine source: `npc-pr-agent/src/services/pdf/pdf_editor.py`
- ported into: `benchmarks/lab/overlay.py`
- ui + api: `benchmarks/lab/main.py`, `benchmarks/lab/ui/`
- runner: `benchmarks/lab/run_e6.py`
- results: `benchmarks/results/e6_2026-04-25_81f06122.json`
- prior retraction: commit `5032188` -- e2 harness bugs + visual eyeball eval
- arabic gating evidence: `e5` round-trip in commit `ed77b4e`
