---
globs: ["**/*.py", "benchmarks/**", "research/**"]
---

- prefer pymupdf (fitz) for layout-aware extraction; prefer pdfplumber when you need table structure; prefer pdf.js for in-browser rendering experiments.
- always record pdf coordinate space assumptions: pymupdf uses top-left origin in points; pdfplumber uses bottom-left in points. mixing them silently is a common bug.
- arabic / rtl posters are a first-class concern in this project. when extracting text, preserve original glyph order and log whether the extractor returned logical or visual order.
- when writing back to pdf (overlay or full-regenerate), always diff the output visually against the input at the exact same dpi. do not claim "fidelity preserved" without a measured comparison.
- fonts are the single biggest source of round-trip failure. if a pdf uses a subsetted or embedded font, resolve it before any html-roundtrip experiment; otherwise note the font substitution in results.
- never rely on hardcoded dpi (72 / 150 / 300). accept dpi as an experiment parameter and record it in results.
