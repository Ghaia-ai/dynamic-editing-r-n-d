#import "theme.typ": *

#show: report.with(
  title: "Dynamic PDF editing R&D",
  subtitle: "Business brief. Where we are, what we're testing, what we recommend.",
  date: "2026-04-23",
  version: "0.1",
  doc-type: "business brief",
)

= Bottom line

We opened an R&D line to fix the poster-editing bug in NPC: users can't upload an arbitrary PDF and edit specific values without a designer first curating a template. After intake, bug analysis, and a full framework survey, we have a four-approach matrix with clear kill criteria and a cheapest-first experiment plan. Two candidate approaches can be validated in days on free tooling; two are expensive and gated behind the first two failing.

#v(0.4em)

#panel(title: "Phase status", color: colors.primary)[
  #set text(size: 9.5pt)
  #table(
    columns: (auto, 1fr, auto),
    stroke: none,
    inset: (x: 6pt, y: 7pt),
    align: (left, left, left),
    table.header(
      table.cell(fill: colors.ink)[Phase],
      table.cell(fill: colors.ink)[What it produces],
      table.cell(fill: colors.ink)[Status],
    ),
    [0. Understand the bug],
    [Bug-context memo. The incumbent editor needs a human-curated template per PDF, and its literal-text search breaks on arbitrary uploads.],
    status("ok"),

    table.hline(stroke: 0.3pt + colors.rule),
    [1. Derive requirements],
    [Functional and non-functional requirements. Measurement method (SSIM and per-pixel MAE at 150 dpi). Integration surface inside #chip("npc-pr-agent").],
    status("ok"),

    table.hline(stroke: 0.3pt + colors.rule),
    [2. Framework landscape],
    [Four candidate approaches, primary framework chosen for each. Rollup matrix with kill criteria per experiment.],
    status("ok", label: "D pending deep research"),

    table.hline(stroke: 0.3pt + colors.rule),
    [3. Minimal prototypes],
    [Two cheap experiments (E1, E2) on open-source tooling in parallel. Two expensive ones (E3, E4) gated on the first two failing.],
    status("info", label: "next"),

    table.hline(stroke: 0.3pt + colors.rule),
    [4. Recommendation],
    [One decision memo plus integration plan for the downstream product repo.],
    status("na", label: "queued"),
  )
]

= The problem, restated

Posters and infographics are authored in Illustrator, Canva, and InDesign. When the resulting PDF reaches NPC as an upload, text on the page is a scatter of glyph runs, not a structured document. A designer would otherwise sit down and register every editable value as a named field. That gate is what today's pipeline assumes. The R&D asks whether we can remove that gate entirely.

#v(0.3em)

#panel(title: "Where the gate lives today", color: colors.primary, keep: true)[
  #set text(size: 9pt, fill: colors.ink-soft)
  #grid(
    columns: (1fr, auto, 1fr, auto, 1fr),
    column-gutter: 6pt,
    align: center + horizon,

    // col 1: upload
    stack(dir: ttb, spacing: 6pt,
      user-icon(color: colors.primary),
      text(size: 7.5pt, weight: 600, fill: colors.ink)[User uploads PDF],
      text(size: 7pt, fill: colors.muted)[any layout, any tool],
    ),
    arrow-label("", color: colors.primary),
    // col 2: GATE
    cloud-box("gate: human curation", color: colors.danger)[
      #set text(size: 8pt, fill: colors.ink-soft)
      Designer reads PDF, picks editable values, writes a field list per PDF.
      #v(0.2em)
      #text(weight: 700, fill: colors.danger)[Does not scale.]
    ],
    arrow-label("then, and only then", color: colors.primary),
    // col 3: edit
    stack(dir: ttb, spacing: 6pt,
      stream-icon(color: colors.secondary),
      text(size: 7.5pt, weight: 600, fill: colors.ink)[Users edit values],
      text(size: 7pt, fill: colors.muted)[works fine once curated],
    ),
  )

  #v(0.6em)
  #line(length: 100%, stroke: 0.4pt + colors.rule)
  #v(0.3em)
  #text(size: 8.5pt, fill: colors.muted)[
    The R&D goal is to automate or eliminate the middle box so that upload lands directly at edit.
  ]
]

