"""Shared fidelity metric for phase-3 experiments.

Contract pinned in `research/wiki/fidelity-evaluation.md`. Every experiment
that compares PDFs must import this module rather than reimplementing the
metric, so results JSONs across experiments are comparable.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path

import fitz  # pymupdf
import numpy as np
from skimage.metrics import structural_similarity as _ssim

DEFAULT_DPI = 150
METRIC_VERSION = "1.0"


@dataclass
class PageFidelity:
    page_index: int
    dpi: int
    ssim: float | None
    mae: float | None
    status: str  # "ok" | "dimension_mismatch" | "empty_page"

    def to_dict(self) -> dict:
        return asdict(self)


def _render(pdf_path: Path, page_index: int, dpi: int) -> np.ndarray:
    """Rasterise one page of a PDF to an RGB numpy array."""
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        pix = page.get_pixmap(dpi=dpi)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )
        if pix.n == 4:
            arr = arr[..., :3]
        elif pix.n == 1:
            arr = np.repeat(arr, 3, axis=-1)
        return arr
    finally:
        doc.close()


def compare_pages(
    input_pdf: Path,
    output_pdf: Path,
    dpi: int = DEFAULT_DPI,
    mask: np.ndarray | None = None,
) -> list[PageFidelity]:
    """Compare rasterised pages of two PDFs.

    If ``mask`` is supplied, it must be a boolean array of the same shape as
    the rendered page. Metrics are computed only where mask == True.

    For overlay-style experiments, pass the *inverted* edit bbox mask so only
    non-edited regions contribute to the metric.
    """
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
            if a.size == 0:
                out.append(PageFidelity(i, dpi, None, None, "empty_page"))
                continue
            if mask is not None:
                m = mask.astype(bool)
                if m.shape != a.shape[:2]:
                    out.append(PageFidelity(i, dpi, None, None, "dimension_mismatch"))
                    continue
                a_m = a[m]
                b_m = b[m]
                mae = float(np.mean(np.abs(a_m.astype(np.int16) - b_m.astype(np.int16))))
                a2 = a.copy()
                b2 = b.copy()
                a2[~m] = 0
                b2[~m] = 0
                ssim_val = float(_ssim(a2, b2, channel_axis=-1))
            else:
                mae = float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))))
                ssim_val = float(_ssim(a, b, channel_axis=-1))
            out.append(PageFidelity(i, dpi, ssim_val, mae, "ok"))
        return out
    finally:
        doc_in.close()
        doc_out.close()


def aggregate(pages: list[PageFidelity]) -> dict:
    """Aggregate a list of per-page fidelity results into the results-JSON shape."""
    oks = [p for p in pages if p.status == "ok"]
    return {
        "metric_version": METRIC_VERSION,
        "pages": [p.to_dict() for p in pages],
        "aggregates": {
            "ssim_mean": (
                float(np.mean([p.ssim for p in oks])) if oks else None
            ),
            "mae_mean": (
                float(np.mean([p.mae for p in oks])) if oks else None
            ),
            "n_pages_ok": len(oks),
            "n_pages_total": len(pages),
        },
    }
