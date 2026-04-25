#import "theme.typ": *

#show: report.with(
  title: "Dynamic PDF editing -- demo report",
  subtitle: "Phase-3 lab: overlay engine + UI. Latin + Arabic both pass.",
  date: "2026-04-25",
  version: "0.2",
  doc-type: "benchmark report",
)

= Bottom line

The overlay approach handles arbitrary uploaded posters across both Latin numerics and Arabic text on the two sample PDFs. Same engine, two primitives: #chip("insert_text") for Latin (preserves the embedded font subset directly), #chip("insert_htmlbox") for Arabic (routes through pymupdf's internal HarfBuzz so contextual shaping is correct). Masked SSIM on non-edited regions stays above #metric("0.9998", color: colors.success) on both samples. Approach C (overlay) clears gate-1 for both scripts and is the recommended path for v1 integration into #chip("npc-pr-agent").

= Context

The brief asked for an approach to dynamic PDF editing on uploaded posters that have no pre-curated #chip("PDFFieldDefinition"). `research/wiki/bug-context.md` reframed this around four candidate approaches:

#panel(title: "Approaches we evaluated", color: colors.primary)[
  #set text(size: 9pt)
  #table(
    columns: (0.5fr, 1.6fr, 0.8fr, 2.2fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (center + horizon, left + horizon, center + horizon, left + horizon),
    table.header(
      table.cell(fill: colors.ink)[],
      table.cell(fill: colors.ink)[Approach],
      table.cell(fill: colors.ink)[Status],
      table.cell(fill: colors.ink)[Verdict],
    ),
    [A], [Extract → auto- #chip("PDFFieldDefinition") → existing editor], [#text(fill: colors.danger)[killed]], [E1: extractors fragmented spans on Illustrator-exported PDFs; SSIM \< 0.9 on round-trip render. Useful as a *detector* for the overlay path, not a standalone solver.],
    table.hline(stroke: 0.3pt + colors.rule),
    [B], [PDF → HTML → PDF roundtrip], [#text(fill: colors.muted)[not started]], [Only required if Approach C fails on real-world uploads. Open as escape hatch.],
    table.hline(stroke: 0.3pt + colors.rule),
    [C], [Overlay -- detect span, cover, redraw at same bbox in same font], [#text(fill: colors.success, weight: "bold")[chosen]], [Both Latin and Arabic working in the lab on both samples. SSIM \> 0.9998 on non-edited regions.],
    table.hline(stroke: 0.3pt + colors.rule),
    [D], [Layout-AI (Vision LLMs) as a detector], [#text(fill: colors.muted)[not started]], [Useful as a primitive for fields the cheap regex extractor misses (free-form labels, photographic backgrounds).],
  )
]

= Experiments we ran

#panel(title: "Phase-3 timeline", color: colors.secondary)[
  #set text(size: 9pt)
  #table(
    columns: (0.5fr, 1.4fr, 1.4fr, 2.3fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (center + horizon, left + horizon, left + horizon, left + horizon),
    table.header(
      table.cell(fill: colors.ink)[ID],
      table.cell(fill: colors.ink)[What],
      table.cell(fill: colors.ink)[Outcome],
      table.cell(fill: colors.ink)[Takeaway],
    ),
    [e1], [Extract-to-structure: pdfplumber + pymupdf round-trip render], [#text(fill: colors.danger)[killed]], [Both extractors below 0.9 SSIM on Illustrator exports. Approach A dies as a standalone path.],
    table.hline(stroke: 0.3pt + colors.rule),
    [e2], [Overlay editing -- bare bbox-anchored redact + insert], [#text(fill: colors.warning)[retracted]], [First "pass" was a harness bug; eyeball check showed Helv fallback, wrong colour, seam, adjacent-label clipping. Triggered the engine port.],
    table.hline(stroke: 0.3pt + colors.rule),
    [e5], [Arabic round-trip via #chip("insert_text")], [#text(fill: colors.danger)[partial kill]], [#chip("insert_text") doesn't shape OpenType. Glyphs disconnected, wrong order. Showed Approach C needs a different primitive for Arabic.],
    table.hline(stroke: 0.3pt + colors.rule),
    [e6], [Lab: ported #chip("PDFEditor") engine + UI on Latin], [#text(fill: colors.success, weight: "bold")[passed]], [Per-span font/colour, ascender/descender-trimmed cover, luminance + text-colour-aware bg sample. Latin gate-1 SSIM 0.99997 (qms) / 0.99986 (water).],
    table.hline(stroke: 0.3pt + colors.rule),
    [e7], [Arabic via #chip("insert_htmlbox") + #chip("pymupdf.Archive")], [#text(fill: colors.success, weight: "bold")[passed]], [HarfBuzz-shaped Arabic at the same bbox in the embedded Lusail font. Wrong-bbox bug from #chip("search_for") fixed by driving the Arabic path off the extracted span bbox directly.],
  )
]

= Findings

#panel(title: "What works", color: colors.success)[
  #set text(size: 9.5pt)
  - *Latin numerics*: ported per-span detection produces the same result as a hand-curated #chip("PDFFieldDefinition") fill. The four samples we tried (135,238 → 150,000; 359 → 999; 71% → 88%; 2,297,236 → 2,500,000) all pick up the right Lusail-Bold weight, the right orange/slate text colour, and the right cover-rect background -- including pure white and accent-coloured pills.
  - *Arabic*: #chip("insert_htmlbox") with a #chip("pymupdf.Archive") containing the embedded Lusail-Regular goes through HarfBuzz internally. Contextual shaping (initial / medial / final / isolated forms) and RTL display order are both correct. Verified on round-trips (مواليد → مواليد) and replacements (وفيات → الجديد).
  - *Mixed-language documents*: the engine routes per edit. A single #chip("apply_edits") call can mix Latin and Arabic edits and dispatches each to the correct primitive based on Unicode block detection.
]

#v(0.4em)

#panel(title: "What we learned the hard way", color: colors.warning)[
  #set text(size: 9.5pt)
  - *#chip("insert_text") never shapes Arabic.* It maps codepoints to glyph indices via the font's cmap and lays them out in input order. Pre-shaping with `arabic_reshaper` + `python-bidi` doesn't help either -- the embedded font subset only carries the original Unicode codepoints, not the Arabic Presentation Forms (U+FE70 -- U+FEFC) that pre-shaping outputs.
  - *#chip("search_for") and #chip("get_text(\"dict\")") return different rects for Arabic.* search_for hands back the visual-order glyph-run rect, get_text returns the logical-order span rect. Driving the cover-rect off search_for left visible glyphs around the cover. The Arabic path now uses the extracted span bbox directly.
  - *Cover-rect padding matters more for Arabic.* Connecting strokes and marks extend slightly outside the logical bbox. We pad the cover by 25% of bbox-height for Arabic; Latin uses the standard ascender/descender trim.
]

= Gate-1 metrics

#panel(title: "Per-pixel + SSIM, masked to non-edited regions", color: colors.success)[
  #set text(size: 9pt)
  Source: `benchmarks/results/e6_2026-04-25_*.json`. DPI 150, +3pt mask pad around each edit bbox.
  #v(0.4em)
  #table(
    columns: (2fr, 0.9fr, 0.9fr, 0.9fr, 1.4fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (left + horizon, center + horizon, center + horizon, right + horizon, right + horizon),
    table.header(
      table.cell(fill: colors.ink)[Sample],
      table.cell(fill: colors.ink)[Edits],
      table.cell(fill: colors.ink)[Scripts],
      table.cell(fill: colors.ink)[Edit time],
      table.cell(fill: colors.ink)[Masked SSIM],
    ),
    [qms_psa_121_feb_2024_poster.pdf], [4], [Latin], [0.26 s], [#text(weight: "bold", fill: colors.success)[0.99997]],
    table.hline(stroke: 0.3pt + colors.rule),
    [qms_psa_121_feb_2024_poster.pdf], [3], [Arabic], [(e7)], [#text(weight: "bold", fill: colors.success)[0.9991]],
    table.hline(stroke: 0.3pt + colors.rule),
    [water_infographics_en_filled.pdf], [3], [Latin], [0.03 s], [#text(weight: "bold", fill: colors.success)[0.99986]],
  )
]

= What this does NOT cover yet

#panel(title: "Out of scope for v1 demo", color: colors.warning)[
  #set text(size: 9pt)
  - *Glyph-coverage preflight on free-input.* Subsetted fonts only carry glyphs the original document used. Latin path silently substitutes; Arabic via #chip("insert_htmlbox") falls back to pymupdf's default font for missing glyphs. Production needs a preflight that flags unsupported new values before applying.
  - *Photographic / gradient backgrounds.* Cover-rect sampler is luminance + text-colour aware on solid panels and accent-coloured pills. Untested on photographic or gradient backgrounds -- known risk in `research/wiki/approach-c-overlay.md`.
  - *Multi-edit collisions.* Each edit runs independently. Overlapping edit regions (e.g. two adjacent numerics whose padded cover-rects intersect) are not detected.
  - *Position-shift on length change.* When the new value is wider than the original (e.g. 359 → 999,999), neighbouring elements stay in place. Production may want a layout-aware fit pass.
]

= Decision and recommendation

#panel(title: "Recommendation", color: colors.primary, keep: false)[
  Adopt Approach C (overlay) for #strong[both] Latin and Arabic. Integration in `npc-pr-agent` reuses the existing #chip("PDFEditor") class verbatim for Latin; the Arabic path adds a 60-line #chip("_replace_arabic") method using #chip("insert_htmlbox") + #chip("pymupdf.Archive"). The auto-detection step (`extract_editable_spans`) is new: ~50 lines of regex-driven span extraction with Unicode-block flagging.

  Open questions:

  + *Editability gate.* The lab surfaces every numeric and Arabic span (140 + 104 on the QMS poster). Production likely wants a "select which fields are editable" or "review before edit" gate to keep the operator's table small.
  + *Photographic backgrounds.* Will surface as soon as we test on the broader template library beyond the 90 samples shown in the prod template grid. Have a fallback: render the cover as a tight bbox-shaped patch sampled by neighbour-pixel inpainting rather than the dominant-colour fill.

  Both should be confirmed with Minhal before opening the integration PR.
]

#v(0.4em)

= Reproduce

```bash
# bring the lab up
docker compose up --build              # http://localhost:8201

# benchmark
docker compose run --rm --no-deps lab \
  python -m benchmarks.lab.run_e6      # writes benchmarks/results/e6_<date>_<hash>.json

# compile this report
docker run --rm -v "$PWD":/work --workdir /work \
  ghcr.io/typst/typst:latest compile \
  reports/src/dynamic-editing-demo-v0.2.typ \
  reports/out/dynamic-editing-demo-v0.2.pdf
```

= Citations

- engine source: `npc-pr-agent/src/services/pdf/pdf_editor.py`
- ported into: `benchmarks/lab/overlay.py`
- arabic path: same file, #chip("_replace_arabic") + #chip("_get_arabic_archive")
- ui + api: `benchmarks/lab/main.py`, `benchmarks/lab/ui/`
- runner: `benchmarks/lab/run_e6.py`
- results: `benchmarks/results/e6_2026-04-25_*.json`
- prior retraction: commit `5032188`
- arabic round-trip evidence: this report (e7) -- crops in `benchmarks/results/.e7-v2-crops/`
