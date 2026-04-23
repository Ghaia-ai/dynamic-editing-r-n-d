#import "theme.typ": *

#show: report.with(
  title: "Dynamic PDF editing R&D",
  subtitle: "Developer brief. Architecture, integration surface, experiment scaffolds.",
  date: "2026-04-23",
  version: "0.1",
  doc-type: "developer brief",
)

= Bottom line

The incumbent PDF fill path in #chip("npc-pr-agent") assumes a human-curated #chip("PDFFieldDefinition") list per template. It uses literal-text search to locate replacement sites. Arbitrary user uploads have neither the curated list nor stable literal tokens to search for. This R&D replaces the curation step with an automated pre-processor. The schema the editor already consumes is rich enough to be the contract; the fix is to populate it from the upload itself.

= Anatomy of the incumbent

#v(0.3em)

#panel(title: "Today: the path the bug lives in", color: colors.danger, keep: true)[
  #set text(size: 8.5pt, fill: colors.ink-soft)
  #grid(
    columns: (1fr, auto, 1fr, auto, 1fr),
    column-gutter: 6pt,
    align: center + horizon,

    // 1. upload
    cloud-box("user upload", color: colors.primary)[
      #set text(size: 8pt)
      #chip("WebSocket /ws/{thread_id}")
      #v(0.2em)
      arbitrary PDF bytes
    ],
    arrow-label("", color: colors.primary),

    // 2. admin gate (the bug)
    cloud-box("admin curation, manual", color: colors.danger)[
      #set text(size: 8pt)
      #chip("PDFTemplate") record
      #v(0.2em)
      list of #chip("PDFFieldDefinition")
      #v(0.2em)
      each with #chip("search_pattern")
    ],
    arrow-label("", color: colors.primary),

    // 3. editor
    cloud-box("PDF editor", color: colors.secondary)[
      #set text(size: 8pt)
      #chip("fill_pdf_template")
      #v(0.2em)
      #chip("PDFEditor.search_and_replace")
      #v(0.2em)
      literal text search
    ],
  )

  #v(0.6em)
  #line(length: 100%, stroke: 0.4pt + colors.rule)
  #v(0.3em)
  #text(size: 8pt, fill: colors.muted)[
    The middle step is the gate. Without it, the editor has no #chip("search_pattern") to run against. With arbitrary uploads, the gate is either absent or produces brittle patterns (glyph runs in Illustrator/Canva exports don't match logical text).
  ]
]

#v(0.4em)

= The contract we have to satisfy

#chip("PDFFieldDefinition") (at #chip("src/models/pdf_template.py:25")) already declares the shape the rest of the pipeline consumes. Any new approach that returns this shape drops in with zero code changes downstream.

#v(0.3em)

#panel(title: "PDFFieldDefinition fields", color: colors.primary)[
  #set text(size: 8.8pt)
  #table(
    columns: (2.2fr, 1.2fr, 4.5fr, 1.8fr),
    stroke: none,
    inset: (x: 6pt, y: 7pt),
    align: (left + horizon, left + horizon, left + horizon, left + horizon),
    table.header(
      table.cell(fill: colors.ink)[Field],
      table.cell(fill: colors.ink)[Required],
      table.cell(fill: colors.ink)[Supply via],
      table.cell(fill: colors.ink)[Today],
    ),
    [#chip("field_key")], [yes], [synth from label or LLM label], tag("manual", color: colors.danger),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("label")], [yes], [detected or LLM label], tag("manual", color: colors.danger),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("current_value")], [yes], [extracted text inside the bbox], tag("manual", color: colors.danger),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("search_pattern")], [yes (can demote)], [literal current_value, or unused when bbox authoritative], tag("brittle", color: colors.danger),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("page")], [yes], [page index], tag("manual", color: colors.danger),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("bbox")], [optional today], [produced by extract or layout-AI], tag("unused", color: colors.warning, variant: "solid"),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("color"), #chip("fontsize_factor"), #chip("format_hint"), #chip("bg_color")], [optional], [inferred from extracted span, or defaults], tag("defaults", color: colors.muted),
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("enabled")], [default true], [unchanged], tag("unchanged", color: colors.muted),
  )
]

#callout(title: "Key insight", color: colors.success, icon: icon-check)[
  #chip("bbox") is already on every record. Today it's populated but unused by the primary replacement path. Making it authoritative when present is an additive change; existing templates with empty #chip("bbox") keep working via the #chip("search_pattern") fallback.
]

#pagebreak(weak: true)

= Integration seams

Three candidate insertion points. Phase 2 recommends seam 2 as the default, with seam 1 as a companion if approach C wins.

#v(0.3em)