= The four candidate approaches

We distilled the brief's exploration surface into four approaches, ranked by integration cost and orthogonal risk. Each has a primary framework chosen for a Phase 3 experiment.

#v(0.3em)

#panel(title: "Approach matrix after Phase 2", color: colors.primary)[
  #set text(size: 9pt)
  #table(
    columns: (auto, 2fr, 2fr, auto),
    stroke: none,
    inset: (x: 6pt, y: 7pt),
    align: (left, left, left, center),
    table.header(
      table.cell(fill: colors.ink)[Approach],
      table.cell(fill: colors.ink)[Idea],
      table.cell(fill: colors.ink)[Primary framework],
      table.cell(fill: colors.ink)[Gate],
    ),
    [A. Extract and re-render],
    [Pull text, positions, fonts from the PDF; rebuild a clean template record from them.],
    [#chip("PyMuPDF") with #chip("pdfplumber") cross-check],
    tag("1", color: colors.success, variant: "solid"),

    table.hline(stroke: 0.3pt + colors.rule),
    [B. PDF to HTML to PDF],
    [Convert the PDF to HTML, route through the already-working HTML template pipeline, re-render to PDF.],
    [#chip("pdf2htmlEX") with Adobe Extract as fallback],
    tag("2", color: colors.warning, variant: "solid"),

    table.hline(stroke: 0.3pt + colors.rule),
    [C. Overlay editing],
    [Keep the original PDF as background. Replace only the edited text with a matched font in place.],
    [#chip("PyMuPDF") redact and insert],
    tag("1", color: colors.success, variant: "solid"),

    table.hline(stroke: 0.3pt + colors.rule),
    [D. Layout-AI detection],
    [A vision model finds "which bbox is a value, which is its label." A primitive, not an editor.],
    [TBD. Interim: Azure Document Intelligence],
    tag("shared", color: colors.primary, variant: "outline"),
  )
]

#callout(title: "Gate logic", color: colors.primary, icon: icon-info)[
  Gate 1 runs the two cheap, open-source experiments (A and C) in parallel. If either clears its fidelity threshold, Gate 2 is cancelled. Gate 2 (B and D) is only unlocked if Gate 1 leaves no winner. This frontloads signal and delays spend.
]

#pagebreak(weak: true)

= Why this ordering

The bug is specifically that the current editor uses literal-text search (#chip("search_pattern")) to find where to write the new value. That fails on arbitrary uploads. But the data schema the editor consumes, #chip("PDFFieldDefinition"), already has a bounding-box field. It's present, unused by the primary code path, and populated in theory by today's human-curation step.

#v(0.3em)

#panel(title: "The cheapest win hides in the existing schema", color: colors.success)[
  #set text(size: 9pt, fill: colors.ink-soft)
  The #chip("bbox") field already exists on every #chip("PDFFieldDefinition") record. Making it the authoritative anchor (instead of #chip("search_pattern")) is additive to the schema, backward-compatible with every human-curated template already in the system, and lines up exactly with what approaches A and C need to produce automatically. Approach C (overlay) is therefore a test of whether the existing editor works when we skip the broken #chip("search_pattern") step. Approach A is a test of whether we can populate #chip("bbox") automatically from PDF content.
]

#v(0.4em)

= What's being measured

Every Phase 3 experiment imports the same fidelity metric. No per-experiment custom scoring.

#v(0.3em)

