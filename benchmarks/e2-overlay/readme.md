# e2 — overlay editing (bbox-anchored redact + insert)

phase-3 gate-1 experiment. tests approach c (overlay) on the two sample pdfs.

## hypothesis

pymupdf's `add_redact_annot` + `apply_redactions` + `insert_text` pipeline, driven by an authoritative bbox (not a literal-text search), can replace a single value on a poster while leaving the rest of the page pixel-identical. the incumbent `npc-pr-agent/src/services/pdf/pdf_editor.py` already implements this for pre-curated templates; e2 tests whether the same machinery works when the bbox comes from extraction rather than manual curation.

## method

1.  **pick a field per sample** (see `manifest.json`): one numeric span with a clean bbox, existing in the pymupdf extraction, same-width replacement string to eliminate layout reflow as a variable.

2.  **sample background** adjacent to the bbox to get the cover rectangle colour.

3.  **add redact annot** on the span's bbox with the sampled fill; `apply_redactions(graphics=0)` to preserve vector art around the edit.

4.  **register embedded font** on the page so insert_text can use the pdf's own font (no substitution).

5.  **insert new text** at the span's origin with the extracted fontsize.

6.  **measure** via masked ssim on non-edited regions (inverted-edit-bbox mask, padded slightly). kill criterion: masked ssim < 0.99.

## success looks like

-   masked ssim on non-edited regions >= 0.99 (overlay doesn't leak).
-   replacement text visible at the bbox (read-back via fitz text extraction confirms).
-   font matched (extracted from the pdf, not substituted).

## kill criterion

masked ssim < 0.99 means the compositor itself is leaking -- cover rect wrong colour, apply_redactions re-rasterising regions that shouldn't be touched, something else. if e2 fails here, approach c is dead regardless of library choice because the failure is at the concept layer, not implementation.

## what e2 does NOT test

-   **font glyph coverage**: if the new value contains glyphs not in the embedded subset, insert_text silently substitutes. we're using same-script same-digit replacements in e2 to avoid this; glyph-coverage preflight is a phase-4 integration concern.
-   **arabic / rtl**: e5, on the winner.
-   **background sampling on patterns / images**: both samples have mostly solid-colour panels around numeric values. patterned-bg failure is a known risk (`approach-c-overlay.md` p2) and needs a separate case; e2 starts with the easy case.
-   **many simultaneous edits**: single-field per sample to keep the signal clean. batch edits are a real production concern but don't change the go/no-go.

## run

```bash
cd /Users/elaabouazza/Desktop/Ghaia/dynamic-editing-rnd
source benchmarks/.venv/bin/activate
pip install -r benchmarks/e2-overlay/requirements.txt
PYTHONPATH=benchmarks python benchmarks/e2-overlay/run.py
```

results land in `benchmarks/results/e2_<date>_<hash>.json`.
