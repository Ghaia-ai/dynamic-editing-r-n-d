# reports

R&D reports and decision memos.

## layout

- `src/` -- typst source. shared styles live in `theme.typ`.
- `out/` -- compiled PDFs. gitignored; regenerate on demand.
- `assets/` -- images and other static assets referenced by report sources.

## conventions (shared with `avatar-r-n-d/reports/`)

- authoring format: **typst**. source files are `<slug>-v<major>.<minor>.typ`.
- shared theme: `theme.typ`. when the palette or typography changes meaningfully, fork to `theme-v<n>.typ` rather than mutating the existing theme. existing reports keep importing the pinned version they were written against.
- front matter (every report):
  - `title`
  - `subtitle`
  - `date` (iso)
  - `version`
  - `doc-type` (business brief | developer brief | decision memo | benchmark report)
- structure:
  1. tl;dr / bottom line (one section, above the fold)
  2. context and requirements
  3. findings
  4. decision / recommendation (never skip)
- cite research artifacts by relative path: `research/wiki/problem-framing.md`, `benchmarks/results/extract_2026-04-23_abc123.json`.

## compile

```bash
typst compile reports/src/<slug>-v0.1.typ reports/out/<slug>-v0.1.pdf
```

## planned reports

- [ ] `dynamic-pdf-approach-comparison-v0.1.typ` -- pros/cons across the four candidate approaches.
- [ ] `extract-tools-benchmark-v0.1.typ` -- fidelity/latency of pymupdf, pdfplumber, adobe pdf extract.
- [ ] `recommendation-v0.1.typ` -- final direction (produced after experiments land).
