# e6 -- lab: overlay engine + minimal UI

phase-3 demo. takes the production overlay engine from `npc-pr-agent/src/services/pdf/pdf_editor.py`, drives it from auto-detected numeric spans (rather than pre-curated `PDFFieldDefinition`s), and exposes the whole loop as a small react app + fastapi backend so a non-engineer can verify the concept on the sample posters.

this experiment supersedes `e2-overlay/` for the latin gate-1 claim. e2 was the bare-bones version of the same idea and failed at the per-span detection layer; e6 ports the engine that already works in production.

## hypothesis

approach c (overlay) is viable on arbitrary uploads if:

1.  numeric spans can be auto-detected with bbox + page + font + colour
2.  per-span attributes (font, colour, fontsize) are recovered well enough that the redact + insert step produces an edit visually indistinguishable from a hand-curated `PDFFieldDefinition` fill
3.  non-edited regions of the rendered pdf are pixel-identical (masked ssim >= 0.99) to the original

## what's in here

```
benchmarks/lab/
  main.py        fastapi service: /api/samples /detect /apply /sessions
  overlay.py     extraction + edit engine (port of pdf_editor.PDFEditor)
  run_e6.py      benchmark runner (writes the e6 results json)
  ui/            vite + react + tailwind + shadcn lab ui
```

## run

prod-style single container (builds the ui into the image, serves it on 8201):

```bash
docker compose up --build
# open http://localhost:8201
```

dev-mode with hot reload (api on 8201 + vite dev server on 5173 with /api proxy):

```bash
docker compose -f docker-compose.dev.yml up --build
# open http://localhost:5173
```

run the benchmark inside the container:

```bash
docker compose run --rm --no-deps lab python -m benchmarks.lab.run_e6
# results: benchmarks/results/e6_<date>_<hash>.json
```

## results (gate 1, latin)

most recent run: `benchmarks/results/e6_2026-04-25_81f06122.json`.

| sample | edits | all ok | edit time | masked ssim (non-edited regions) |
|---|---:|:---:|---:|---:|
| qms_psa_121_feb_2024_poster.pdf | 4 | yes | 0.26s | 0.99997 |
| water_infographics_en_filled.pdf | 3 | yes | 0.03s | 0.99986 |

both samples clear the 0.99 gate by ~3 nines. the latin failure modes from e2 (helv fallback, black colour, cover-rect seam, "Over Speed (Ra" clipping) are all resolved.

## what this does NOT cover

-   **arabic / rtl shaping**: e5 finding stands. `insert_text` does not shape rtl glyphs. arabic spans are surfaced in the ui but flagged `editable=false`. fixing this requires `insert_htmlbox` with harfbuzz, or routing arabic through approach b (pdf -> html -> pdf).
-   **glyph coverage on free-input characters**: replacing a digit with a digit always works (same script, same subset). replacing a digit with a glyph the embedded font subset doesn't carry will silently substitute. for the demo we restrict edits to the same character set as the original; production needs a glyph-coverage preflight.
-   **non-numeric text**: only numeric / percent spans are surfaced as editable. extending to labels needs more careful auto-detection (or a layout-ai detector -- see e4 in `research/wiki/research-strategy.md`).
-   **patterned / image backgrounds**: cover-rect colour sampling is luminance + text-colour aware (handles solid panels and accent-coloured pills) but isn't tested on photographic or gradient backgrounds. those are a known risk in `research/wiki/approach-c-overlay.md`.

## decision

gate 1 (latin) passes. the same engine that powers the production fill flow on pre-curated templates handles the auto-detect path with the same fidelity. if arabic is in scope for v1, e3 (pdf->html->pdf) needs to run; if v1 ships latin-first, the integration path is clear and the report at `reports/src/dynamic-editing-demo-v0.1.typ` covers the next steps.
