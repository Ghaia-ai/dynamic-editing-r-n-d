"""Approach B — PDF → HTML → PDF roundtrip.

Live runner. Two backends, picked at runtime:
  - **pdf2htmlEX** if the binary is present (preferred; preserves visual layout
    via positioned glyph spans and embedded WOFF fonts). AGPL-3.0 — flagged.
  - **pdfminer.six** as a fallback (semantic HTML, lower fidelity but always
    available because it's a Python package).

Returns:
  - the raw HTML (so the user can read it / inspect it)
  - a Playwright re-render of that HTML back to PDF
  - a masked SSIM diff between the original and the re-render (if Playwright
    can be reached; we degrade gracefully if it can't)
"""
from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import fitz


def _have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _convert_pdf2htmlex(pdf_path: Path, out_dir: Path) -> Path | None:
    """Run pdf2htmlEX. Returns the produced HTML path, or None on failure."""
    out_html = out_dir / f"{pdf_path.stem}.html"
    try:
        subprocess.run(
            [
                "pdf2htmlEX",
                "--zoom",
                "1.5",
                "--embed",
                "cfijo",  # embed CSS/font/img/JS/outline so the HTML is self-contained
                "--dest-dir",
                str(out_dir),
                str(pdf_path),
                out_html.name,
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )
        return out_html if out_html.exists() else None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return None


def _convert_pdfminer(pdf_path: Path, out_dir: Path) -> Path:
    """Fallback: pdfminer.six produces a semantic HTML file. Always works."""
    from pdfminer.high_level import extract_text_to_fp
    from pdfminer.layout import LAParams

    out_html = out_dir / f"{pdf_path.stem}.html"
    # pdfminer requires a binary fp when output_type='html' (it writes bytes
    # internally); writing to a buffer and persisting as utf-8 sidesteps the
    # 'Codec must not be specified for a text I/O output' assertion.
    buf = io.BytesIO()
    with pdf_path.open("rb") as fin:
        extract_text_to_fp(
            fin,
            buf,
            output_type="html",
            laparams=LAParams(),
            codec="utf-8",
        )
    out_html.write_bytes(buf.getvalue())
    return out_html


async def _render_html_to_pdf_via_playwright(html_path: Path, out_pdf: Path) -> bool:
    """Use Playwright to re-render the HTML back to PDF. Returns True on success."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return False

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            context = await browser.new_context()
            page = await context.new_page()
            await page.goto(html_path.as_uri(), wait_until="networkidle", timeout=15000)
            await page.pdf(path=str(out_pdf), print_background=True)
            await context.close()
            await browser.close()
        return out_pdf.exists() and out_pdf.stat().st_size > 0
    except Exception:
        return False


def _masked_ssim_pages(orig_pdf: Path, edited_pdf: Path, dpi: int = 100) -> list[float]:
    """Compute per-page full-page SSIM at the given DPI (no edit mask here —
    we want to measure round-trip fidelity globally, not per-edit)."""
    try:
        from skimage.metrics import structural_similarity as ssim
        import numpy as np
        from PIL import Image
    except ImportError:
        return []

    out: list[float] = []
    o = fitz.open(orig_pdf)
    e = fitz.open(edited_pdf)
    try:
        for i in range(min(len(o), len(e))):
            scale = dpi / 72.0
            mat = fitz.Matrix(scale, scale)
            po = o[i].get_pixmap(matrix=mat)
            pe = e[i].get_pixmap(matrix=mat)
            ao = np.frombuffer(po.samples, dtype=np.uint8).reshape(po.height, po.width, po.n)[..., :3]
            ae = np.frombuffer(pe.samples, dtype=np.uint8).reshape(pe.height, pe.width, pe.n)[..., :3]
            # resize edited to match original if dimensions differ (very common after roundtrip)
            if ao.shape != ae.shape:
                ae_pil = Image.fromarray(ae).resize((ao.shape[1], ao.shape[0]))
                ae = np.array(ae_pil)
            try:
                v = ssim(ao, ae, channel_axis=-1, data_range=255)
                out.append(float(v))
            except Exception:
                out.append(0.0)
    finally:
        o.close()
        e.close()
    return out


async def run_b(pdf_path: Path, work_dir: Path) -> dict[str, Any]:
    """Run Approach B end-to-end. Returns a structured dict for the API."""
    work_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    backend = "pdf2htmlEX" if _have("pdf2htmlEX") else "pdfminer.six"
    notes: list[str] = []

    # 1. PDF -> HTML
    if backend == "pdf2htmlEX":
        html_path = _convert_pdf2htmlex(pdf_path, work_dir)
        if html_path is None:
            backend = "pdfminer.six"
            notes.append("pdf2htmlEX call failed; falling back to pdfminer.six.")
            html_path = _convert_pdfminer(pdf_path, work_dir)
    else:
        html_path = _convert_pdfminer(pdf_path, work_dir)
        notes.append(
            "pdf2htmlEX is not installed in this image; using pdfminer.six. "
            "pdf2htmlEX preserves visual layout much better but is AGPL-3.0."
        )

    convert_seconds = round(time.perf_counter() - started, 3)
    html_size_bytes = html_path.stat().st_size if html_path.exists() else 0

    # 2. HTML -> PDF (Playwright re-render)
    out_pdf = work_dir / f"{pdf_path.stem}_roundtrip.pdf"
    rerender_started = time.perf_counter()
    rerendered = await _render_html_to_pdf_via_playwright(html_path, out_pdf)
    rerender_seconds = round(time.perf_counter() - rerender_started, 3)

    if not rerendered:
        notes.append(
            "Playwright re-render unavailable (browser not installed). HTML output is still produced."
        )

    # 3. Fidelity (only if we have both PDFs)
    ssim_per_page: list[float] = []
    ssim_mean: float | None = None
    if rerendered:
        ssim_per_page = _masked_ssim_pages(pdf_path, out_pdf)
        if ssim_per_page:
            ssim_mean = sum(ssim_per_page) / len(ssim_per_page)

    return {
        "backend": backend,
        "html_path": str(html_path) if html_path.exists() else None,
        "html_size_bytes": html_size_bytes,
        "rerendered_pdf_path": str(out_pdf) if rerendered else None,
        "convert_seconds": convert_seconds,
        "rerender_seconds": rerender_seconds,
        "ssim_per_page": ssim_per_page,
        "ssim_mean": ssim_mean,
        "license_note": (
            "pdf2htmlEX is licensed AGPL-3.0. Production use requires legal review; "
            "the lab uses it inside a docker container which is fine for R&D."
            if backend == "pdf2htmlEX"
            else "pdfminer.six is MIT licensed."
        ),
        "notes": notes,
    }
