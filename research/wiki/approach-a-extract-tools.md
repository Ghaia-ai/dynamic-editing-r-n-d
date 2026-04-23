# approach a — layout-aware extract tools

> status: draft
> owner: elaa
> contract to satisfy: `./integration-surface.md` -- produce `list[PDFFieldDefinition]` equivalents from an arbitrary pdf. per-field: field_key, label, current_value, search_pattern, page, bbox, optionally color/fontsize_factor/format_hint.
> consumed by: `./approach-matrix.md`

## what "extract" means here

input: raw pdf bytes. output: a structured list of text boxes with coordinates, fonts, colors. **no rendering**, no html -- just a data extraction pass that downstream code can turn into either `PDFFieldDefinition` records (feeds the existing pdf editor) or into overlay anchors (feeds approach c).

## the candidates

### 1. pymupdf (fitz) -- `/websites/pymupdf_readthedocs_io_en`

**what it returns.** `page.get_text("dict")` produces a nested structure: `page -> blocks -> lines -> spans`. each span carries:

```json
{
  "size": 11.0,
  "flags": 0,
  "font": "Helvetica",
  "color": 0,
  "origin": [50.0, 100.0],
  "text": "Some text on first page.",
  "bbox": [50.0, 88.17, 166.17, 103.28]
}
```

every field we need for `PDFFieldDefinition` is here: `text` -> `current_value`/`search_pattern`, `bbox` -> `bbox`, `font` -> font name (useful for approach c replacement), `size` -> `fontsize_factor` hint, `color` -> `color`. the `origin` (first-character baseline) is not in our schema today but is useful for insert-text operations.

**coordinate system.** top-left origin, pdf points. consistent across pymupdf's whole api. matches `PDFFieldDefinition.bbox` convention (we should confirm but it looks right given `pdf_editor.py` already uses pymupdf internally).

**rtl / arabic.** extraction returns the text as stored in the pdf stream. for many arabic pdfs this is visual order, not logical. pymupdf itself does not re-order for bidi; the caller must run arabic reshaping / bidi if logical order is needed for editing. this is a known limitation and a shared risk across all extractors.

**font re-use for downstream writing.** pymupdf already supports extracting embedded fonts and re-registering them on a page (`page.insert_font`). the existing `npc-pr-agent` `pdf_editor.py:_extract_fonts` does exactly this -- meaning **approach a can feed approach c directly**, reusing the font extraction machinery that already works.

**strengths.**
- fastest pure-python extractor we'll test; no ml models, no jvm, no external services.
- the `dict` / `rawdict` output is stable and well-documented.
- mit-compatible license (afpl/commercial pair; we already depend on it in npc-pr-agent).
- first-class bbox + font name per span.

**weaknesses.**
- no semantic structure inference. the "block" grouping is geometric, not logical -- so it won't tell us "this span is a label and this span is its value." that pairing has to come from heuristics (proximity, font-size contrast) or from approach d.
- on illustrator/canva exports, logical words are frequently split across multiple spans (each glyph-positioning operator can start a new span). our code must re-join them.
- outlined text (text converted to vector paths, common for stylised headlines) is not returned -- it's not text anymore. extraction silently misses it.

**cost.** free. already a dependency.

**verdict.** baseline. if pymupdf alone is enough, we short-circuit the whole approach-a evaluation.

### 2. pdfplumber -- `/jsvine/pdfplumber`

**what it returns.** `page.extract_words(extra_attrs=["fontname", "size"], return_chars=True)` returns a list of word dicts with `x0/x1/top/bottom`, plus per-char details on request. `page.extract_text_lines(return_chars=True)` gives per-line aggregates.

```python
words = page.extract_words(
    x_tolerance=3,
    y_tolerance=3,
    extra_attrs=["fontname", "size"],
    return_chars=True,
)
```

**coordinate system.** pdfplumber uses top-left origin in its public api (`top` / `bottom` are measured from page top), but the underlying pdf coordinates are bottom-left. conversions are explicit in the docs (`top = page.height - y1`). **this is a common footgun** -- mixing pdfplumber coordinates with pymupdf coordinates in the same codebase silently produces wrong bboxes. our pdf-handling rule in `.claude/rules/pdf-handling.md` already flags this.

