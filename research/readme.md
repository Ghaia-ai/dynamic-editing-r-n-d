# research

research artifacts for the dynamic pdf editing R&D.

## layout

- `raw/` -- primary sources: vendor docs, academic papers, sample PDFs, and internal briefs. preserve original filenames where meaningful, prepend an iso date when provenance ordering matters. every file must cite provenance (source url / sender / date).
- `wiki/` -- our synthesized notes. each wiki file cites the specific files in `raw/` it derives from, by relative path.

## current sources

- `raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf` -- initiating brief from minhal abdul sami framing the problem, constraints, and four candidate approaches.

## wiki entries to write

- `wiki/problem-framing.md` -- distilled problem statement and success criteria derived from the brief.
- `wiki/approach-matrix.md` -- pros/cons table across the four candidate approaches.
- `wiki/pdf-extract-tools.md` -- landscape scan: pymupdf, pdfplumber, adobe pdf extract, docling, unstructured.io.
- `wiki/fidelity-evaluation.md` -- how we measure visual fidelity (ssim, per-pixel, lpips) and what thresholds matter.
