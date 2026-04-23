# fidelity evaluation

> status: draft
> owner: elaa
> consumed by: every phase-3 experiment

## why this note exists first

phase 3 compares four approaches on the same two pdfs. if each experiment invents its own metric, the results cannot be compared and the recommendation becomes an aesthetic argument. this note locks the measurement methodology so every experiment is apples-to-apples.

## what "fidelity" means here

from the brief: "preserve exact visual design, layout precision, and formatting fidelity." operationally this decomposes into:

1.  **geometric fidelity** -- every non-edited pixel lands in the same place in the output as in the input.
2.  **photometric fidelity** -- every non-edited pixel has the same colour value.
3.  **typographic fidelity** (for edited regions only) -- the replacement text is set in a font visually indistinguishable from the original at normal viewing distance.

we measure (1) and (2) with quantitative metrics. we assess (3) subjectively per experiment but record the evidence (font name, matched or substituted, glyph-width delta if available).

## primary metrics

| metric | what it measures | range | our "pass" threshold |
|---|---|---|---|
| full-page **ssim** | structural similarity (luminance + contrast + structure) between rendered input and rendered output, at matched dpi | 0..1 (higher better) | >= 0.98 "acceptable"; >= 0.995 "excellent" |
| full-page **per-pixel mae** | mean absolute error across rgb channels | 0..255 (lower better) | <= 5 "acceptable"; <= 2 "excellent" |
| **masked ssim** (overlay only) | ssim computed over the **non-edited** region mask; edited bbox excluded | 0..1 | >= 0.99 "overlay is not leaking" |

why two metrics: ssim catches structural drift (text reflow, rescale) that mae alone misses; mae catches subtle colour drift that ssim can under-weight on large uniform regions. running both and reporting both is cheap insurance.

## optional metric

| metric | when to use |
|---|---|
| **lpips** (alex or vgg backbone) | when a disagreement appears between ssim and mae on text-heavy regions; lpips weights perceptual similarity more like a human observer. not required in every run. |

## rendering protocol

all comparisons run on rasterised pages, **not on pdf bytes**. ssim/mae on pdf directly is meaningless because two different byte streams can render identically.

-   renderer: pymupdf (fitz) `page.get_pixmap(dpi=150)` for both input and output. pymupdf's rasterisation is deterministic given the same pdf + dpi, so the comparison is reproducible.
-   dpi: **150** for primary metrics. rationale: high enough to catch sub-point layout shifts, low enough to finish on one page in < 1s. record dpi in every result json.
-   colour space: rgb8. if a pdf uses cmyk, pymupdf converts to rgb; log the conversion.
-   image dimensions: after rasterising both input and output at 150 dpi, pages must have identical dimensions. if not, that itself is a fidelity failure -- log the mismatch and skip metric computation for that page (metric = null; status = "dimension_mismatch").

## shared reference snippet

every experiment must import `benchmarks/_shared/fidelity.py` rather than reimplementing. the contract is:

```python
# benchmarks/_shared/fidelity.py
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz  # pymupdf
import numpy as np
from skimage.metrics import structural_similarity as _ssim


@dataclass
class PageFidelity:
    page_index: int
    dpi: int
    ssim: float | None
    mae: float | None
    status: str  # "ok" | "dimension_mismatch" | "empty_page"


def _render(pdf_path: Path, page_index: int, dpi: int) -> np.ndarray:
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        pix = page.get_pixmap(dpi=dpi)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:  # drop alpha when present
            arr = arr[..., :3]
        return arr
    finally:
        doc.close()


def compare_pages(
    input_pdf: Path,
    output_pdf: Path,
    dpi: int = 150,
    mask: np.ndarray | None = None,
) -> list[PageFidelity]:
    """compare rasterised pages of two pdfs. if mask is supplied, metrics are
    computed only where mask == true (same shape as the rendered page)."""
    doc_in = fitz.open(input_pdf)
    doc_out = fitz.open(output_pdf)
    try:
        n = min(len(doc_in), len(doc_out))
        out: list[PageFidelity] = []
        for i in range(n):
            a = _render(input_pdf, i, dpi)
            b = _render(output_pdf, i, dpi)
            if a.shape != b.shape:
                out.append(PageFidelity(i, dpi, None, None, "dimension_mismatch"))
                continue
            if mask is not None:
                m = mask.astype(bool)
                a_m = a[m]
                b_m = b[m]
                mae = float(np.mean(np.abs(a_m.astype(np.int16) - b_m.astype(np.int16))))
                # ssim on masked array: run on full frame with the mask zeroed; skimage
                # doesn't take a mask directly, so we paint the masked-out region the
                # same in both images to neutralise its contribution.
                a2 = a.copy()
                b2 = b.copy()
                a2[~m] = 0
                b2[~m] = 0
                s = float(_ssim(a2, b2, channel_axis=-1))
            else:
                mae = float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))))
                s = float(_ssim(a, b, channel_axis=-1))
            out.append(PageFidelity(i, dpi, s, mae, "ok"))
        return out
    finally:
        doc_in.close()
        doc_out.close()
```

requirements (pinned in each experiment's `requirements.txt`):

```
pymupdf==1.24.13
numpy==2.1.3
scikit-image==0.24.0
```

(versions are current as of 2026-04; confirm via context7 before each experiment run.)

## result json schema

every experiment's result file must include a `fidelity` block shaped exactly like this:

```json
{
  "fidelity": {
    "dpi": 150,
    "metric_version": "1.0",
    "pages": [
      { "page_index": 0, "ssim": 0.9912, "mae": 3.4, "status": "ok" },
      { "page_index": 1, "ssim": 0.9871, "mae": 4.1, "status": "ok" }
    ],
    "aggregates": {
      "ssim_mean": 0.9891,
      "mae_mean": 3.75
    },
    "mask": "none"
  }
}
```

`mask` is `"none"` for full-page runs, `"edited_bboxes_inverted"` for overlay runs.

## thresholds, restated

| experiment kind | metric | pass |
|---|---|---|
| extract/re-render round-trip (e1) | full-page ssim | >= 0.95 "encouraging"; >= 0.98 "good enough"; <0.90 kill |
| overlay non-edited regions (e2) | masked ssim on inverted-edit mask | >= 0.99 pass; < 0.99 overlay leaks; kill |
| html round-trip (e3) | full-page ssim | >= 0.95 "encouraging"; >= 0.98 "good enough"; <0.90 kill |
| layout-ai detection (e4) | precision/recall of label->value pairs | recall >= 0.80 pass |

these are initial claims. they will be revisited after the first experiment run. locking them now is more important than getting them exactly right.

## what this note deliberately does not do

-   does not evaluate typographic fidelity quantitatively. fonts are handled case-by-case, with evidence logged per run.
-   does not define a subjective human-review protocol. if one is needed after e1/e2, add it then.
-   does not prescribe a perceptual metric. lpips is available as an escape hatch, not a required metric.