#panel(title: "Three seams in npc-pr-agent", color: colors.primary)[
  #set text(size: 8.5pt, fill: colors.ink-soft)

  #grid(
    columns: (auto, 1fr),
    column-gutter: 12pt,
    row-gutter: 10pt,

    step-circle("1", color: colors.secondary),
    [
      *Seam 1: replace the editor.* Swap #chip("src/services/pdf/pdf_editor.py") so #chip("bbox") is the primary anchor. Fits overlay (approach C). Rest of the pipeline unchanged. Deepest change at the editor, no change anywhere else.
    ],

    step-circle("2", color: colors.primary),
    [
      *Seam 2: add a pre-processor module.* New file #chip("src/services/pdf/pdf_autotemplate.py") that accepts raw PDF bytes and returns #chip("(PDFTemplate, list[PDFFieldDefinition])"). Fits all four approaches equally. Smallest blast radius. Mirrors the existing #chip("template_analyzer.auto_templatize") pattern on the HTML side.
      #v(0.2em)
      #tag("recommended", color: colors.success, variant: "solid")
    ],

    step-circle("3", color: colors.warning),
    [
      *Seam 3: branch at tool entry.* Add a check inside #chip("fill_pdf_template") for "uploaded but uncurated" state; synthesise a template on the fly. Shallowest, but mixes concerns at the tool boundary. Keep as fallback.
    ],
  )
]

= Proposed pipeline with seam 2

#v(0.3em)

#panel(title: "With the auto-templatiser", color: colors.primary, keep: true)[
  #set text(size: 8.5pt, fill: colors.ink-soft)
  #grid(
    columns: (1fr, auto, 1fr, auto, 1fr, auto, 1fr),
    column-gutter: 5pt,
    align: center + horizon,

    // 1. upload
    cloud-box("upload", color: colors.primary)[
      #set text(size: 7.5pt)
      PDF bytes
    ],
    arrow-label("", color: colors.primary),

    // 2. NEW: auto-templatiser
    cloud-box("new: pdf_autotemplate", color: colors.success)[
      #set text(size: 7.5pt)
      one of A/B/C
      #v(0.2em)
      approach D as detector
    ],
    arrow-label("", color: colors.primary),

    // 3. cosmos
    cloud-box("PDFTemplate in Cosmos", color: colors.secondary)[
      #set text(size: 7.5pt)
      #chip("source=user_generated")
      #v(0.2em)
      #chip("bbox") populated
    ],
    arrow-label("", color: colors.primary),

    // 4. editor
    cloud-box("PDFEditor", color: colors.secondary)[
      #set text(size: 7.5pt)
      bbox-anchored replace
      #v(0.2em)
      font reuse via #chip("_extract_fonts")
    ],
  )

  #v(0.6em)
  #line(length: 100%, stroke: 0.4pt + colors.rule)
  #v(0.3em)
  #text(size: 8pt, fill: colors.muted)[
    The only new code is the #chip("pdf_autotemplate") module and a small promotion of #chip("bbox") in the editor. Everything downstream — the WebSocket event contract, the #chip("download_url") response keys, blob upload — is untouched.
  ]
]

#pagebreak(weak: true)

= The four experiments

Each self-contained under #chip("benchmarks/<exp>/"). Each imports the shared fidelity metric from #chip("benchmarks/_shared/fidelity.py") defined in Phase 1.

#v(0.3em)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  panel(title: "E1. Extract to structure", color: colors.primary)[
    #set text(size: 9pt)
    - Input: both sample PDFs
    - Tools: PyMuPDF, pdfplumber cross-check
    - Output: re-rendered PDF from extracted spans
    - Metric: full-page SSIM at 150 dpi
    - *Kill*: both under 0.90
    #v(0.2em)
    #tag("gate 1", color: colors.success, variant: "solid")
  ],

  panel(title: "E2. Overlay editing", color: colors.primary)[
    #set text(size: 9pt)
    - Input: both sample PDFs plus a chosen field
    - Tool: PyMuPDF redact and insert
    - Output: PDF with one field value changed
    - Metric: masked SSIM on non-edited region
    - *Kill*: under 0.99
    #v(0.2em)
    #tag("gate 1", color: colors.success, variant: "solid")
  ],

  panel(title: "E3. PDF to HTML to PDF", color: colors.warning.darken(10%))[
    #set text(size: 9pt)
    - Input: both sample PDFs
    - Tools: pdf2htmlEX, Adobe PDF Extract (HTML mode)
    - Second leg: Playwright re-render
    - Metric: full-page SSIM plus auto_templatize probe
    - *Kill*: best under 0.90, or glyph-soup HTML
    #v(0.2em)
    #tag("gate 2 — conditional", color: colors.warning, variant: "solid")
  ],

  panel(title: "E4. Layout-AI detection", color: colors.warning.darken(10%))[
    #set text(size: 9pt)
    - Input: rendered page images
    - Tools: Azure Document Intelligence, vision LLM TBD
    - Output: label/value pair detection with bboxes
    - Metric: precision/recall against hand-labelled ground truth
    - *Kill*: recall under 80%
    #v(0.2em)
    #tag("gate 2 — conditional", color: colors.warning, variant: "solid")
  ],
)

