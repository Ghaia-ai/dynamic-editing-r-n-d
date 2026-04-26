"""Approach E — diffusion glyph inpainting via Replicate.

Live runner when REPLICATE_API_TOKEN is set. Otherwise returns a configure-me
response, same shape as method D.

The model:
  - We use stability-ai/stable-diffusion-inpainting which Replicate hosts on
    GPUs and bills per-prediction. It's not the strongest text-aware model —
    AnyText2 is, but Replicate doesn't host AnyText2 today and self-hosting
    diffusion in our docker image would push it past 5GB.
  - For a serious E spike, swap to AnyText2 on Modal or run locally on a GPU
    workstation. The lab's job is to demonstrate the API shape works.

The flow:
  1. Render the page to PNG.
  2. Build a binary mask covering the edit bbox.
  3. Send (image, mask, prompt="<new value> in the same font as surrounding text")
     to Replicate.
  4. Return the URL of the inpainted image + cost estimate.

What this canNOT do today:
  - Round-trip back to PDF (would need Playwright + a synthetic doc; out of
    scope for the spike).
  - Match the original font perfectly (the model doesn't accept a font ref).
"""
from __future__ import annotations

import io
import os
import time
from pathlib import Path
from typing import Any

import fitz


def _have_replicate_token() -> bool:
    return bool(os.environ.get("REPLICATE_API_TOKEN"))


def _render_page_png(pdf_bytes: bytes, page_index: int, dpi: int = 200) -> tuple[bytes, tuple[int, int], tuple[float, float]]:
    """Rasterise one page. Returns (png_bytes, (width_px, height_px), (width_pt, height_pt))."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[page_index]
        scale = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        return (
            pix.tobytes("png"),
            (pix.width, pix.height),
            (page.rect.width, page.rect.height),
        )
    finally:
        doc.close()


def _make_mask(
    page_size_px: tuple[int, int],
    page_size_pt: tuple[float, float],
    bbox_pt: tuple[float, float, float, float],
    pad_pt: float = 4.0,
) -> bytes:
    """Build a binary PNG mask: white where we want inpainting, black elsewhere."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return b""
    w_px, h_px = page_size_px
    w_pt, h_pt = page_size_pt
    img = Image.new("L", (w_px, h_px), 0)
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = bbox_pt
    sx = w_px / w_pt
    sy = h_px / h_pt
    draw.rectangle(
        [
            int((x0 - pad_pt) * sx),
            int((y0 - pad_pt) * sy),
            int((x1 + pad_pt) * sx),
            int((y1 + pad_pt) * sy),
        ],
        fill=255,
    )
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def run_e(
    pdf_path: Path,
    page_index: int,
    bbox: tuple[float, float, float, float],
    new_text: str,
) -> dict[str, Any]:
    """Run diffusion inpaint for one edit. Returns structured response.

    The response always includes the rendered page + mask images so the user
    can see what the model would receive, even when REPLICATE_API_TOKEN is
    absent. That's the inspectable part — and it's useful on its own.
    """
    pdf_bytes = pdf_path.read_bytes()
    page_png, page_size_px, page_size_pt = _render_page_png(pdf_bytes, page_index)
    mask_png = _make_mask(page_size_px, page_size_pt, bbox)

    # encode for return
    import base64

    page_b64 = base64.b64encode(page_png).decode()
    mask_b64 = base64.b64encode(mask_png).decode() if mask_png else None

    if not _have_replicate_token():
        return {
            "live": False,
            "configured": False,
            "vendor": "replicate",
            "message": (
                "Set REPLICATE_API_TOKEN in .env. Replicate runs the model on "
                "their GPUs and bills per second; one inpaint run is roughly "
                "$0.005-$0.02 depending on size. The lab still shows you the "
                "rendered page and the mask it would have submitted."
            ),
            "page_image_base64": page_b64,
            "mask_image_base64": mask_b64,
            "page_index": page_index,
            "bbox": list(bbox),
            "new_text": new_text,
            "result_image_url": None,
        }

    try:
        import replicate
    except ImportError as e:
        return {
            "live": False,
            "configured": False,
            "vendor": "replicate",
            "message": f"replicate package not installed: {e}",
            "page_image_base64": page_b64,
            "mask_image_base64": mask_b64,
            "page_index": page_index,
            "bbox": list(bbox),
            "new_text": new_text,
            "result_image_url": None,
        }

    started = time.perf_counter()
    try:
        # stable-diffusion-inpainting on replicate
        # Schema: image, mask, prompt
        prompt = f"the text \"{new_text}\" in the same font, color, and size as the surrounding text"
        output = replicate.run(
            "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3",
            input={
                "image": io.BytesIO(page_png),
                "mask": io.BytesIO(mask_png),
                "prompt": prompt,
                "num_inference_steps": 25,
                "guidance_scale": 7.5,
                "negative_prompt": "blurry, low quality, distorted text, gibberish text",
            },
        )
        elapsed = round(time.perf_counter() - started, 3)
        # output is typically a list of urls or a single url
        result_url = (
            output[0] if isinstance(output, list) and output
            else (str(output) if output else None)
        )
        return {
            "live": True,
            "configured": True,
            "vendor": "replicate",
            "model": "stability-ai/stable-diffusion-inpainting",
            "page_index": page_index,
            "bbox": list(bbox),
            "new_text": new_text,
            "elapsed_seconds": elapsed,
            "page_image_base64": page_b64,
            "mask_image_base64": mask_b64,
            "result_image_url": result_url,
            "estimated_cost_usd": 0.012,
        }
    except Exception as e:
        return {
            "live": False,
            "configured": True,
            "vendor": "replicate",
            "message": f"replicate call failed: {e}",
            "page_image_base64": page_b64,
            "mask_image_base64": mask_b64,
            "page_index": page_index,
            "bbox": list(bbox),
            "new_text": new_text,
            "result_image_url": None,
        }
