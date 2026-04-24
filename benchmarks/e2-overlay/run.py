"""E2 runner: overlay editing via bbox-anchored redact + insert.

Implements the same overlay mechanism as `npc-pr-agent/src/services/pdf/pdf_editor.py`,
stripped to a single-edit case, driven by an authoritative bbox instead of
search_pattern. Uses the pdf's own embedded font (no substitution).

Measures masked SSIM on non-edited regions of each page (edit bbox inverted,
slightly padded to avoid compression-aliased pixels at the edit boundary).
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
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "benchmarks"))

from _shared.fidelity import compare_pages, aggregate, DEFAULT_DPI  # noqa: E402

MANIFEST = Path(__file__).parent / "manifest.json"
OUT_DIR = ROOT / "benchmarks" / "results"
TMP_DIR = Path(__file__).parent / ".tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)

# pad the edit bbox by this many pdf points on each side when building the
# mask, so anti-aliased pixels at the edit boundary don't pollute the metric
MASK_PAD_PT = 3.0


def _strip_subset_prefix(name: str) -> str:
    """Strip the 'ABCDEF+' subset prefix pdf authors add to embedded fonts."""
    return name.split("+", 1)[-1] if "+" in name else name


def _extract_fonts(doc: fitz.Document) -> dict[str, bytes]:
    """Walk page 0 fonts, return {clean_font_name: font_buffer_bytes}."""
    buffers: dict[str, bytes] = {}
    if len(doc) == 0:
        return buffers
    page = doc[0]
    for entry in page.get_fonts(full=True):
        xref = entry[0]
        basefont = entry[3]
        clean = _strip_subset_prefix(basefont)
        try:
            _name, _ext, _tp, buf = doc.extract_font(xref)
            if buf:
                buffers[clean] = buf
        except Exception:
            continue
    return buffers


def _sample_bg_colour(page: fitz.Page, bbox: fitz.Rect, dpi: int = 72) -> tuple[float, float, float]:
    """Sample the background colour just outside the top-right corner of bbox.

    Returns normalised RGB in [0, 1]. Falls back to white if sampling fails.
    """
    try:
        # grow a sampling strip above the bbox
        strip = fitz.Rect(
            bbox.x0,
            max(0.0, bbox.y0 - 6.0),
            bbox.x1,
            bbox.y0 - 1.0,
        )
        if strip.is_empty or strip.height <= 0 or strip.width <= 0:
            return (1.0, 1.0, 1.0)
        pix = page.get_pixmap(clip=strip, dpi=dpi)
        if pix.n < 3 or pix.width == 0 or pix.height == 0:
            return (1.0, 1.0, 1.0)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        rgb = arr[..., :3].reshape(-1, 3)
        median = np.median(rgb, axis=0)
        return (float(median[0]) / 255.0, float(median[1]) / 255.0, float(median[2]) / 255.0)
    except Exception:
        return (1.0, 1.0, 1.0)


def apply_overlay(
    input_pdf: Path,
    out_pdf: Path,
    page_index: int,
    bbox: tuple[float, float, float, float],
    new_text: str,
    font_hint: str,
    fontsize: float,
    origin_hint: tuple[float, float] | None = None,
) -> dict:
    """Apply one overlay edit. Returns a trace dict for the results JSON."""
    trace: dict = {
        "page": page_index,
        "bbox": list(bbox),
        "new_text": new_text,
        "font_hint": font_hint,
        "fontsize": fontsize,
        "bg_sample_rgb": None,
        "font_registered": False,
        "insert_ok": False,
        "readback": None,
    }

    doc = fitz.open(input_pdf)
    try:
        fonts = _extract_fonts(doc)
        trace["fonts_available"] = sorted(fonts.keys())

        page = doc[page_index]
        rect = fitz.Rect(*bbox)

        # background sample for the cover rectangle
        bg = _sample_bg_colour(page, rect)
        trace["bg_sample_rgb"] = list(bg)

        # redact (cover + remove) the target region
        page.add_redact_annot(rect, fill=bg)
        # graphics=0 keeps vector art outside the rect untouched
        page.apply_redactions(images=2, graphics=0, text=0)

        # register the pdf's own embedded font on the page if available
        alias = "efont"
        font_buf = fonts.get(font_hint)
        if font_buf is None:
            # try a case-insensitive match as a fallback
            for k, v in fonts.items():
                if k.lower() == font_hint.lower():
                    font_buf = v
                    break
        if font_buf:
            try:
                page.insert_font(fontname=alias, fontbuffer=font_buf)
                trace["font_registered"] = True
            except Exception as e:
                trace["font_register_error"] = str(e)
                alias = "helv"
        else:
            alias = "helv"

        # origin: use caller-provided, else bbox bottom-left minus small
        # descender allowance so the baseline sits correctly in the rect
        if origin_hint is not None:
            ox, oy = origin_hint
        else:
            ox = rect.x0
            # insert_text uses the baseline; place it at ~80% down the bbox
            oy = rect.y0 + 0.8 * rect.height
        try:
            page.insert_text(
                (float(ox), float(oy)),
                new_text,
                fontname=alias,
                fontsize=float(fontsize),
                color=(0, 0, 0),
            )
            trace["insert_ok"] = True
        except Exception as e:
            trace["insert_error"] = str(e)

        doc.save(out_pdf)
    finally:
        doc.close()

    # readback: can we extract the new text inside the edited bbox?
    try:
        doc2 = fitz.open(out_pdf)
        try:
            txt = doc2[page_index].get_text("text", clip=fitz.Rect(*bbox))
            trace["readback"] = txt.strip()
        finally:
            doc2.close()
    except Exception:
        trace["readback"] = None

    return trace


def build_inverted_mask(
    page_shape: tuple[int, int, int],
    bbox_pt: tuple[float, float, float, float],
    page_width_pt: float,
    page_height_pt: float,
    pad_pt: float = MASK_PAD_PT,
) -> np.ndarray:
    """Build a boolean mask True on non-edited pixels, False on the (padded) edit bbox.

    ``page_shape`` is (H, W, C) of the rasterised page at DEFAULT_DPI.
    """
    h, w = page_shape[:2]
    mask = np.ones((h, w), dtype=bool)
    x0, y0, x1, y1 = bbox_pt
    x0 -= pad_pt
    y0 -= pad_pt
    x1 += pad_pt
    y1 += pad_pt
    # pt -> px at DEFAULT_DPI (72 pt per inch); pymupdf top-left origin, same as mask
    px0 = max(0, int(round(x0 / page_width_pt * w)))
    py0 = max(0, int(round(y0 / page_height_pt * h)))
    px1 = min(w, int(round(x1 / page_width_pt * w)))
    py1 = min(h, int(round(y1 / page_height_pt * h)))
    if px1 > px0 and py1 > py0:
        mask[py0:py1, px0:px1] = False
    return mask


def page_size_pt(pdf_path: Path, page_index: int) -> tuple[float, float]:
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        return (page.rect.width, page.rect.height)
    finally:
        doc.close()


def render_shape(pdf_path: Path, page_index: int, dpi: int) -> tuple[int, int, int]:
    doc = fitz.open(pdf_path)
    try:
        pix = doc[page_index].get_pixmap(dpi=dpi)
        return (pix.height, pix.width, max(3, pix.n if pix.n in (3, 4) else 3))
    finally:
        doc.close()


def _edit_slug(edit: dict, edit_index: int) -> str:
    """Unique per-edit slug used for output pdf + crop filenames."""
    stem = Path(edit["sample"]).stem
    return f"{stem}_p{edit['page']}_e{edit_index}"


def _save_edit_crops(
    edit: dict, edit_index: int, out_pdf: Path, crops_dir: Path, pad_pt: float = 24.0, dpi: int = 300
) -> dict:
    """Render high-DPI crops of the edit bbox on both the original and the
    edited PDF and save them side by side under crops_dir. Returns the paths.

    This is the eyeball-evaluation step. SSIM + readback alone missed the
    Arabic glyph-order corruption; visual crops make it undeniable.
    """
    src_path = ROOT / "datasets" / "samples" / edit["sample"]
    slug = _edit_slug(edit, edit_index)
    x0, y0, x1, y1 = edit["bbox"]
    clip = fitz.Rect(x0 - pad_pt, y0 - pad_pt, x1 + pad_pt, y1 + pad_pt)

    paths: dict = {}
    for label, pdf_path in [("orig", src_path), ("edited", out_pdf)]:
        d = fitz.open(pdf_path)
        try:
            pix = d[edit["page"]].get_pixmap(clip=clip, dpi=dpi)
            dest = crops_dir / f"{slug}_{label}.png"
            pix.save(dest)
            paths[label] = str(dest.relative_to(ROOT))
        finally:
            d.close()
    return paths


def run_edit(edit: dict, edit_index: int, crops_dir: Path) -> dict:
    sample_path = ROOT / "datasets" / "samples" / edit["sample"]
    if not sample_path.exists():
        return {"sample": edit["sample"], "status": "missing"}

    slug = _edit_slug(edit, edit_index)
    out_pdf = TMP_DIR / f"{slug}.pdf"

    t0 = time.perf_counter()
    trace = apply_overlay(
        input_pdf=sample_path,
        out_pdf=out_pdf,
        page_index=edit["page"],
        bbox=tuple(edit["bbox"]),
        new_text=edit["new_text"],
        font_hint=edit["font_hint"],
        fontsize=edit["fontsize_hint"],
        origin_hint=(
            tuple(edit["origin_hint"])
            if edit.get("origin_hint")
            else None
        ),
    )
    t_overlay = time.perf_counter() - t0

    # full-page SSIM + MAE across all pages (edited page uses masked SSIM)
    page_width_pt, page_height_pt = page_size_pt(sample_path, edit["page"])
    shape = render_shape(sample_path, edit["page"], DEFAULT_DPI)
    mask = build_inverted_mask(
        shape, tuple(edit["bbox"]), page_width_pt, page_height_pt
    )

    # compare_pages with a mask applies the mask to all pages, which is
    # what we want for the edited page. For non-edited pages we still want
    # unmasked full-page metrics. We therefore run two comparisons and
    # stitch the results.
    t0 = time.perf_counter()
    masked = compare_pages(sample_path, out_pdf, dpi=DEFAULT_DPI, mask=mask)
    unmasked = compare_pages(sample_path, out_pdf, dpi=DEFAULT_DPI)
    t_fid = time.perf_counter() - t0

    # select the edited page's masked result; use unmasked for other pages
    edited_idx = edit["page"]
    combined = []
    for i, page_u in enumerate(unmasked):
        if i == edited_idx and i < len(masked):
            combined.append(masked[i])
        else:
            combined.append(page_u)

    if edited_idx < len(masked):
        masked_only = {"dpi": DEFAULT_DPI, **aggregate([masked[edited_idx]])}
    else:
        masked_only = {"dpi": DEFAULT_DPI}

    # eyeball evaluation: save high-DPI crops of orig + edited at the edit site
    crops = _save_edit_crops(edit, edit_index, out_pdf, crops_dir)

    return {
        "sample": edit["sample"],
        "status": "ok",
        "edit_index": edit_index,
        "edit": edit,
        "trace": trace,
        "output_pdf": str(out_pdf.relative_to(ROOT)),
        "crops": crops,
        "overlay_seconds": round(t_overlay, 3),
        "fidelity_seconds": round(t_fid, 3),
        "fidelity_masked_edited_only": masked_only,
        "fidelity_combined": {"dpi": DEFAULT_DPI, **aggregate(combined)},
        "mask_pad_pt": MASK_PAD_PT,
    }


def main() -> int:
    started_at = datetime.now(timezone.utc)
    manifest = json.loads(MANIFEST.read_text())
    crops_dir = OUT_DIR / "e2-crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    results = [run_edit(e, i, crops_dir) for i, e in enumerate(manifest["edits"])]

    # kill criteria:
    #   (a) masked SSIM on edited page < 0.99 on ALL edits
    #   (b) OR any single edit failed text integrity (readback != new_text)
    # (b) is load-bearing: SSIM can stay high on a glyph-level corruption
    # because the edit is small relative to the masked non-edit region.
    masked_ssims = [
        r["fidelity_masked_edited_only"]["aggregates"]["ssim_mean"]
        for r in results
        if r.get("status") == "ok"
        and r.get("fidelity_masked_edited_only", {}).get("aggregates", {}).get("ssim_mean")
        is not None
    ]
    ssim_kill = (
        all(m is not None and m < 0.99 for m in masked_ssims)
        and len(masked_ssims) > 0
    )

    def _readback_ok(r: dict) -> bool:
        rb = (r.get("trace", {}).get("readback") or "").strip()
        return rb == r.get("edit", {}).get("new_text", "").strip()

    text_integrity = {
        r.get("edit_index"): _readback_ok(r)
        for r in results
        if r.get("status") == "ok"
    }
    any_text_broken = any(not ok for ok in text_integrity.values())

    kill = ssim_kill or any_text_broken

    env = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "pymupdf": fitz.__version__,
        "cold_run": True,
    }
    payload = {
        "experiment": "e2-overlay",
        "started_at": started_at.isoformat(),
        "environment": env,
        "samples_root": "datasets/samples",
        "kill_criterion": (
            "masked_ssim < 0.99 on all edits, "
            "OR any edit fails readback == new_text integrity"
        ),
        "killed": kill,
        "killed_by_ssim": ssim_kill,
        "killed_by_text_integrity": any_text_broken,
        "text_integrity_by_edit_index": text_integrity,
        "results": results,
    }

    short_hash = hashlib.sha1(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()[:8]
    date_str = started_at.strftime("%Y-%m-%d")
    out_path = OUT_DIR / f"e2_{date_str}_{short_hash}.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, default=str))
    print(f"wrote {out_path}")
    for r in results:
        if r.get("status") != "ok":
            print(f"  {r['sample']}: {r.get('status')}")
            continue
        ma = r["fidelity_masked_edited_only"]["aggregates"]
        ca = r["fidelity_combined"]["aggregates"]
        tr = r["trace"]
        e = r["edit"]
        print(
            f"  [{r['edit_index']}] {r['sample']} p{e['page']} "
            f"{e['original_text']!r} -> {e['new_text']!r}: "
            f"masked_ssim={ma.get('ssim_mean'):.4f} masked_mae={ma.get('mae_mean'):.2f} | "
            f"combined_ssim={ca.get('ssim_mean'):.4f} | "
            f"insert_ok={tr['insert_ok']} font_reg={tr['font_registered']} | "
            f"readback={tr.get('readback')!r}"
        )
        for label, path in r["crops"].items():
            print(f"       crop {label}: {path}")
    print(f"killed={kill}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