#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 10pt,
  panel(title: "Full-page SSIM", color: colors.primary)[
    #set text(size: 9pt)
    Structural similarity between the original PDF page and the edited output, rasterised at 150 dpi. One number per page.
    #v(0.3em)
    *Pass* #sym.gt.eq 0.98.
    *Excellent* #sym.gt.eq 0.995.
  ],
  panel(title: "Per-pixel MAE", color: colors.primary)[
    #set text(size: 9pt)
    Mean absolute error across RGB channels. Catches subtle colour drift SSIM can miss.
    #v(0.3em)
    *Pass* #sym.lt.eq 5.
    *Excellent* #sym.lt.eq 2.
  ],
  panel(title: "Masked SSIM", color: colors.primary-dark)[
    #set text(size: 9pt)
    For overlay experiments. Measures the non-edited region only. Edited bbox excluded.
    #v(0.3em)
    *Pass* #sym.gt.eq 0.99 (overlay must not leak).
  ],
)

= Kill criteria

Every experiment has a number at which we stop and move on. No open-ended exploration.

#v(0.3em)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  callout(title: "E1 extract. Kill if SSIM < 0.90 both samples", color: colors.danger, icon: icon-cross)[
    Extract-and-rebuild is not viable standalone. PyMuPDF gets demoted to "detector for approaches B and C."
  ],
  callout(title: "E2 overlay. Kill if masked SSIM < 0.99", color: colors.danger, icon: icon-cross)[
    The overlay compositor is leaking. Approach C dies regardless of library choice; the failure is conceptual.
  ],
  callout(title: "E3 PDF-to-HTML. Kill if best converter < 0.90, or HTML is glyph-soup", color: colors.warning, icon: icon-warn)[
    Approach B dies unless Adobe's commercial HTML output passes where pdf2htmlEX fails.
  ],
  callout(title: "E4 layout-AI. Kill if recall < 80%", color: colors.warning, icon: icon-warn)[
    Approach D doesn't work as a solver. Survives only as a manual-fallback primitive inside another approach.
  ],
)

#pagebreak(weak: true)

= What we've done (Phase 0 through 2)

#v(0.3em)

#grid(
  columns: (auto, 1fr),
  column-gutter: 14pt,
  row-gutter: 10pt,
  step-circle("0"),
  [
    *Intake and bug analysis.* Read the initiating brief. Read the incumbent #chip("fill_poster") code in #chip("npc-pr-agent"). Captured the concrete failure mode: literal-text search against arbitrary uploads. One memo: #chip("research/wiki/bug-context.md").
  ],

  step-circle("1"),
  [
    *Requirements.* Four memos: functional, non-functional (inherits latency budgets from the existing #chip("NPC_PLAYWRIGHT_OP_TIMEOUT_MS=10s") precedent), integration surface (names the exact files in #chip("npc-pr-agent") to touch), and the shared fidelity metric.
  ],

  step-circle("2"),
  [
    *Framework survey.* One memo per approach. Primary picks made. Approach D outsourced to a deep-research agent because the vision-LLM / document-AI vendor landscape shifts quarterly and training-cutoff summaries go stale fast.
  ],
)

#v(0.4em)

