"""e6 benchmark runner: per-span overlay engine + fidelity report.

Drives the same overlay engine the lab UI uses, against both samples, with
representative latin edits (numeric, big numeric, percent, header label).
Records masked-edited-only fidelity per edit and combined whole-page
fidelity. Writes a results JSON in benchmarks/results/.

Run inside the docker image:

    docker compose run --rm --no-deps lab python -m benchmarks.lab.run_e6
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz
import numpy as np
import pymupdf

# Allow `import _shared.fidelity` when run as a module.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from _shared.fidelity import DEFAULT_DPI, aggregate, compare_pages  # noqa: E402

from benchmarks.lab.overlay import (  # noqa: E402
    EditRequest,
    apply_edits,
    extract_editable_spans,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = REPO_ROOT / "datasets" / "samples"
RESULTS_DIR = REPO_ROOT / "benchmarks" / "results"
TMP_DIR = RESULTS_DIR / ".e6-tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Edits
# ---------------------------------------------------------------------------

PLAN: dict[str, list[tuple[str, str]]] = {
    "qms_psa_121_feb_2024_poster.pdf": [
        ("135,238", "150,000"),  # large header numeric, orange Lusail-Bold 14pt
        ("359", "999"),  # small numeric, orange Lusail-Bold 14pt
        ("71%", "88%"),  # percent on slate Lusail-Bold 12pt
        ("2,297,236", "2,500,000"),  # 7-digit, page 0 hero number
    ],
    "water_infographics_en_filled.pdf": [
        ("669", "700"),  # cyan Lusail-Bd 28.1pt
        ("145.5", "200.0"),  # decimal, cyan
        ("87.4", "92.0"),  # decimal, cyan
    ],
}


def _build_inverted_mask(
    page_shape: tuple[int, int],
    bboxes_pt: list[tuple[float, float, float, float]],
    page_size_pt: tuple[float, float],
    pad_pt: float = 3.0,
) -> np.ndarray:
    """Boolean mask, True everywhere *except* edit bboxes (padded) at the rendered shape."""
    h, w = page_shape
    pw, ph = page_size_pt
    sx = w / pw
    sy = h / ph
    mask = np.ones((h, w), dtype=bool)
    for x0, y0, x1, y1 in bboxes_pt:
        mx0 = max(0, int((x0 - pad_pt) * sx))
        my0 = max(0, int((y0 - pad_pt) * sy))
        mx1 = min(w, int((x1 + pad_pt) * sx))
        my1 = min(h, int((y1 + pad_pt) * sy))
        mask[my0:my1, mx0:mx1] = False
    return mask


def _render_shape(pdf_path: Path, page_index: int, dpi: int) -> tuple[int, int]:
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        pix = page.get_pixmap(dpi=dpi)
        return pix.height, pix.width
    finally:
        doc.close()


def _page_size_pt(pdf_path: Path, page_index: int) -> tuple[float, float]:
    doc = fitz.open(pdf_path)
    try:
        r = doc[page_index].rect
        return (r.width, r.height)
    finally:
        doc.close()


def _short_hash(payload: str) -> str:
    return hashlib.sha1(payload.encode()).hexdigest()[:8]


def main() -> int:
    started = datetime.now(timezone.utc)
    env = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "pymupdf": pymupdf.__version__,
        "cold_run": True,
    }

    overall: list[dict[str, Any]] = []
    for sample_name, edit_plan in PLAN.items():
        sample_path = SAMPLES_DIR / sample_name
        original_bytes = sample_path.read_bytes()
        spans = extract_editable_spans(original_bytes)

        edits: list[EditRequest] = []
        edits_meta: list[dict[str, Any]] = []
        for old, new in edit_plan:
            match = next((s for s in spans if s.editable and s.text == old), None)
            if match is None:
                edits_meta.append({"original_text": old, "new_text": new, "found": False})
                continue
            edits.append(
                EditRequest(
                    page=match.page,
                    bbox=match.bbox,
                    original_text=match.text,
                    new_text=new,
                )
            )
            edits_meta.append(
                {
                    "original_text": old,
                    "new_text": new,
                    "page": match.page,
                    "bbox": list(match.bbox),
                    "font": match.font,
                    "fontsize": match.fontsize,
                    "color_01": list(match.color),
                    "kind": match.kind,
                    "found": True,
                }
            )

        t0 = time.perf_counter()
        edited_bytes, edit_results = apply_edits(original_bytes, edits)
        edit_seconds = round(time.perf_counter() - t0, 3)

        edited_path = TMP_DIR / f"{sample_path.stem}_edited.pdf"
        edited_path.write_bytes(edited_bytes)

        # Combined whole-doc fidelity.
        t0 = time.perf_counter()
        combined = compare_pages(sample_path, edited_path, dpi=DEFAULT_DPI)
        fid_combined_seconds = round(time.perf_counter() - t0, 3)

        # Masked: per edited page, mask out the edit bboxes + pad, measure only
        # non-edited regions.
        per_page_bboxes: dict[int, list[tuple[float, float, float, float]]] = {}
        for r in edit_results:
            if not r.ok:
                continue
            ib = r.trace.get("inst_bbox")
            if ib:
                per_page_bboxes.setdefault(r.page, []).append(tuple(ib))  # type: ignore[arg-type]

        masked_pages = []
        for page_idx, bboxes in per_page_bboxes.items():
            shape = _render_shape(sample_path, page_idx, DEFAULT_DPI)
            page_pt = _page_size_pt(sample_path, page_idx)
            mask = _build_inverted_mask(shape, bboxes, page_pt, pad_pt=3.0)
            t0 = time.perf_counter()
            page_fids = compare_pages(sample_path, edited_path, dpi=DEFAULT_DPI, mask=mask)
            fid_seconds = round(time.perf_counter() - t0, 3)
            page_only = next((p for p in page_fids if p.page_index == page_idx), None)
            if page_only is None:
                continue
            masked_pages.append(
                {
                    "page_index": page_idx,
                    "fidelity_seconds": fid_seconds,
                    "n_edits_on_page": len(bboxes),
                    **{k: v for k, v in page_only.to_dict().items() if k != "page_index"},
                }
            )

        overall.append(
            {
                "sample": sample_name,
                "edit_count": len(edits),
                "edits": edits_meta,
                "edit_seconds": edit_seconds,
                "edit_results": [
                    {
                        "page": r.page,
                        "original_text": r.original_text,
                        "new_text": r.new_text,
                        "ok": r.ok,
                        "replacements": r.replacements,
                        "error": r.error,
                        "trace": r.trace,
                    }
                    for r in edit_results
                ],
                "fidelity_combined": {
                    "dpi": DEFAULT_DPI,
                    **aggregate(combined),
                    "fidelity_seconds": fid_combined_seconds,
                },
                "fidelity_masked_edited_only_per_page": masked_pages,
            }
        )

    payload = {
        "experiment": "e6-lab",
        "started_at": started.isoformat(),
        "environment": env,
        "samples_root": "datasets/samples",
        "fidelity": "non-edited regions: ssim mean per page after masking edit bboxes (+3pt pad)",
        "results": overall,
    }

    digest = _short_hash(json.dumps(payload, sort_keys=True, default=str))
    out_path = RESULTS_DIR / f"e6_{started.strftime('%Y-%m-%d')}_{digest}.json"
    out_path.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out_path.relative_to(REPO_ROOT)}")

    # Summary line per sample.
    for r in overall:
        masked = r["fidelity_masked_edited_only_per_page"]
        masked_ssim_mean = (
            sum(p["ssim"] for p in masked if p.get("ssim") is not None) / max(1, len(masked))
            if masked
            else None
        )
        all_ok = all(er["ok"] for er in r["edit_results"])
        print(
            f"  {r['sample']}: edits={r['edit_count']} all_ok={all_ok} "
            f"edit_s={r['edit_seconds']} masked_ssim_mean={masked_ssim_mean}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
