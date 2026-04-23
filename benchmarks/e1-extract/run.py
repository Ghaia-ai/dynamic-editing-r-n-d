"""E1 runner: extract spans, re-render, measure fidelity.

Two extractors are run per sample (pymupdf primary, pdfplumber cross-check).
The pymupdf-derived re-render is what feeds the fidelity metric. pdfplumber
output is recorded for bbox-disagreement diagnostics only.
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import fitz  # pymupdf
import pdfplumber

# repo root two levels up from this file
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "benchmarks"))

from _shared.fidelity import compare_pages, aggregate, DEFAULT_DPI  # noqa: E402

SAMPLES = [
    ROOT / "datasets" / "samples" / "qms_psa_121_feb_2024_poster.pdf",
    ROOT / "datasets" / "samples" / "water_infographics_en_filled.pdf",
]
OUT_DIR = ROOT / "benchmarks" / "results"
TMP_DIR = ROOT / "benchmarks" / "e1-extract" / ".tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)


def extract_pymupdf(pdf_path: Path) -> list[dict]:
    """Return one dict per span: {page, text, bbox, font, size, origin}."""
    doc = fitz.open(pdf_path)
    spans: list[dict] = []
    try:
        for i, page in enumerate(doc):
            data = page.get_text("dict")
            for block in data.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "")
                        if not text.strip():
                            continue
                        spans.append(
                            {
                                "page": i,
                                "text": text,
                                "bbox": list(span.get("bbox", [])),
                                "font": span.get("font", ""),
                                "size": span.get("size", 0.0),
                                "origin": list(span.get("origin", [])),
                            }
                        )
        return spans
    finally:
        doc.close()


def extract_pdfplumber(pdf_path: Path) -> list[dict]:
    """Return one dict per word: {page, text, x0, top, x1, bottom, fontname, size}."""
    words: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            ws = page.extract_words(
                x_tolerance=3,
                y_tolerance=3,
                keep_blank_chars=False,
                extra_attrs=["fontname", "size"],
            )
            for w in ws:
                words.append(
                    {
                        "page": i,
                        "text": w.get("text", ""),
                        "x0": float(w.get("x0", 0.0)),
                        "top": float(w.get("top", 0.0)),
                        "x1": float(w.get("x1", 0.0)),
                        "bottom": float(w.get("bottom", 0.0)),
                        "fontname": w.get("fontname", ""),
                        "size": float(w.get("size", 0.0)),
                    }
                )
    return words


def rerender_from_pymupdf(input_pdf: Path, spans: list[dict], out_pdf: Path) -> None:
    """Create a new PDF whose pages match the input dimensions and paint each
    extracted span at its bbox origin. Uses the shipped Helvetica (helv)
    throughout -- font-matching is not the subject of E1.
    """
    in_doc = fitz.open(input_pdf)
    out_doc = fitz.open()
    try:
        for i, src_page in enumerate(in_doc):
            out_page = out_doc.new_page(
                width=src_page.rect.width, height=src_page.rect.height
            )
            page_spans = [s for s in spans if s["page"] == i]
            for s in page_spans:
                text = s["text"]
                size = max(1.0, float(s["size"]) or 10.0)
                origin = s.get("origin") or None
                bbox = s.get("bbox") or []
                if origin and len(origin) == 2:
                    x, y = origin
                elif len(bbox) == 4:
                    # fall back to bbox bottom-left-ish; bbox is top-left origin
                    x = bbox[0]
                    y = bbox[3]
                else:
                    continue
                try:
                    out_page.insert_text(
                        (float(x), float(y)),
                        text,
                        fontname="helv",
                        fontsize=size,
                        color=(0, 0, 0),
                    )
                except Exception:
                    # skip spans pymupdf refuses to insert (usually unsupported glyphs)
                    continue
        out_doc.save(out_pdf)
    finally:
        in_doc.close()
        out_doc.close()


def bbox_agreement(
    spans: list[dict], words: list[dict], page_index: int, iou_threshold: float = 0.3
) -> dict:
    """Count containment-style agreement between PyMuPDF spans and pdfplumber words.

    PyMuPDF spans are font-runs that can contain multiple whitespace tokens;
    pdfplumber words are one per whitespace token. Equality of rectangles
    would be nonsense. We report two asymmetric metrics instead:

    - `pymupdf_spans_covered`: a span is covered if ANY pdfplumber word has
      IoU with it above threshold. Low coverage means pymupdf returns spans
      pdfplumber doesn't see as text (likely visual artifacts or outlined).
    - `pdfplumber_words_inside_a_span`: a word is inside a span if the word
      centre is spatially contained by some span's bbox. Low count means
      pdfplumber sees text pymupdf missed.
    """
    page_spans = [s for s in spans if s["page"] == page_index and len(s["bbox"]) == 4]
    page_words = [w for w in words if w["page"] == page_index]

    def _iou(a: tuple, b: tuple) -> float:
        ax0, ay0, ax1, ay1 = a
        bx0, by0, bx1, by1 = b
        ix0 = max(ax0, bx0)
        iy0 = max(ay0, by0)
        ix1 = min(ax1, bx1)
        iy1 = min(ay1, by1)
        if ix1 <= ix0 or iy1 <= iy0:
            return 0.0
        inter = (ix1 - ix0) * (iy1 - iy0)
        area_a = max(0.0, (ax1 - ax0) * (ay1 - ay0))
        area_b = max(0.0, (bx1 - bx0) * (by1 - by0))
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    def _span_rect(s: dict) -> tuple[float, float, float, float]:
        x0, y0, x1, y1 = s["bbox"]
        return x0, y0, x1, y1

    def _word_rect(w: dict) -> tuple[float, float, float, float]:
        return w["x0"], w["top"], w["x1"], w["bottom"]

    span_rects = [_span_rect(s) for s in page_spans]
    word_rects = [_word_rect(w) for w in page_words]

    spans_covered = sum(
        1 for sr in span_rects if any(_iou(sr, wr) >= iou_threshold for wr in word_rects)
    )

    def _centre(r: tuple) -> tuple[float, float]:
        return (r[0] + r[2]) / 2.0, (r[1] + r[3]) / 2.0

    def _contains(outer: tuple, point: tuple) -> bool:
        return outer[0] <= point[0] <= outer[2] and outer[1] <= point[1] <= outer[3]

    words_inside_span = sum(
        1 for wr in word_rects if any(_contains(sr, _centre(wr)) for sr in span_rects)
    )

    return {
        "page": page_index,
        "pymupdf_spans": len(span_rects),
        "pdfplumber_words": len(word_rects),
        "pymupdf_spans_covered": spans_covered,
        "pdfplumber_words_inside_a_span": words_inside_span,
        "iou_threshold": iou_threshold,
    }


def run_sample(sample: Path) -> dict:
    if not sample.exists():
        return {"sample": str(sample.name), "status": "missing"}

    t0 = time.perf_counter()
    spans = extract_pymupdf(sample)
    t_mupdf = time.perf_counter() - t0

    t0 = time.perf_counter()
    words = extract_pdfplumber(sample)
    t_plumber = time.perf_counter() - t0

    rerender_pdf = TMP_DIR / f"{sample.stem}_rerender.pdf"
    t0 = time.perf_counter()
    rerender_from_pymupdf(sample, spans, rerender_pdf)
    t_rerender = time.perf_counter() - t0

    t0 = time.perf_counter()
    pages = compare_pages(sample, rerender_pdf, dpi=DEFAULT_DPI)
    t_fid = time.perf_counter() - t0

    in_doc = fitz.open(sample)
    try:
        n_pages = len(in_doc)
    finally:
        in_doc.close()
    per_page_agreement = [bbox_agreement(spans, words, i) for i in range(n_pages)]

    return {
        "sample": sample.name,
        "status": "ok",
        "n_pages": n_pages,
        "pymupdf": {
            "span_count": len(spans),
            "extract_seconds": round(t_mupdf, 3),
        },
        "pdfplumber": {
            "word_count": len(words),
            "extract_seconds": round(t_plumber, 3),
        },
        "rerender_seconds": round(t_rerender, 3),
        "fidelity_seconds": round(t_fid, 3),
        "fidelity": {"dpi": DEFAULT_DPI, **aggregate(pages)},
        "bbox_agreement_per_page": per_page_agreement,
    }


def main() -> int:
    started_at = datetime.now(timezone.utc)
    results = [run_sample(s) for s in SAMPLES]

    # verdict by kill criterion
    ssim_means = [
        r["fidelity"]["aggregates"]["ssim_mean"]
        for r in results
        if r.get("status") == "ok"
        and r.get("fidelity", {}).get("aggregates", {}).get("ssim_mean") is not None
    ]
    kill = all(m is not None and m < 0.90 for m in ssim_means) and len(ssim_means) > 0

    env = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "pymupdf": fitz.__version__,
        "pdfplumber": pdfplumber.__version__,
        "cold_run": True,
    }
    payload = {
        "experiment": "e1-extract",
        "started_at": started_at.isoformat(),
        "environment": env,
        "samples_root": "datasets/samples",
        "kill_criterion": "ssim_mean < 0.90 on all samples",
        "killed": kill,
        "results": results,
    }

    short_hash = hashlib.sha1(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()[:8]
    date_str = started_at.strftime("%Y-%m-%d")
    out_path = OUT_DIR / f"e1_{date_str}_{short_hash}.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, default=str))
    print(f"wrote {out_path}")
    for r in results:
        if r.get("status") != "ok":
            print(f"  {r['sample']}: {r.get('status')}")
            continue
        agg = r["fidelity"]["aggregates"]
        print(
            f"  {r['sample']}: "
            f"pymupdf_spans={r['pymupdf']['span_count']} "
            f"pdfplumber_words={r['pdfplumber']['word_count']} "
            f"ssim_mean={agg['ssim_mean']:.3f} mae_mean={agg['mae_mean']:.2f}"
        )
    print(f"killed={kill}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
