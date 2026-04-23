---
globs: ["reports/**"]
---

- authoring format is **typst**. source in `reports/src/`, compiled pdf in `reports/out/` (gitignored). do not check in compiled pdfs.
- filenames: `<slug>-v<major>.<minor>.typ`. versioned drafts coexist; never overwrite a numbered version in place.
- import the shared theme via `#import "theme.typ": *`. when a style change would break existing reports, fork to `theme-v<n>.typ` and pin existing reports to the old theme.
- every report's front matter sets: `title`, `subtitle`, `date` (iso), `version`, `doc-type` (business brief | developer brief | decision memo | benchmark report).
- every report has these sections, in order: tl;dr / bottom line, context, findings, decision / recommendation. the decision section is mandatory.
- cite research artifacts by relative path: `research/wiki/problem-framing.md`, `benchmarks/results/extract_2026-04-23_abc123.json`.
- compile command: `typst compile reports/src/<slug>.typ reports/out/<slug>.pdf`.