**rtl / arabic.** pdfplumber exposes explicit `line_dir` and `char_dir` parameters (`ttb`/`btt`/`ltr`/`rtl`) on `extract_words`. this is better than pymupdf for rtl work **if** the pdf stores arabic in logical order. when glyphs are stored in visual order (common), the flag helps but does not reconstruct logical order by itself.

**strengths.**
- word-level grouping with tolerances is good for poster layouts where whitespace is tight.
- ligature expansion is built in (`expand_ligatures=True`).
- visual debugging support (`page.to_image().debug_tablefinder()`) is useful when diagnosing wrong boxes.
- mit-licensed.

**weaknesses.**
- no semantic structure either.
- slower than pymupdf on the same pdf in informal benchmarks.
- does not return an equivalent of pymupdf's `origin` (first-char baseline), which complicates write-back.
- the word-grouping tolerances are global; posters with mixed font sizes often need per-region tolerances.

**cost.** free.

**verdict.** useful for a second opinion on the same pdf -- comparing pymupdf and pdfplumber outputs cross-validates bbox correctness. probably not our primary.

### 3. docling -- `/docling-project/docling`

**what it returns.** a `DoclingDocument` (pydantic model) with a rich type system: `BoundingBox`, `Size`, `CoordOrigin`, `ImageRef`, plus semantic element types (text, tables, pictures, headings). every item has `prov` (provenance) carrying `page_no` and `bbox`.

**layout understanding.** docling ships ibm's layout analysis model (pre-trained on a large document corpus) and a table-structure model (tableformer). it returns **semantic element types**, not just positioned text runs.

**strengths.**
- closest to "solver" rather than "primitive" in our taxonomy. gives us headings, paragraphs, captions, tables out of the box.
- pipeline-configurable: ocr on/off, accelerator (cpu/cuda/mps), table mode (fast/accurate).
- apache-2.0 licensed.
- emits structured bboxes with explicit `CoordOrigin` so top-left vs bottom-left is self-describing.

**weaknesses.**
- over-specced for poster editing. the semantic types (heading/paragraph/list) are calibrated for reports and books, not posters with large-type standalone values.
- heavy install: pulls torch and ml models. cold-start cost significant.
- on a 2-page poster, the value of tableformer is near zero.
- arabic support depends on the underlying ocr engine (easyocr, rapidocr, tesseract); not all are equal.

**cost.** free (apache-2.0). compute cost: requires gpu or a patient cpu for reasonable latency.

**verdict.** candidate for layout detection in approach d territory, not primary for approach a. keep on the bench.

### 4. unstructured.io -- `/unstructured-io/unstructured`

**what it returns.** a list of `Element` objects (NarrativeText, Title, ListItem, Table, Image, ...). each element has `metadata.coordinates.points` (bbox) and `metadata.coordinates.system`. also offers `infer_table_structure=True` to emit html for tables, and `strategy="hi_res"` which runs yolox layout detection.

**layout understanding.** the `hi_res` strategy uses yolox (same class as layoutlmv3) for block-level detection. the element abstraction collapses per-span detail into paragraphs, however.

**strengths.**
- mature pipeline; good coverage of non-pdf formats if we ever need them.
- apache-2.0 licensed.
- `coordinates.system` is self-describing.

**weaknesses.**
- **the element abstraction is the wrong granularity for our problem.** a poster value like "255,000" embedded inside a `Title` element is not separately addressable. we'd need to drop to the raw per-span layer, but at that point we're using unstructured as a very thin wrapper over pdfminer/pdfplumber.
- `hi_res` pipeline brings detectron2 / yolox dependencies. heavy.
- arabic language support exists via ocr, quality varies.

**cost.** free open-source; paid api + cloud option for scale.

**verdict.** not a fit. the abstraction level doesn't match our per-field editing use case.

### 5. adobe pdf extract api -- https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/

**what it returns.** json with structured elements (paragraphs, tables, headings) + bbox + font info + optional rendition assets (images, tables as csv). also an html export option (feeds approach b).

**strengths.**
- best-in-class structure inference across the industry; adobe owns the spec.
- per-element font info with style (bold/italic) detected correctly across many vendors.
- strong at preserving reading order.

