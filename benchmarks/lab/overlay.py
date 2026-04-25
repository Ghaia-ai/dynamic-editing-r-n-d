"""Overlay editing engine for the dynamic-pdf-editing demo.

Ported from ``npc-pr-agent/src/services/pdf/pdf_editor.py`` with the
search-pattern + bbox-hint flow preserved -- this is the same machinery
that powers the production fill_poster path on pre-curated templates,
re-used here against auto-detected spans on arbitrary uploads.

The npc-pr-agent dependency on ``PDFFieldDefinition`` is dropped; this
module exposes plain-dict inputs and outputs so the FastAPI layer can
serialise them directly.

Public API
----------

* ``extract_editable_spans(pdf_bytes)`` -- returns the list of numeric /
  pattern-matched spans the demo can edit, with bbox, font, colour and
  an ``editable`` flag. Arabic spans are surfaced but flagged
  ``editable=False`` because pymupdf's ``insert_text`` does not shape
  RTL text (see e5 results).
* ``apply_edits(pdf_bytes, edits)`` -- drives the overlay engine for
  each edit and returns the resulting PDF bytes plus a per-edit
  audit log.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

import fitz
import pymupdf

logger = logging.getLogger(__name__)


# Regex that captures the numeric spans we know we can edit safely:
# digits with optional thousands separators, optional decimals, optional
# trailing %. Reasonable filter to skip ids / prose digits.
NUMERIC_PATTERN = re.compile(r"^-?\d{1,3}(?:[,.٬]\d{3})*(?:[.٫]\d+)?%?$|^-?\d+(?:[.٫]\d+)?%?$")

# Arabic Unicode ranges. Used only to flag spans as RTL / unsupported.
_ARABIC_RANGES = (
    (0x0600, 0x06FF),
    (0x0750, 0x077F),
    (0x08A0, 0x08FF),
    (0xFB50, 0xFDFF),
    (0xFE70, 0xFEFF),
)


def _is_arabic(text: str) -> bool:
    return any(
        any(lo <= ord(c) <= hi for lo, hi in _ARABIC_RANGES)
        for c in text
    )


def _color_int_to_tuple_01(c: int | None) -> tuple[float, float, float]:
    """pymupdf span['color'] is a packed int RGB. Convert to 0-1 floats."""
    if c is None:
        return (0.0, 0.0, 0.0)
    r = (c >> 16) & 0xFF
    g = (c >> 8) & 0xFF
    b = c & 0xFF
    return (r / 255.0, g / 255.0, b / 255.0)


@dataclass
class EditableSpan:
    page: int
    bbox: tuple[float, float, float, float]
    text: str
    font: str
    fontsize: float
    color: tuple[float, float, float]
    is_arabic: bool
    editable: bool
    kind: str  # "numeric" | "percent" | "arabic-text" | "other"


@dataclass
class EditRequest:
    page: int
    bbox: tuple[float, float, float, float]
    original_text: str
    new_text: str


@dataclass
class EditResult:
    page: int
    original_text: str
    new_text: str
    replacements: int
    ok: bool
    error: str | None = None
    trace: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def extract_editable_spans(pdf_bytes: bytes) -> list[EditableSpan]:
    """Walk every page and return the spans we offer for editing.

    Includes arabic spans for visibility but flags them ``editable=False``
    so the UI can show them disabled rather than silently dropping them.
    """
    out: list[EditableSpan] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_dict: dict[str, Any] = page.get_text("dict")  # pyright: ignore[reportAssignmentType]
            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = (span.get("text") or "").strip()
                        if not text:
                            continue
                        bbox = tuple(span["bbox"])
                        font = span.get("font", "")
                        size = float(span.get("size", 0.0))
                        color = _color_int_to_tuple_01(span.get("color"))
                        is_arabic = _is_arabic(text)

                        if NUMERIC_PATTERN.match(text):
                            kind = "percent" if text.endswith("%") else "numeric"
                            editable = True
                        elif is_arabic:
                            # arabic editable via insert_htmlbox path (Lusail
                            # embedded font registered via pymupdf.Archive +
                            # contextual shaping handled by HarfBuzz inside
                            # pymupdf). Latin path doesn't apply.
                            kind = "arabic-text"
                            editable = True
                        else:
                            # skip pure prose so the table stays usable
                            continue

                        out.append(
                            EditableSpan(
                                page=page_idx,
                                bbox=bbox,  # type: ignore[arg-type]
                                text=text,
                                font=font,
                                fontsize=size,
                                color=color,
                                is_arabic=is_arabic,
                                editable=editable,
                                kind=kind,
                            )
                        )
    finally:
        doc.close()
    return out


# ---------------------------------------------------------------------------
# PDFEditor (ported from npc-pr-agent/src/services/pdf/pdf_editor.py)
# ---------------------------------------------------------------------------


class PDFEditor:
    """Surgically replaces text values in a positioned-layout PDF.

    Per-span font + colour detection, descender/ascender-trimmed cover
    rect, and luminance + text-colour-aware background sampling come
    from the production engine. Inputs are simplified: drive by
    (page, bbox, original_text, new_text) tuples.
    """

    def __init__(self) -> None:
        self.doc: fitz.Document | None = None
        self.change_log: list[dict] = []
        self._font_buffers: dict[str, bytes] = {}
        self._fitz_fonts: dict[str, fitz.Font] = {}
        self._registered_fonts: set[tuple[int, str]] = set()
        # Arabic path uses pymupdf.Archive so insert_htmlbox can resolve
        # @font-face urls. Built lazily; one archive per editor.
        self._arabic_archive: pymupdf.Archive | None = None
        self._arabic_css: str | None = None

    @classmethod
    def from_bytes(cls, pdf_bytes: bytes) -> "PDFEditor":
        instance = cls()
        instance.doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        return instance

    def to_bytes(self) -> bytes:
        assert self.doc is not None
        return self.doc.tobytes()

    def close(self) -> None:
        if self.doc is not None:
            self.doc.close()
            self.doc = None

    # ------------------------------------------------------------------
    # Font extraction & reuse
    # ------------------------------------------------------------------

    def _extract_fonts(self) -> None:
        if self._font_buffers or self.doc is None:
            return
        page = self.doc[0]
        for entry in page.get_fonts(full=True):
            xref = entry[0]
            basefont = entry[3]
            clean_name = basefont.split("+", 1)[-1] if "+" in basefont else basefont
            try:
                _name2, _ext2, _tp2, buf = self.doc.extract_font(xref)
                if buf:
                    self._font_buffers[clean_name] = buf
            except Exception:
                pass

    def _get_fitz_font(self, font_name: str | None) -> fitz.Font | None:
        if font_name is None:
            return None
        if font_name in self._fitz_fonts:
            return self._fitz_fonts[font_name]
        buf = self._font_buffers.get(font_name)
        if buf is None:
            return None
        try:
            f = fitz.Font(fontbuffer=buf)
            self._fitz_fonts[font_name] = f
            return f
        except Exception:
            return None

    def _register_font_on_page(self, page, page_idx: int, alias: str, font_name: str) -> bool:
        key = (page_idx, alias)
        if key in self._registered_fonts:
            return True
        buf = self._font_buffers.get(font_name)
        if buf is None:
            return False
        try:
            page.insert_font(fontname=alias, fontbuffer=buf)
            self._registered_fonts.add(key)
            return True
        except Exception:
            return False

    def _get_arabic_archive(self) -> tuple[pymupdf.Archive, str]:
        """Build (once) a pymupdf Archive over every embedded font + the
        matching @font-face CSS. insert_htmlbox uses the archive to resolve
        url() refs and HarfBuzz shapes the arabic glyphs internally.
        """
        if self._arabic_archive is not None and self._arabic_css is not None:
            return self._arabic_archive, self._arabic_css
        self._extract_fonts()
        arch = pymupdf.Archive()
        css_parts: list[str] = [
            "* { margin: 0; padding: 0; }",
            ".cell { white-space: nowrap; overflow: visible; line-height: 1; }",
        ]
        for name, buf in self._font_buffers.items():
            file_alias = f"{name.replace(' ', '_')}.ttf"
            arch.add(buf, file_alias)
            family = name.split("-")[0]  # "Lusail-Bold" -> "Lusail"
            weight = "700" if "Bold" in name or name.endswith("-Bd") else (
                "300" if "Light" in name else "400"
            )
            css_parts.append(
                f'@font-face {{ font-family: "{family}"; font-weight: {weight}; '
                f'src: url("{file_alias}"); }}'
            )
        css = "\n".join(css_parts)
        self._arabic_archive = arch
        self._arabic_css = css
        return arch, css

    def _replace_arabic(
        self,
        edit: "EditRequest",
        page,
        page_idx: int,
        inst: fitz.Rect,
        all_spans: list[dict],
    ) -> "EditResult":
        """Arabic path: cover + insert_htmlbox + Lusail font Archive.

        insert_text doesn't shape OpenType arabic and the embedded subset
        doesn't carry presentation-form codepoints, so feeding pre-shaped
        text fails the cmap. insert_htmlbox routes through pymupdf's
        internal HarfBuzz which does proper contextual shaping.
        """
        # Pull style off the matching span (font family + size + colour).
        original_fontsize: float | None = None
        original_font_name: str | None = None
        detected_text_color: tuple[int, int, int] | None = None
        detected_text_color_01: tuple[float, float, float] = (0.0, 0.0, 0.0)

        def _span_priority(s: dict) -> tuple:
            txt = s.get("text", "").strip()
            contains_target = edit.original_text in txt or txt in edit.original_text
            sb = fitz.Rect(s["bbox"])
            overlap_top = max(sb.y0, inst.y0)
            overlap_bot = min(sb.y1, inst.y1)
            v_overlap = max(0, overlap_bot - overlap_top)
            return (not contains_target, -v_overlap)

        sorted_spans = sorted(all_spans, key=_span_priority)
        if sorted_spans:
            best = sorted_spans[0]
            original_fontsize = best.get("size")
            raw_font = best.get("font", "")
            clean = raw_font.split("+", 1)[-1] if "+" in raw_font else raw_font
            if clean in self._font_buffers:
                original_font_name = clean
            cint = best.get("color", 0)
            if isinstance(cint, int):
                detected_text_color = (
                    (cint >> 16) & 0xFF,
                    (cint >> 8) & 0xFF,
                    cint & 0xFF,
                )
                detected_text_color_01 = _color_int_to_tuple_01(cint)

        bg_color = self._get_background_color_at(page, inst, text_color=detected_text_color)

        # Cover with sampled background colour. Arabic glyphs can extend
        # slightly outside the logical span bbox (connecting strokes,
        # marks); pad the cover by ~25% of the bbox height to be safe.
        h = inst.y1 - inst.y0
        cover_pad = h * 0.25
        cover_rect = fitz.Rect(
            inst.x0 - cover_pad,
            inst.y0 - cover_pad,
            inst.x1 + cover_pad,
            inst.y1 + cover_pad,
        )
        page.draw_rect(cover_rect, color=None, fill=bg_color, width=0)

        # Build / reuse the arabic archive.
        archive, css = self._get_arabic_archive()
        family = (
            original_font_name.split("-")[0] if original_font_name else "Lusail"
        )
        weight = "700"
        if original_font_name:
            if "Light" in original_font_name:
                weight = "300"
            elif "Bold" in original_font_name or original_font_name.endswith("-Bd"):
                weight = "700"
            else:
                weight = "400"
        fontsize = original_fontsize or max((inst.y1 - inst.y0) * 0.85, 6)

        r, g, b = (round(c * 255) for c in detected_text_color_01)
        html = (
            f'<div class="cell" style="text-align: right; direction: rtl; '
            f'font-family: \'{family}\'; font-weight: {weight}; '
            f'font-size: {fontsize}pt; color: rgb({r},{g},{b});">'
            f"{edit.new_text}</div>"
        )

        # Use the original bbox; nowrap CSS lets text overflow rather than
        # wrap, so single-word replacements stay on one line.
        rc = page.insert_htmlbox(inst, html, css=css, archive=archive)

        trace = {
            "path": "arabic-htmlbox",
            "inst_bbox": [inst.x0, inst.y0, inst.x1, inst.y1],
            "bg_color_01": list(bg_color),
            "text_color_01": list(detected_text_color_01),
            "fontsize": fontsize,
            "font_family": family,
            "font_weight": weight,
            "embedded_font_used": original_font_name,
            "insert_htmlbox_rc": list(rc) if rc else None,
        }
        self.change_log.append(
            {
                "page": page_idx + 1,
                "old": edit.original_text,
                "new": edit.new_text,
                "location": f"({inst.x0:.0f}, {inst.y0:.0f})",
            }
        )
        return EditResult(
            page=page_idx,
            original_text=edit.original_text,
            new_text=edit.new_text,
            replacements=1,
            ok=True,
            trace=trace,
        )

    # ------------------------------------------------------------------
    # Background sampling (luminance + text-colour aware border strip)
    # ------------------------------------------------------------------

    @staticmethod
    def _get_background_color_at(
        page,
        rect,
        text_color: tuple[int, int, int] | None = None,
    ) -> tuple[float, float, float]:
        pad = 6
        strip = 4
        outer = fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad)
        scale = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=scale, clip=outer)

        w, h, n, stride = pix.width, pix.height, pix.n, pix.stride
        raw = pix.samples
        color_dist_threshold = 60

        colors: list[tuple[int, int, int]] = []
        for y in range(h):
            for x in range(w):
                if strip <= x < (w - strip) and strip <= y < (h - strip):
                    continue
                idx = y * stride + x * n
                if idx + 2 >= len(raw):
                    continue
                r, g, b = raw[idx], raw[idx + 1], raw[idx + 2]
                luminance = 0.299 * r + 0.587 * g + 0.114 * b
                if luminance < 80:
                    continue
                if text_color is not None:
                    dist = (
                        (r - text_color[0]) ** 2
                        + (g - text_color[1]) ** 2
                        + (b - text_color[2]) ** 2
                    ) ** 0.5
                    if dist < color_dist_threshold:
                        continue
                colors.append((r, g, b))
        if not colors:
            return (1.0, 1.0, 1.0)
        dominant = Counter(colors).most_common(1)[0][0]
        return (dominant[0] / 255.0, dominant[1] / 255.0, dominant[2] / 255.0)

    # ------------------------------------------------------------------
    # Core replacement (driven by (page, bbox, original_text, new_text))
    # ------------------------------------------------------------------

    def replace_at(self, edit: EditRequest) -> EditResult:
        assert self.doc is not None
        self._extract_fonts()

        page_idx = edit.page
        if page_idx < 0 or page_idx >= len(self.doc):
            return EditResult(
                page=page_idx,
                original_text=edit.original_text,
                new_text=edit.new_text,
                replacements=0,
                ok=False,
                error=f"page {page_idx} out of range",
            )

        page = self.doc[page_idx]
        is_arabic = _is_arabic(edit.original_text) or _is_arabic(edit.new_text)

        # Arabic edits get their own primitive (insert_htmlbox + HarfBuzz)
        # because insert_text doesn't do OpenType shaping. Drive the arabic
        # path off edit.bbox directly: search_for on arabic returns a hit
        # rect for the visual-order glyph run that often doesn't align with
        # the get_text("dict") span rect we extracted from. Using the span
        # bbox keeps cover + insert in sync.
        if is_arabic:
            inst = fitz.Rect(edit.bbox)
            text_dict: dict[str, Any] = page.get_text("dict", clip=inst)  # pyright: ignore[reportAssignmentType]
            all_spans: list[dict] = []
            for block in text_dict.get("blocks", []):
                if block.get("type") == 0:
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            if span.get("text", "").strip():
                                all_spans.append(span)
            return self._replace_arabic(edit, page, page_idx, inst, all_spans)

        instances = page.search_for(edit.original_text)

        # Pick the instance closest to the supplied bbox -- guards against
        # false hits when the same string repeats on the page.
        if not instances:
            return EditResult(
                page=page_idx,
                original_text=edit.original_text,
                new_text=edit.new_text,
                replacements=0,
                ok=False,
                error="search_for returned no instances",
            )

        hint = fitz.Rect(edit.bbox)

        def _center_distance(rect: fitz.Rect) -> float:
            cx = (rect.x0 + rect.x1) / 2.0
            cy = (rect.y0 + rect.y1) / 2.0
            hx = (hint.x0 + hint.x1) / 2.0
            hy = (hint.y0 + hint.y1) / 2.0
            return ((cx - hx) ** 2 + (cy - hy) ** 2) ** 0.5

        inst = min(instances, key=_center_distance)

        # --- per-span font / colour detection ------------------------------
        text_dict = page.get_text("dict", clip=inst)
        all_spans = []
        for block in text_dict.get("blocks", []):
            if block.get("type") == 0:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if span.get("text", "").strip():
                            all_spans.append(span)

        original_fontsize: float | None = None
        original_font_name: str | None = None
        detected_text_color: tuple[int, int, int] | None = None
        detected_text_color_01: tuple[float, float, float] = (0.0, 0.0, 0.0)

        def _span_priority(s: dict) -> tuple:
            txt = s.get("text", "").strip()
            contains_target = edit.original_text in txt or txt in edit.original_text
            sb = fitz.Rect(s["bbox"])
            overlap_top = max(sb.y0, inst.y0)
            overlap_bot = min(sb.y1, inst.y1)
            v_overlap = max(0, overlap_bot - overlap_top)
            return (not contains_target, -v_overlap)

        all_spans.sort(key=_span_priority)
        if all_spans:
            best = all_spans[0]
            original_fontsize = best.get("size")
            raw_font = best.get("font", "")
            clean = raw_font.split("+", 1)[-1] if "+" in raw_font else raw_font
            if clean in self._font_buffers:
                original_font_name = clean
            cint = best.get("color", 0)
            if isinstance(cint, int):
                detected_text_color = (
                    (cint >> 16) & 0xFF,
                    (cint >> 8) & 0xFF,
                    cint & 0xFF,
                )
                detected_text_color_01 = _color_int_to_tuple_01(cint)

        # --- background sample ---------------------------------------------
        bg_color = self._get_background_color_at(page, inst, text_color=detected_text_color)

        # --- cover rect with descender / ascender trim ---------------------
        detected_height = inst.y1 - inst.y0
        if original_fontsize:
            fontsize = original_fontsize
        else:
            fontsize = max(detected_height * 0.85, 6)
        ascent_trim = detected_height * 0.10
        descent_trim = detected_height * 0.20
        cover_rect = fitz.Rect(
            inst.x0,
            inst.y0 + ascent_trim,
            inst.x1,
            inst.y1 - descent_trim,
        )
        page.draw_rect(cover_rect, color=None, fill=bg_color, width=0)

        # --- font registration ---------------------------------------------
        # Built-in helv as a fallback if the embedded font wasn't extractable.
        use_font_alias = "helv"
        if original_font_name is not None:
            alias = original_font_name.replace("-", "")[:10]
            if self._register_font_on_page(page, page_idx, alias, original_font_name):
                use_font_alias = alias

        # --- centre new text horizontally in cover rect --------------------
        fitz_font = self._get_fitz_font(original_font_name)
        if fitz_font is not None:
            new_text_width = fitz_font.text_length(edit.new_text, fontsize=fontsize)
        else:
            new_text_width = len(edit.new_text) * fontsize * 0.6
        cover_width = cover_rect.x1 - cover_rect.x0
        x_offset = (cover_width - new_text_width) / 2.0
        insert_x = cover_rect.x0 + max(x_offset, 0)
        baseline_y = inst.y0 + detected_height * 0.78

        page.insert_text(
            fitz.Point(insert_x, baseline_y),
            edit.new_text,
            fontsize=fontsize,
            fontname=use_font_alias,
            color=detected_text_color_01,
        )

        trace = {
            "inst_bbox": [inst.x0, inst.y0, inst.x1, inst.y1],
            "cover_rect": [cover_rect.x0, cover_rect.y0, cover_rect.x1, cover_rect.y1],
            "bg_color_01": list(bg_color),
            "text_color_01": list(detected_text_color_01),
            "fontsize": fontsize,
            "font_alias": use_font_alias,
            "embedded_font_used": original_font_name,
            "n_search_instances": len(instances),
        }
        self.change_log.append(
            {
                "page": page_idx + 1,
                "old": edit.original_text,
                "new": edit.new_text,
                "location": f"({inst.x0:.0f}, {inst.y0:.0f})",
            }
        )
        return EditResult(
            page=page_idx,
            original_text=edit.original_text,
            new_text=edit.new_text,
            replacements=1,
            ok=True,
            trace=trace,
        )


# ---------------------------------------------------------------------------
# High-level entry point used by the FastAPI layer
# ---------------------------------------------------------------------------


def apply_edits(pdf_bytes: bytes, edits: list[EditRequest]) -> tuple[bytes, list[EditResult]]:
    editor = PDFEditor.from_bytes(pdf_bytes)
    try:
        results = [editor.replace_at(e) for e in edits]
        return editor.to_bytes(), results
    finally:
        editor.close()
