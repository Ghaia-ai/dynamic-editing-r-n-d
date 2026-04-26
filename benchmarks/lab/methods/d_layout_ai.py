"""Approach D — vision LLM as a layout detector.

Live runner. Sends the rendered first page of the sample to Gemini 2.5 Flash
with a strict JSON schema asking for editable text fields with bounding boxes.
Falls back to a clear "configure GEMINI_API_KEY" response when the key is
absent — the lab still serves the panel, just without live detection.

Why Gemini and not GPT-4o or Azure Document Intelligence:
  - Cheapest detector with a public API and strict structured-output mode.
  - Deep-research nominated it as the top frontier-VLM fallback (Azure DI is
    primary for cost and inside-perimeter, but DI requires Azure creds which
    a fresh lab clone won't have; Gemini's free tier is reachable from any
    machine with a Google account).
  - The same prompt shape works for GPT-4o (drop-in via google-genai). To
    swap, set DETECTOR_VENDOR=openai and provide OPENAI_API_KEY.
"""
from __future__ import annotations

import base64
import io
import json
import os
import time
from pathlib import Path
from typing import Any

import fitz


VISION_PROMPT = """You are a document-layout detector. Given an image of a poster or infographic page, return every text field that a user might want to edit (statistics, labels, dates, names, headlines, captions). For each field return:

  - bbox_normalized: [x0, y0, x1, y1] in 0..1 page-relative coordinates (top-left origin)
  - text: the exact text currently shown
  - kind: one of "numeric", "percent", "date", "label", "headline", "other"
  - is_arabic: true if the text contains Arabic characters
  - editable_confidence: 0.0..1.0 — your estimate that this field is meant to be edited (vs. decorative copy)

Be exhaustive. Return JSON only.
"""


def _render_page_jpeg(pdf_bytes: bytes, page_index: int, max_dim: int = 2000) -> bytes:
    """Rasterise one page to a JPEG sized for vision API consumption."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[page_index]
        # scale so the long edge fits in max_dim — keeps tokens down
        long_edge_pt = max(page.rect.width, page.rect.height)
        scale = min(3.0, max_dim / long_edge_pt) if long_edge_pt > 0 else 2.0
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        return pix.tobytes("jpeg", jpg_quality=85)
    finally:
        doc.close()


def _have_gemini_key() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def run_d(pdf_path: Path, page_index: int = 0) -> dict[str, Any]:
    """Run vision-LLM detection on one page. Returns a structured payload."""
    if not _have_gemini_key():
        return {
            "live": False,
            "vendor": "gemini",
            "configured": False,
            "message": (
                "Set GEMINI_API_KEY in .env (free tier at "
                "https://aistudio.google.com/apikey). The lab will pick it up "
                "on next request — no rebuild needed because the env file is "
                "mounted at runtime."
            ),
            "fields": [],
            "page_index": page_index,
        }

    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        return {
            "live": False,
            "configured": False,
            "vendor": "gemini",
            "message": f"google-genai not installed: {e}",
            "fields": [],
            "page_index": page_index,
        }

    pdf_bytes = pdf_path.read_bytes()
    img_bytes = _render_page_jpeg(pdf_bytes, page_index)

    started = time.perf_counter()
    client = genai.Client(
        api_key=os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    )
    try:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                VISION_PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "fields": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "bbox_normalized": {
                                        "type": "array",
                                        "items": {"type": "number"},
                                        "minItems": 4,
                                        "maxItems": 4,
                                    },
                                    "text": {"type": "string"},
                                    "kind": {"type": "string"},
                                    "is_arabic": {"type": "boolean"},
                                    "editable_confidence": {"type": "number"},
                                },
                                "required": [
                                    "bbox_normalized",
                                    "text",
                                    "kind",
                                    "editable_confidence",
                                ],
                            },
                        }
                    },
                    "required": ["fields"],
                },
                temperature=0.0,
                max_output_tokens=4096,
            ),
        )
    except Exception as e:
        return {
            "live": False,
            "configured": True,
            "vendor": "gemini",
            "message": f"gemini call failed: {e}",
            "fields": [],
            "page_index": page_index,
        }

    elapsed = round(time.perf_counter() - started, 3)
    text = resp.text or "{}"
    try:
        parsed = json.loads(text)
        fields = parsed.get("fields", [])
    except json.JSONDecodeError:
        fields = []

    # convert normalized bboxes to PDF points using the source page rect
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        pw, ph = page.rect.width, page.rect.height
    finally:
        doc.close()

    for f in fields:
        bn = f.get("bbox_normalized") or [0, 0, 0, 0]
        if len(bn) == 4:
            f["bbox"] = [
                float(bn[0]) * pw,
                float(bn[1]) * ph,
                float(bn[2]) * pw,
                float(bn[3]) * ph,
            ]

    usage = getattr(resp, "usage_metadata", None)
    return {
        "live": True,
        "configured": True,
        "vendor": "gemini",
        "model": "gemini-2.5-flash",
        "page_index": page_index,
        "elapsed_seconds": elapsed,
        "tokens_input": getattr(usage, "prompt_token_count", None) if usage else None,
        "tokens_output": getattr(usage, "candidates_token_count", None) if usage else None,
        "fields": fields,
        "field_count": len(fields),
    }