#v(0.3em)

#callout(title: "E5 stress test", color: colors.danger, icon: icon-warn)[
  Arabic and RTL stress test on the winner only. Every PDF tool handles Arabic differently; logical vs visual glyph order is the single most common silent failure. Blocked on an Arabic sample from Minhal's team.
]

= Scaffold layout

#v(0.3em)

#panel(title: "What lands when a Phase 3 experiment starts", color: colors.secondary)[
  ```
  benchmarks/
    _shared/
      fidelity.py              # from Phase 1; imported by every experiment
    e1-extract/
      readme.md                # hypothesis, methodology
      requirements.txt         # pinned: pymupdf==1.24.13, pdfplumber, ...
      run.py                   # entrypoint
      analyze.py               # optional, post-processing
    e2-overlay/
      readme.md
      requirements.txt
      run.py
      manifest.json            # declares which field to edit per sample
    results/
      e1_2026-04-24_<hash>.json
      e2_2026-04-24_<hash>.json
      ...
  ```
]

#pagebreak(weak: true)

= Non-functional envelope

#v(0.3em)

#panel(title: "Latency budgets, inherited from the existing codebase", color: colors.primary)[
  #set text(size: 9pt)
  #table(
    columns: (1fr, auto, 2fr),
    stroke: none,
    inset: (x: 6pt, y: 6pt),
    align: (left, right, left),
    table.header(
      table.cell(fill: colors.ink)[Stage],
      table.cell(fill: colors.ink)[p95 target],
      table.cell(fill: colors.ink)[Rationale],
    ),
    [detect editable fields], [≤ 10 s], [matches #chip("NPC_PLAYWRIGHT_OP_TIMEOUT_MS=10000") precedent; one-time per upload],
    table.hline(stroke: 0.3pt + colors.rule),
    [apply edit(s) to detected template], [≤ 3 s], [current fill takes ~1-2 s; must not regress],
    table.hline(stroke: 0.3pt + colors.rule),
    [render preview (overlay)], [≤ 2 s], [interactivity threshold; worse and UX collapses],
    table.hline(stroke: 0.3pt + colors.rule),
    [full cold round-trip], [≤ 15 s], [WebSocket action-event stream can mask up to this],
  )
]

#v(0.4em)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  panel(title: "Cost envelope", color: colors.primary)[
    #set text(size: 9pt, fill: colors.ink-soft)
    - Per-PDF detection: #sym.lt.eq USD 0.05 for production
    - Per-benchmark run: cap USD 5 and log actual
    - Applies to any approach that reaches a paid API (B, D)
  ],
  panel(title: "Language + deployment", color: colors.primary)[
    #set text(size: 9pt, fill: colors.ink-soft)
    - English + Arabic RTL first-class; Arabic gate is E5
    - Azure resource group #chip("ghaia-r-n-d")
    - Existing Azure OpenAI deployment reused for experiments
    - No new storage backends; reuse blob upload helper
  ],
)

= Observability

Structured logs via #chip("gagent_core.logs.logger") with the #chip("[{session_id}]") prefix pattern. Every detection and edit operation emits an action event via #chip("send_action_event") so the frontend progress UI stays informed. Every experiment commits its results JSON; historical comparison is grep-friendly.

= Risks, concrete

#v(0.3em)

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  callout(title: "Outlined text", color: colors.warning, icon: icon-warn)[
    Headlines and stylised numerals are often converted to vector paths by the designer. No text to extract, no text to search. Approach A silently misses these. Approach C can't redact path-converted text via #chip("apply_redactions(graphics=0)").
  ],
  callout(title: "Glyph-coverage preflight", color: colors.warning, icon: icon-warn)[
    The extracted embedded font is a subset. Replacing "2024" with "2026" works; replacing "A" with "Á" may silently substitute. Every overlay edit needs a preflight coverage check.
  ],
  callout(title: "Arabic bidi at arbitrary bbox", color: colors.danger, icon: icon-cross)[
    PyMuPDF's #chip("insert_text") draws LTR. For Arabic, #chip("insert_htmlbox") delegates to a shaping engine that handles bidi. The highest-value single test on the Arabic sample is whether this method produces clean RTL rendering at an arbitrary bbox.
  ],
  callout(title: "Cosmos partition pressure", color: colors.primary, icon: icon-info)[
    #chip("PDFTemplate") is partitioned by #chip("/category"). User-generated templates per session could multiply rapidly. Lifecycle policy needs a decision before production: per-session TTL, or consolidated storage keyed on a content hash of the upload.
  ],
)

