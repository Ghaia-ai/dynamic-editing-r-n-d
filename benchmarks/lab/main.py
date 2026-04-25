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

import logging
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


# Serve the built UI when present (prod-style container only).
if UI_DIST.exists():
    app.mount("/", StaticFiles(directory=str(UI_DIST), html=True), name="ui")
