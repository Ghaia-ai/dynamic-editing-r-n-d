# problem framing

> source: `../raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf` (email from minhal abdul sami, 2026-04-13)
> status: draft
> owner: elaa

## problem

users upload posters / infographic PDFs and need to edit specific values (e.g. dates, names, statistics) while preserving the document's exact visual design, layout precision, and formatting. the input PDFs behave as flattened visual canvases:

- text elements are positioned arbitrarily, with no reliable semantic linkage between labels and their values.
- each PDF has a unique layout and design; no reusable template exists.
- traditional field-mapping / form-filling approaches are unreliable.

## constraints

- must preserve visual fidelity through any round-trip transformation.
- must scale across heterogeneous, one-off layouts -- no per-pdf manual template construction if it can be avoided.
- arabic / rtl layouts are in scope (npc domain).

## candidate approaches (from brief)

1. **pdf to structured format conversion** -- extract layout-aware text + positioning (bounding boxes, layers).
2. **html-based editing (pdf -> html -> pdf)** -- chris's proposal. pixel-perfect html/css as the intermediate.
3. **overlay-based editing** -- immutable original as background; editable text layers placed on top.
4. **ai-assisted layout understanding** -- detect regions, labels, and values dynamically (layoutlm / doclaynet / donut / vision llms).

## user workflow dimension (from brief)

- how users declare which values are editable (auto-detect vs. explicit mapping).
- whether a per-pdf configuration step is acceptable.
- trade-off between flexibility and usability.

## goal of this phase

identify viable approaches with pros/cons, validate feasibility via quick experiments or prototypes, and recommend a scalable and maintainable direction. this is explicitly framed as exploratory, not implementation.

## next steps

- [ ] stand up `benchmarks/datasets/` with the two sample PDFs attached to the brief (`qms_psa_121_feb_2024_poster.pdf`, `water_infographics_en_filled.pdf`) -- request from minhal.
- [ ] write `wiki/approach-matrix.md` with a first-pass pros/cons.
- [ ] scope first experiment: layout-aware extraction fidelity benchmark (pymupdf vs. pdfplumber vs. adobe pdf extract).
