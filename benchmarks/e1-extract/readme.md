# e1 — layout-aware extract fidelity

phase-3 gate-1 experiment. tests approach a (extract-to-structure) on the two sample pdfs.

## hypothesis

pymupdf's `get_text("dict")` returns text spans with positions, fonts, and sizes good enough that, after re-rendering the extracted structure back to a pdf, the result matches the original at visual parity. pdfplumber's `extract_words` provides a cross-check.

## method

1.  **extract** -- load each sample pdf; for each page, collect every text span (pymupdf) and every word (pdfplumber).
2.  **re-render** -- create a new pdf with pages of matching dimensions and paint each extracted span at its bbox using the detected font size and a shipped font (helvetica -- we're not testing font resolution in e1, only positioning).
3.  **measure** -- compare original vs re-rendered via `benchmarks/_shared/fidelity.compare_pages` at 150 dpi. full-page ssim + per-pixel mae.
4.  **cross-validate** -- report pymupdf and pdfplumber span counts per page, plus an "agreement" summary (how many pymupdf spans fall within the bbox of a pdfplumber word and vice versa).

## what we learn regardless of ssim

even if full-page ssim falls far below 0.90 (expected: text-only re-render omits backgrounds, images, vector art), the harness tells us:

-   **span fragmentation**: how many spans pymupdf returns for a visible "word." high fragmentation means our auto-template would produce over-granular fields.
-   **bbox disagreement**: pymupdf and pdfplumber should produce consistent bboxes within ~1pt. large disagreement is a coordinate-system bug we'd need to fix before approach c can work.
-   **outlined-text miss rate**: text converted to vector paths never appears in either extractor's output. we detect this by comparing total ink in the original to total ink covered by extracted bboxes.

## kill criterion

per the approach matrix: full-page ssim < 0.90 on **both** samples means approach a alone is not viable. pymupdf gets demoted to "detector for approaches b and c" rather than a standalone solution.

**but:** e1's failure is expected for unrelated reasons (text-only re-render). the real kill for approach a is in the *diagnostic* summary, not the ssim score. if pymupdf loses 40% of the visible text on a poster to outlined glyphs, that's the kill signal; if ssim is 0.65 but text coverage is 95%, approach a is still viable.

## run

```bash
cd /Users/elaabouazza/Desktop/Ghaia/dynamic-editing-rnd
python3 -m venv benchmarks/.venv
source benchmarks/.venv/bin/activate
pip install -r benchmarks/e1-extract/requirements.txt
PYTHONPATH=benchmarks python benchmarks/e1-extract/run.py
```

results land in `benchmarks/results/e1_<date>_<hash>.json`.

## non-goals for e1

-   font matching (approach c territory).
-   arabic / rtl (deferred to e5 on the winner).
-   semantic label-value pairing (approach d territory).