#pagebreak(weak: true)

= Appendix A. File map

#v(0.3em)

#panel(title: "Repository layout", color: colors.secondary)[
  ```
  dynamic-editing-rnd/
    CLAUDE.md                            # repo rules, cadence, tracking
    .claude/rules/                       # 5 scoped rule files
      pdf-handling.md
      benchmarks.md
      research.md
      reports.md
      diagrams.md
    datasets/
      readme.md
      samples/
        qms_psa_121_feb_2024_poster.pdf  # 3.4 MB
        water_infographics_en_filled.pdf # 1.4 MB
    research/
      raw/
        2026-04-13_email_minhal_dynamic-pdf-rnd.pdf
      wiki/
        problem-framing.md
        bug-context.md
        research-strategy.md
        fidelity-evaluation.md           # metric + reference snippet
        requirements-functional.md
        requirements-nonfunctional.md
        integration-surface.md
        approach-a-extract-tools.md
        approach-b-pdf-to-html.md
        approach-c-overlay.md
        approach-d-layout-ai.md          # placeholder
        approach-matrix.md               # rollup
    reports/
      src/theme.typ                      # Typst theme
      src/dynamic-pdf-editing-business-v0.1.typ
      src/dynamic-pdf-editing-developer-v0.1.typ
      out/                               # compiled PDFs, gitignored
    benchmarks/                          # Phase 3 populates this
    diagrams/                            # Phase 3 or 4 populates this
  ```
]

= Appendix B. Files touched upstream

These are the paths in #chip("npc-pr-agent") that the integration work will modify.

#v(0.3em)

#panel(title: "Upstream change set under seam 2 + seam 1", color: colors.primary)[
  #set text(size: 9pt)
  #table(
    columns: (3.2fr, 1fr, 4fr),
    stroke: none,
    inset: (x: 6pt, y: 7pt),
    align: (left + horizon, left + horizon, left + horizon),
    table.header(
      table.cell(fill: colors.ink)[Path],
      table.cell(fill: colors.ink)[Kind],
      table.cell(fill: colors.ink)[Change],
    ),
    [#chip("src/services/pdf/pdf_autotemplate.py")], tag("new", color: colors.success, variant: "solid"), [Synthesises #chip("(PDFTemplate, list[PDFFieldDefinition])") from upload bytes.],
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("src/services/pdf/pdf_editor.py")], tag("mod", color: colors.warning, variant: "solid"), [Promote #chip("bbox") to authoritative anchor when present; #chip("search_pattern") becomes fallback.],
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("src/workflows/fill_poster/tools.py")], tag("mod", color: colors.warning, variant: "solid"), [On upload-without-template, call #chip("pdf_autotemplate") before editing.],
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("src/models/pdf_template.py")], tag("add", color: colors.primary, variant: "solid"), [Make #chip("search_pattern") optional; recognise #chip("source=user_generated") lifecycle.],
    table.hline(stroke: 0.3pt + colors.rule),
    [#chip("src/routes/templates.py")], tag("maybe", color: colors.muted, variant: "outline"), [Optional: expose an admin endpoint that triggers auto-templatization preview.],
  )
]

= Bibliography

#v(0.3em)

#panel(title: none, color: colors.muted)[
  #set text(size: 8.5pt, fill: colors.ink-soft)
  #set par(leading: 0.55em)

  #block[*1.* Business companion: #chip("reports/src/dynamic-pdf-editing-business-v0.1.typ").]
  #block[*2.* Bug analysis: #chip("research/wiki/bug-context.md").]
  #block[*3.* Research strategy: #chip("research/wiki/research-strategy.md").]
  #block[*4.* Fidelity metric: #chip("research/wiki/fidelity-evaluation.md").]
  #block[*5.* Integration surface: #chip("research/wiki/integration-surface.md").]
  #block[*6.* Functional requirements: #chip("research/wiki/requirements-functional.md").]
  #block[*7.* Non-functional requirements: #chip("research/wiki/requirements-nonfunctional.md").]
  #block[*8.* Approach memos: #chip("research/wiki/approach-a-extract-tools.md"), #chip("-b-pdf-to-html.md"), #chip("-c-overlay.md"), #chip("-d-layout-ai.md").]
  #block[*9.* Approach matrix: #chip("research/wiki/approach-matrix.md").]
  #block[*10.* Downstream product code: #chip("Ghaia-ai/npc-pr-agent"), specifically #chip("src/workflows/fill_poster/tools.py"), #chip("src/services/pdf/pdf_editor.py"), #chip("src/models/pdf_template.py"), #chip("src/services/visual_content/template_analyzer.py").]
]