**weaknesses.**
- cloud-only. our pdfs may contain npc content; **sending them to adobe requires data-residency + consent review**, already flagged in `requirements-nonfunctional.md`.
- paid per page (roughly usd 0.05 per document in their consumption tier; verify current pricing before e1).
- latency: multi-second per document, inappropriate for the <=3s apply budget but acceptable for the <=10s detect budget.
- extraction abstraction is still document-oriented (paragraphs, not per-span).

**cost.** paid. cap experimentation at usd 5 per our benchmark rule.

**verdict.** fallback for when self-hosted extractors fail; not primary.

### 6. pdfminer.six

**what it returns.** lower-level primitives: `LTTextLine`, `LTChar` with bbox. pure python, no c dependency.

**strengths.**
- most readable internals of any extractor; easiest to patch when we hit a weird pdf.
- mit-licensed.

**weaknesses.**
- pdfplumber is built on pdfminer.six and adds value on top. using pdfminer directly means reimplementing pdfplumber's word-grouping ourselves.
- no semantic structure.
- maintenance cadence is slower than pymupdf / pdfplumber.

**verdict.** only reach for this if both pymupdf and pdfplumber fail on a specific pdf and we need to hack at the primitives.

## comparison matrix

| tool | semantic inference | bbox | font info | rtl handling | license | cost | integration cost |
|---|---|---|---|---|---|---|---|
| **pymupdf** | none (geometric only) | yes (top-left pt) | name + size | caller must handle bidi | afpl/comm | free | **baseline -- already in npc-pr-agent** |
| **pdfplumber** | none (geometric only) | yes (top-left after docs-level convert) | name + size | `line_dir`/`char_dir` | mit | free | low (add dep) |
| **docling** | yes (headings, tables, figures) | yes (self-describing origin) | partial | via ocr backend | apache-2 | free (compute) | medium (model downloads, gpu pref) |
| **unstructured** | yes (element types) | yes | limited | via ocr backend | apache-2 | free/paid api | medium (heavy deps) |
| **adobe pdf extract** | yes (paragraphs, tables) | yes | yes | yes | commercial | paid | low (http api), but **data-residency gate** |
| **pdfminer.six** | none | yes (bottom-left) | yes | no dedicated rtl api | mit | free | low |

## which to benchmark in phase 3

**primary for e1: pymupdf.** rationale:
- already a npc-pr-agent dependency; no new install footprint.
- the `dict` output gives us exactly what `PDFFieldDefinition` needs.
- compatible coordinate system with the existing `pdf_editor.py`.
- fast enough to stay inside the 3s apply budget.

**secondary for e1: pdfplumber.** rationale:
- lets us cross-check pymupdf's bboxes on the same pdf; disagreement is diagnostic.
- better explicit rtl knobs, useful once we get the arabic sample.

**held in reserve (not in e1, may appear in reports):**
- **docling** -- benchmark only if e1 results suggest we need semantic structure (heading/label/value pairing) that geometric tools can't provide. likely we instead reach for approach d (layout-ai) at that point.
- **adobe pdf extract** -- benchmark only if self-hosted extractors fail; data-residency review gate before running even a test.
- **unstructured** -- skip. wrong abstraction.
- **pdfminer.six** -- skip. pdfplumber dominates.

## open questions that should fall out of e1

- what fraction of visible glyphs on each sample pdf does pymupdf return as text (vs. missing because they're outlined)?
- how many spans does a semantic value like "255,000" split into across our two samples? this sets the difficulty of the span-joining heuristic.
- do pymupdf and pdfplumber bboxes agree within 1pt? if not, that's a coordinate-system bug to fix before any overlay work.
- on the arabic sample (pending), does pymupdf return text in logical or visual order?

## recommended e1 experiment shape

-   `benchmarks/e1-extract/run.py` takes a pdf path, runs pymupdf and pdfplumber extraction, emits a structured json with per-span entries + disagreement diff, plus a re-rendered pdf (pymupdf writing text at extracted bboxes) to feed the `fidelity-evaluation.md` comparator.
-   kill criterion (from research-strategy.md): both extractors under 0.90 full-page ssim on round-trip. otherwise advance to phase 4 or pair with approach c.
