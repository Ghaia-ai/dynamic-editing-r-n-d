"""
Dynamic PDF Editing Lab -- FastAPI application.

Phase-3 demo of the dynamic-editing R&D. The user picks a sample PDF, the
backend extracts editable numeric spans, the user fills replacement values,
and the backend overlays the edits and returns the result.

Usage (prod-style, single container):
    docker compose up --build

Usage (dev, with hot reload + vite dev server):
    docker compose -f docker-compose.dev.yml up --build

API base: http://localhost:8201/api
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path

import fitz
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from benchmarks.lab.overlay import (
    EditRequest,
    apply_edits,
    extract_editable_spans,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = REPO_ROOT / "datasets" / "samples"
RESULTS_DIR = REPO_ROOT / "benchmarks" / "results"
SESSIONS_DIR = RESULTS_DIR / ".sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
UI_DIST = Path(__file__).parent / "ui" / "dist"
REPORTS_OUT = REPO_ROOT / "reports" / "out"


# ---------------------------------------------------------------------------
# Static research metadata (reflects research/wiki/ + the typst report)
# ---------------------------------------------------------------------------

APPROACHES = [
    {
        "id": "A",
        "name": "Extract → auto-PDFFieldDefinition → existing editor",
        "status": "killed",
        "verdict": "E1: extractors fragmented spans on Illustrator-exported PDFs; round-trip SSIM < 0.9. Useful as a detector for the overlay path, not a standalone solver.",
    },
    {
        "id": "B",
        "name": "PDF → HTML → PDF roundtrip",
        "status": "not-started",
        "verdict": "Only required if Approach C fails on real-world uploads. Open as escape hatch.",
    },
    {
        "id": "C",
        "name": "Overlay — detect span, cover, redraw at same bbox in same font",
        "status": "chosen",
        "verdict": "Both Latin and Arabic working in the lab on both samples. Masked SSIM > 0.9998 on non-edited regions. Industry survey confirms this is the same primitive Apryse and Adobe use under the hood.",
    },
    {
        "id": "D",
        "name": "Layout-AI (Vision LLMs) as a detector",
        "status": "not-started",
        "verdict": "Useful as a primitive for fields the cheap regex extractor misses (free-form labels, photographic backgrounds).",
    },
    {
        "id": "E",
        "name": "Localized diffusion glyph inpainting (AnyText2 / TextDoctor)",
        "status": "not-started",
        "verdict": "Surfaced by industry survey. Only genuinely novel candidate beyond A-D. Addresses C's failure modes: gradients, fragmented Tj runs, heavily-subsetted fonts. Open as e8 spike (~2 days). Open weights, GPU inference, font-conditioned, multilingual incl. Arabic.",
    },
    {
        "id": "F",
        "name": "Commercial WYSIWYG SDKs as baseline (Apryse / Nutrient / Foxit)",
        "status": "baseline-to-beat",
        "verdict": "Not novel — same primitive as C, productized. Worth a 1-day Apryse WebViewer eyeball comparison on the two sample posters; not worth the ~$15-50k/yr license without measured win. Nutrient is LTR-only, dead for Arabic scope.",
    },
]


# Industry approaches that the survey confirmed are dead-on-arrival or
# variants of A-D. Surfaced in the UI so reviewers see we evaluated them
# rather than missed them.
RULED_OUT = [
    {
        "name": "Direct content-stream Tj/TJ rewrite (Foxit, iText, pikepdf)",
        "why": "Same primitive as C minus the redact step. Breaks on subset embeds, fragmented spans, and Arabic shaping. Foxit's own docs warn the renderer breaks if new chars aren't in the embedded CIDFont.",
    },
    {
        "name": "PDF → SVG → DOM-edit → PDF",
        "why": "Inkscape forums + Wikipedia Graphics Lab confirm ligatures break and fonts substitute even when embedded. Arabic ligatures are guaranteed to fail. Strict subset of B with worse fidelity.",
    },
    {
        "name": "PDF → Markdown (Marker / Nougat) → render",
        "why": "Re-rendered Markdown does not look like the original poster. Extraction-accurate, not visually faithful. Variant of B.",
    },
    {
        "name": "ABBYY FineReader reconstructive edit",
        "why": "Full document reconstruction via OCR + layout. Output is no longer the input PDF — it's a regenerated lookalike. Destructive same as B.",
    },
    {
        "name": "AcroForm / XFA fast-path",
        "why": "Illustrator and Canva exports are flat — no /AcroForm, no /StructTreeRoot. Confirmed dead for our input distribution. (Cheap precondition check still worth adding for tagged-PDF future inputs.)",
    },
    {
        "name": "Closed-API multimodal image edit (gpt-image-1.5, Gemini)",
        "why": "Same shape as E but closed-weights, no font conditioning, and known regressions (OpenAI community thread: masked-inpaint replaces the entire image). Strictly weaker than E.",
    },
    {
        "name": "Canva / Figma 'import PDF as editable layers' plugins",
        "why": "Black-box services, no automation SLA. Useful only as a manual-fallback if workflow ever pivots to user-edits-in-Figma. Skip for backend.",
    },
]


EXPERIMENTS = [
    {
        "id": "e1",
        "name": "Extract-to-structure: pdfplumber + pymupdf round-trip render",
        "outcome": "killed",
        "takeaway": "Both extractors below 0.9 SSIM on Illustrator exports. Approach A dies as a standalone path.",
        "results_glob": "e1_*.json",
    },
    {
        "id": "e2",
        "name": "Overlay editing — bare bbox-anchored redact + insert",
        "outcome": "retracted",
        "takeaway": "First 'pass' was a harness bug; eyeball check showed Helv fallback, wrong colour, seam, adjacent-label clipping. Triggered the engine port.",
        "results_glob": "e2_*.json",
    },
    {
        "id": "e5",
        "name": "Arabic round-trip via insert_text",
        "outcome": "partial-kill",
        "takeaway": "insert_text doesn't shape OpenType. Glyphs disconnected, wrong order. Showed Approach C needs a different primitive for Arabic.",
        "results_glob": None,
    },
    {
        "id": "e6",
        "name": "Lab: ported PDFEditor engine + UI on Latin",
        "outcome": "passed",
        "takeaway": "Per-span font/colour, ascender/descender-trimmed cover, luminance + text-colour-aware bg sample. Latin gate-1 SSIM 0.99997 (qms) / 0.99986 (water).",
        "results_glob": "e6_*.json",
    },
    {
        "id": "e7",
        "name": "Arabic via insert_htmlbox + pymupdf.Archive",
        "outcome": "passed",
        "takeaway": "HarfBuzz-shaped Arabic at the same bbox in the embedded Lusail font. search_for-vs-span-bbox bug fixed by driving the Arabic path off the extracted span bbox directly.",
        "results_glob": None,
    },
]


OPEN_QUESTIONS = [
    {
        "title": "Editability gate",
        "body": "The lab surfaces every numeric and Arabic span (140 + 104 on the QMS poster). Production likely wants a 'select which fields are editable' or 'review before edit' gate to keep the operator's table small.",
    },
    {
        "title": "Photographic backgrounds",
        "body": "Cover-rect sampler is luminance + text-colour aware on solid panels and accent-coloured pills. Untested on photographic / gradient backgrounds. Have a fallback in mind: tight bbox-shaped patch via neighbour-pixel inpainting rather than the dominant-colour fill.",
    },
    {
        "title": "Glyph-coverage preflight",
        "body": "Subsetted fonts only carry glyphs the original document used. Latin path silently substitutes; Arabic path falls back to pymupdf default on missing glyphs. Production needs a preflight that flags unsupported new values before applying.",
    },
]

app = FastAPI(title="Dynamic Editing Lab", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SpanOut(BaseModel):
    id: str
    page: int
    bbox: tuple[float, float, float, float]
    text: str
    font: str
    fontsize: float
    color: tuple[float, float, float]
    is_arabic: bool
    editable: bool
    kind: str


class DetectRequest(BaseModel):
    sample: str = Field(..., description="filename under datasets/samples/")


class DetectResponse(BaseModel):
    sample: str
    page_count: int
    page_sizes: list[tuple[float, float]]
    spans: list[SpanOut]


class EditIn(BaseModel):
    page: int
    bbox: tuple[float, float, float, float]
    original_text: str
    new_text: str


class ApplyRequest(BaseModel):
    sample: str
    edits: list[EditIn]


class ApplyResultOut(BaseModel):
    page: int
    original_text: str
    new_text: str
    ok: bool
    replacements: int
    error: str | None = None
    trace: dict | None = None


class ApplyResponse(BaseModel):
    session_id: str
    results: list[ApplyResultOut]
    page_count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_sample(name: str) -> Path:
    """Reject paths that traverse outside SAMPLES_DIR."""
    candidate = (SAMPLES_DIR / name).resolve()
    if not candidate.is_file() or SAMPLES_DIR.resolve() not in candidate.parents:
        raise HTTPException(status_code=404, detail=f"sample {name!r} not found")
    return candidate


def _resolve_session_pdf(session_id: str) -> Path:
    candidate = (SESSIONS_DIR / f"{session_id}.pdf").resolve()
    if not candidate.is_file() or SESSIONS_DIR.resolve() not in candidate.parents:
        raise HTTPException(status_code=404, detail="session not found")
    return candidate


def _render_page_png(pdf_bytes: bytes, page_index: int, dpi: int) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(doc):
            raise HTTPException(status_code=404, detail="page out of range")
        scale = dpi / 72.0
        pix = doc[page_index].get_pixmap(matrix=fitz.Matrix(scale, scale))
        return pix.tobytes("png")
    finally:
        doc.close()


def _render_crop_png(
    pdf_bytes: bytes,
    page_index: int,
    bbox: tuple[float, float, float, float],
    pad: float,
    dpi: int,
) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(doc):
            raise HTTPException(status_code=404, detail="page out of range")
        page = doc[page_index]
        x0, y0, x1, y1 = bbox
        rect = fitz.Rect(x0 - pad, y0 - pad, x1 + pad, y1 + pad)
        rect = rect & page.rect
        scale = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect)
        return pix.tobytes("png")
    finally:
        doc.close()


def _page_sizes(pdf_bytes: bytes) -> list[tuple[float, float]]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return [(p.rect.width, p.rect.height) for p in doc]
    finally:
        doc.close()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return JSONResponse(
        {
            "status": "ok",
            "samples_dir_exists": SAMPLES_DIR.exists(),
            "samples_count": len(list(SAMPLES_DIR.glob("*.pdf"))) if SAMPLES_DIR.exists() else 0,
            "ui_dist_exists": UI_DIST.exists(),
        }
    )


@app.get("/api/samples")
def list_samples():
    if not SAMPLES_DIR.exists():
        return {"samples": []}
    out = []
    for p in sorted(SAMPLES_DIR.glob("*.pdf")):
        try:
            doc = fitz.open(p)
            page_count = len(doc)
            doc.close()
        except Exception:
            page_count = 0
        out.append({"name": p.name, "size_bytes": p.stat().st_size, "page_count": page_count})
    return {"samples": out}


@app.get("/api/samples/{name}/pdf")
def get_sample_pdf(name: str):
    path = _resolve_sample(name)
    return FileResponse(str(path), media_type="application/pdf", filename=path.name)


@app.get("/api/samples/{name}/page/{page}.png")
def render_sample_page(name: str, page: int, dpi: int = 150):
    path = _resolve_sample(name)
    png = _render_page_png(path.read_bytes(), page, dpi)
    return Response(content=png, media_type="image/png")


@app.post("/api/detect", response_model=DetectResponse)
def detect(req: DetectRequest):
    path = _resolve_sample(req.sample)
    pdf_bytes = path.read_bytes()
    spans = extract_editable_spans(pdf_bytes)
    out_spans: list[SpanOut] = []
    for i, s in enumerate(spans):
        out_spans.append(
            SpanOut(
                id=f"s{i}",
                page=s.page,
                bbox=s.bbox,
                text=s.text,
                font=s.font,
                fontsize=s.fontsize,
                color=s.color,
                is_arabic=s.is_arabic,
                editable=s.editable,
                kind=s.kind,
            )
        )
    return DetectResponse(
        sample=req.sample,
        page_count=len(_page_sizes(pdf_bytes)),
        page_sizes=_page_sizes(pdf_bytes),
        spans=out_spans,
    )


@app.post("/api/apply", response_model=ApplyResponse)
def apply(req: ApplyRequest):
    path = _resolve_sample(req.sample)
    pdf_bytes = path.read_bytes()
    edits = [
        EditRequest(
            page=e.page,
            bbox=e.bbox,
            original_text=e.original_text,
            new_text=e.new_text,
        )
        for e in req.edits
    ]
    out_bytes, results = apply_edits(pdf_bytes, edits)

    session_id = uuid.uuid4().hex[:12]
    out_path = SESSIONS_DIR / f"{session_id}.pdf"
    out_path.write_bytes(out_bytes)

    return ApplyResponse(
        session_id=session_id,
        page_count=len(_page_sizes(out_bytes)),
        results=[
            ApplyResultOut(
                page=r.page,
                original_text=r.original_text,
                new_text=r.new_text,
                ok=r.ok,
                replacements=r.replacements,
                error=r.error,
                trace=r.trace if r.trace else None,
            )
            for r in results
        ],
    )


@app.get("/api/sessions/{session_id}/pdf")
def get_session_pdf(session_id: str):
    path = _resolve_session_pdf(session_id)
    return FileResponse(str(path), media_type="application/pdf", filename=f"edited-{session_id}.pdf")


@app.get("/api/sessions/{session_id}/page/{page}.png")
def render_session_page(session_id: str, page: int, dpi: int = 150):
    path = _resolve_session_pdf(session_id)
    png = _render_page_png(path.read_bytes(), page, dpi)
    return Response(content=png, media_type="image/png")


@app.get("/api/samples/{name}/crop/{page}.png")
def render_sample_crop(
    name: str,
    page: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    pad: float = 18.0,
    dpi: int = 300,
):
    path = _resolve_sample(name)
    png = _render_crop_png(path.read_bytes(), page, (x0, y0, x1, y1), pad, dpi)
    return Response(content=png, media_type="image/png")


@app.get("/api/sessions/{session_id}/crop/{page}.png")
def render_session_crop(
    session_id: str,
    page: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    pad: float = 18.0,
    dpi: int = 300,
):
    path = _resolve_session_pdf(session_id)
    png = _render_crop_png(path.read_bytes(), page, (x0, y0, x1, y1), pad, dpi)
    return Response(content=png, media_type="image/png")


@app.get("/api/findings")
def findings():
    """Hand the UI everything it needs to render the Findings tab.

    Static metadata for approaches / experiments / open questions, plus a
    live summary of the most recent e6 results JSON so the SSIM numbers
    in the UI track the latest run.
    """
    # Pull the most recent e6 result for live metrics.
    latest_e6: dict | None = None
    e6_files = sorted(RESULTS_DIR.glob("e6_*.json"), reverse=True)
    if e6_files:
        try:
            with e6_files[0].open() as f:
                e6 = json.load(f)
            metrics: list[dict] = []
            for r in e6.get("results", []):
                masked = r.get("fidelity_masked_edited_only_per_page", [])
                ssims = [p["ssim"] for p in masked if p.get("ssim") is not None]
                metrics.append(
                    {
                        "sample": r["sample"],
                        "edits": r["edit_count"],
                        "edit_seconds": r.get("edit_seconds"),
                        "masked_ssim_mean": (sum(ssims) / len(ssims)) if ssims else None,
                    }
                )
            latest_e6 = {
                "file": e6_files[0].name,
                "started_at": e6.get("started_at"),
                "metrics": metrics,
            }
        except Exception as e:
            logger.warning("failed to parse %s: %s", e6_files[0], e)

    # Surface every results JSON (id parsed from filename).
    results_files = []
    for p in sorted(RESULTS_DIR.glob("*.json")):
        m = re.match(r"^([a-z]\d+)_", p.name)
        results_files.append({"file": p.name, "experiment_id": m.group(1) if m else None})

    report_pdf = REPORTS_OUT / "dynamic-editing-demo-v0.3.pdf"
    if not report_pdf.exists():
        report_pdf = REPORTS_OUT / "dynamic-editing-demo-v0.2.pdf"
    return {
        "approaches": APPROACHES,
        "ruled_out": RULED_OUT,
        "experiments": EXPERIMENTS,
        "open_questions": OPEN_QUESTIONS,
        "latest_e6": latest_e6,
        "results_files": results_files,
        "report": {
            "available": report_pdf.exists(),
            "url": "/api/report.pdf",
            "version": report_pdf.stem.split("-")[-1] if report_pdf.exists() else None,
        },
    }


@app.get("/api/report.pdf")
def serve_report():
    # Prefer the latest version; fall back to v0.2 if v0.3 hasn't been compiled.
    for candidate in ("dynamic-editing-demo-v0.3.pdf", "dynamic-editing-demo-v0.2.pdf"):
        pdf = REPORTS_OUT / candidate
        if pdf.exists():
            return FileResponse(str(pdf), media_type="application/pdf", filename=pdf.name)
    raise HTTPException(
        status_code=404,
        detail="report not compiled. run: docker run --rm -v $PWD:/work --workdir /work ghcr.io/typst/typst:latest compile reports/src/dynamic-editing-demo-v0.3.typ reports/out/dynamic-editing-demo-v0.3.pdf",
    )


# Serve the built UI when present (prod-style container only).
if UI_DIST.exists():
    app.mount("/", StaticFiles(directory=str(UI_DIST), html=True), name="ui")