#panel(title: "Artefacts produced", color: colors.secondary)[
  #set text(size: 9pt, fill: colors.ink-soft)
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 10pt,
    row-gutter: 4pt,
    [#chip("research/wiki/bug-context.md")], [Why the incumbent fails],
    [#chip("research/wiki/problem-framing.md")], [Distilled problem statement],
    [#chip("research/wiki/research-strategy.md")], [Four-phase plan with gates],
    [#chip("research/wiki/fidelity-evaluation.md")], [Metric + reference snippet],
    [#chip("research/wiki/requirements-functional.md")], [User-facing flows],
    [#chip("research/wiki/requirements-nonfunctional.md")], [Latency, cost, language, deployment],
    [#chip("research/wiki/integration-surface.md")], [Insertion seams in #chip("npc-pr-agent")],
    [#chip("research/wiki/approach-a-extract-tools.md")], [Extract landscape],
    [#chip("research/wiki/approach-b-pdf-to-html.md")], [PDF-to-HTML landscape],
    [#chip("research/wiki/approach-c-overlay.md")], [Overlay landscape],
    [#chip("research/wiki/approach-d-layout-ai.md")], [Layout-AI placeholder],
    [#chip("research/wiki/approach-matrix.md")], [Rollup matrix],
  )
]

= Timing and effort

#v(0.3em)

#panel(title: "Effort estimate", color: colors.primary)[
  #set text(size: 9pt)
  #table(
    columns: (auto, auto, 1fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (left, right, left),
    table.header(
      table.cell(fill: colors.ink)[Phase],
      table.cell(fill: colors.ink)[Effort],
      table.cell(fill: colors.ink)[Status],
    ),
    [0, 1, 2 combined], [~3 days], status("ok", label: "done"),
    table.hline(stroke: 0.3pt + colors.rule),
    [3, Gate 1 (E1, E2)], [~2 days], status("info", label: "next"),
    table.hline(stroke: 0.3pt + colors.rule),
    [3, Gate 2 (E3, E4)], [~3 days], tag("conditional", color: colors.muted, variant: "outline"),
    table.hline(stroke: 0.3pt + colors.rule),
    [3, E5 Arabic stress test], [~1 day], tag("blocked on sample", color: colors.warning, variant: "outline"),
    table.hline(stroke: 0.3pt + colors.rule),
    [4, Recommendation], [~1 day], status("na", label: "queued"),
  )

  #v(0.3em)
  #line(length: 100%, stroke: 0.4pt + colors.rule)
  #v(0.3em)
  #text(size: 8.5pt, fill: colors.muted)[
    Likely 6 to 8 working days if Gate 1 produces a winner. 10 to 12 if Gate 2 is required.
  ]
]

#pagebreak(weak: true)

= Risks and open questions

#v(0.3em)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  callout(title: "Arabic sample not yet in hand", color: colors.warning, icon: icon-warn)[
    Every approach passes on English and dies on Arabic in this domain. The E5 stress test is non-negotiable. Arabic poster sample request sent to Minhal's team on the ClickUp board.
  ],
  callout(title: "Fidelity is not the only metric for approach B", color: colors.warning, icon: icon-warn)[
    pdf2htmlEX can pass SSIM and still produce glyph-soup HTML that breaks the downstream auto-templatiser. E3 must test both dimensions or its pass signal is misleading.
  ],
  callout(title: "pdf2htmlEX is AGPL-licensed", color: colors.danger, icon: icon-cross)[
    Even if it passes fidelity, a commercial deployment needs legal sign-off or a licensing alternative. Adobe Extract is the commercial fallback but adds per-page cost and data-residency review.
  ],
  callout(title: "Approach D vendor choice outstanding", color: colors.primary, icon: icon-info)[
    A deep-research prompt is out with the vision-LLM and document-AI landscape. Interim default is Azure Document Intelligence, which stays inside our perimeter but may not match a vision LLM on poster-layout accuracy.
  ],
)

= Recommended next step

#v(0.3em)

#grid(
  columns: (auto, 1fr),
  column-gutter: 14pt,
  row-gutter: 10pt,
  step-circle("1"),
  [*Start E1 and E2 in parallel* on the two English sample PDFs. Both run on PyMuPDF, no new dependencies, no paid APIs, no legal review needed.],

  step-circle("2"),
  [*Chase the Arabic sample.* Blocks E5 but not E1 or E2. Independent track.],

  step-circle("3"),
  [*Receive the layout-AI deep-research report.* Updates the approach-D memo and locks the vendor choice. Does not block Gate 1.],
)

#v(0.5em)

#callout(title: "Decision needed", color: colors.primary, icon: icon-info)[
  Confirm Gate 1 scope (E1 plus E2 on PyMuPDF, deep-research for D deferred). Confirm to start the E1 scaffold on English samples immediately, rather than waiting for Arabic. If no response: default is start now.
]

#pagebreak(weak: true)

= What stays stable, what changes

#v(0.3em)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  panel(title: "Stays", color: colors.success.darken(15%))[
    #set text(size: 9pt, fill: colors.ink-soft)
    - The #chip("PDFFieldDefinition") schema. #chip("bbox") is already there.
    - Existing human-curated PDF templates continue to work unchanged.
    - The #chip("fill_pdf_template") WebSocket action-event contract.
    - The Azure blob upload pattern for modified PDFs.
    - The HTML template path. It keeps being the authoritative example of "what good looks like."
  ],
  panel(title: "Changes", color: colors.warning.darken(15%))[
    #set text(size: 9pt, fill: colors.ink-soft)
    - #chip("bbox") becomes the primary replacement anchor when present.
    - A new #chip("pdf_autotemplate") module synthesises field lists from uploads.
    - Uploaded PDFs pass through that module before reaching the editor.
    - #chip("PDFTemplate.source") adopts the #chip("user_generated") value path.
    - Possibly a second integration with the HTML template path, if approach B wins.
  ],
)

= Appendix A. Repository

#v(0.3em)

#panel(title: none, color: colors.muted)[
  #set text(size: 8.5pt, fill: colors.ink-soft)
  #set par(leading: 0.55em)

  #block[*Repo*: #link("https://github.com/Ghaia-ai/dynamic-editing-r-n-d")[github.com/Ghaia-ai/dynamic-editing-r-n-d]]
  #block[*Tracking*: ClickUp list 901817609894 in folder "R&D NPC Dynamic PDF Editing" under space "R&D". All tasks in the list are linked to this report.]
  #block[*Initiating ticket*: #link("https://app.clickup.com/t/86ewuq5my")[clickup.com/t/86ewuq5my]]
  #block[*Downstream product repo*: #chip("Ghaia-ai/npc-pr-agent") at local path #chip("/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent")]
]

= Appendix B. Glossary

#v(0.3em)

#panel(title: none, color: colors.muted)[
  #set text(size: 8.5pt, fill: colors.ink-soft)
  #set par(leading: 0.55em)

  #block[*SSIM* (structural similarity index). Measures structural agreement between two images. Zero to one, higher is better. Industry standard for image-fidelity comparisons.]
  #block[*MAE* (mean absolute error). Average per-pixel colour difference. Complements SSIM by catching subtle colour drift.]
  #block[*bbox* (bounding box). A rectangle #chip("[x0, y0, x1, y1]") in PDF points that marks a region on a page.]
  #block[*PDFFieldDefinition*. The Pydantic model in #chip("npc-pr-agent") that defines one editable field in a PDF template. Already includes a #chip("bbox") field today.]
  #block[*Overlay*. An editing approach where the original PDF is left untouched as a background, and only the new value is drawn on top.]
  #block[*Round-trip*. The PDF-to-HTML-to-PDF pipeline in approach B. Each conversion is lossy; round-trip fidelity is the cumulative visual difference.]
  #block[*Gate*. A decision point between experiment sets. Gate 1 runs cheap experiments first; Gate 2 only runs if Gate 1 fails to produce a winner.]
  #block[*auto_templatize*. The LLM-driven module in #chip("npc-pr-agent") that converts raw HTML into Jinja-templated HTML. Approach B aims to feed PDFs into the same pipeline.]
]

= Bibliography

#v(0.3em)

#panel(title: none, color: colors.muted)[
  #set text(size: 8.5pt, fill: colors.ink-soft)
  #set par(leading: 0.55em)

  #block[*1.* Initiating brief, email from Minhal Abdul Sami, 2026-04-13. Stored at #chip("research/raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf").]
  #block[*2.* Bug analysis memo. #chip("research/wiki/bug-context.md").]
  #block[*3.* Research strategy memo. #chip("research/wiki/research-strategy.md").]
  #block[*4.* Fidelity metric definition. #chip("research/wiki/fidelity-evaluation.md").]
  #block[*5.* Integration surface memo. #chip("research/wiki/integration-surface.md").]
  #block[*6.* Approach matrix rollup. #chip("research/wiki/approach-matrix.md").]
  #block[*7.* Sample PDFs. #chip("datasets/samples/qms_psa_121_feb_2024_poster.pdf") and #chip("datasets/samples/water_infographics_en_filled.pdf"). Provenance in #chip("datasets/readme.md").]

  #v(0.4em)
  #text(size: 8pt, fill: colors.muted)[Every claim in this report traces to a committed file under the repository above.]
]
