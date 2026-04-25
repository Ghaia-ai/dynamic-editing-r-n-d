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
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = REPO_ROOT / "datasets" / "samples"
RESULTS_DIR = REPO_ROOT / "benchmarks" / "results"
UI_DIST = Path(__file__).parent / "ui" / "dist"

app = FastAPI(title="Dynamic Editing Lab", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# Serve the built UI when present (prod-style container only).
if UI_DIST.exists():
    app.mount("/", StaticFiles(directory=str(UI_DIST), html=True), name="ui")
