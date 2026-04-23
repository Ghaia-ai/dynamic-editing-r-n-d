# approach c — overlay editing (original as background, edit layer on top)

> status: draft
> owner: elaa
> contract to satisfy: `./integration-surface.md`. the natural integration seams are **seam 1** (replace `PDFEditor` so bbox is authoritative) and **seam 2** (new pre-processor to synthesise `PDFFieldDefinition`s with bboxes). overlay is also the shape the incumbent `pdf_editor.py` already aspires to -- we'd be promoting the bbox-path from fallback to primary.
> consumed by: `./approach-matrix.md`

## what "overlay" means here

keep the original pdf page as an immutable background. for each editable field:

1.  draw a cover rectangle in the background colour over the field's bbox (redact).
2.  draw the new value in a matched font at the same position.

non-edited regions are untouched, so full-page fidelity for them is automatic. only the edit sites need fidelity work. this is a fundamentally different trade than approaches a and b, where we rebuild the whole page and hope it matches.

## the incumbent implementation is already overlay

`npc-pr-agent/src/services/pdf/pdf_editor.py` is **conceptually an overlay editor**: `search_and_replace` samples the background, draws a cover rect, then inserts new text. lines 80-150 show the font extraction that makes matched-font inserts possible:

- `_extract_fonts()` walks `page.get_fonts(full=True)`, strips the subsetted-font prefix ("OLODPF+Lusail-Bold" -> "Lusail-Bold"), and caches the raw font buffer.
- `_register_font_on_page(...)` calls `page.insert_font(fontbuffer=...)` so subsequent `insert_text` calls can reference the extracted font by alias.

this mechanism is load-bearing. it means **once we detect the right span and its font name, replacement can use the pdf's own embedded font** -- no substitution, no metric drift, no fidelity tax from the font side.

what's broken today is field discovery, not replacement. overlay already works; it just needs bboxes it can trust.

## the candidates (libraries that build or support overlays)

### 1. pymupdf redact + insert_text -- current and preferred

**pipeline.**
- `page.add_redact_annot(rect, fill=bg_sample)` marks the rectangle.
- `page.apply_redactions(images=2, graphics=1, text=0)` physically removes covered text/graphics while keeping the rest of the page untouched.
- `page.insert_font(fontbuffer=<extracted>)` registers the embedded font (done once per page).
- `page.insert_text((x, y), new_value, fontname=alias, fontsize=..., color=...)` draws the replacement.

the `add_redact_annot` api even accepts an inline replacement text, so the redact + insert can be a single call for simple cases. for our use (font-matched insert with specific positioning) we keep them separate.

**strengths.**
- already in production in `npc-pr-agent`. zero new deps.
- full control over each step; caller chooses bbox authority, background sampling strategy, font resolution.
- font reuse via embedded-font extraction is proven (see `_extract_fonts`).
- fidelity of non-edited regions is guaranteed: `apply_redactions(graphics=0)` preserves vector graphics, only the redact rect is touched.

**weaknesses (and where overlay can leak).**
- **background sampling**: the cover rectangle must match the pdf's background under the text. when the background is a solid colour, sampling a pixel adjacent to the bbox works. when the background is a gradient, pattern, or image, sampling one colour is wrong and the redact shows as a visible patch.
- **font matching**: the extracted font is the *embedded subset* -- it contains only the glyphs that were originally used. if the user's new value introduces a glyph not in the subset (e.g. replacing "2024" with "2026" works; replacing "A" with "Á" may fail), `insert_text` silently falls back to a substitute. a preflight check against the font's glyph coverage is necessary.
- **text alignment**: `insert_text` takes a baseline `(x, y)`. the original span's `origin` gives us this directly, but only if we extract with `get_text("dict")`. the existing code reaches for this but complicates itself with "search for old text, then extract font" -- overlay with authoritative bboxes skips the search step entirely.
- **rtl**: `insert_text` draws left-to-right. for arabic, the caller must pre-shape (arabic reshaper + bidi) and typically insert right-to-left by computing the right edge. this is where arabic posters break every editor that isn't rtl-aware.
- **vertical text**: same concern but rarer for posters.

**cost.** free (same license as we have today).

**verdict.** **primary for e2.**

### 2. pikepdf -- `pdfplumber`'s rival for low-level pdf manipulation

**what it is.** python bindings over qpdf. excellent for pdf object-graph manipulation (xref surgery, streams), less focused on rendering or visual overlay.

**strengths.**
- mpl-2.0 licensed.
- cleaner than pdfplumber for programmatic pdf *modification*: you can write content-stream operators directly.
- good for advanced cases: replacing a clip, editing a patterned background, etc.

**weaknesses.**
- does not rasterise or sample colours; you need pymupdf or cairo alongside for background sampling.
- no embedded-font-extraction helpers; you'd hand-roll font subsetting.
- overkill for the common cases we face.

**verdict.** keep for edge cases. not in e2.

### 3. reportlab -- overlay as a "new pdf on top"

**what it is.** reportlab generates pdfs from scratch. for overlays, the pattern is:
- open the original with pymupdf, render to images or keep pages as-is.
- reportlab creates a transparent-background pdf with the edit content at calculated positions.
- use pypdf or pikepdf to merge the reportlab pdf as a top layer over the original.

**strengths.**
- bsd-licensed; clean api for new-pdf creation.
- fine-grained control over typography (paragraph flows, character spacing) -- more capable than pymupdf for complex text.

**weaknesses.**
- **layered pdfs are fragile**. if the user opens the result in a non-standard viewer or pipeline, the overlay may mis-render.
- background-colour redaction is harder: overlaying without first removing the old text leaves the old text visible under a transparent layer. you need a two-step (draw a white rect underneath the new text *on the overlay layer*, then align precisely).
- existing `pdf_editor.py` doesn't use reportlab; adopting it is a dependency addition for marginal gain.

**verdict.** skip. pymupdf covers this case better in our stack.

### 4. wkhtmltopdf / weasyprint + layered composition

**what it is.** render a small html snippet containing just the edit value with precise positioning css, then composite on top of the original pdf.

**strengths.**
- reuses the html rendering pipeline we already have for the template path.
- good for complex typography (flows, bidi, shaping) because chromium handles that well.

**weaknesses.**
- performance: rendering a full chromium page just to draw one updated number is expensive.
- alignment precision: translating pdf points into css px + chromium print margins is fiddly.
- we're solving a simple problem with a complicated pipeline. if approach b wins, we inherit this anyway; if it doesn't, this variant is overkill.

**verdict.** skip. if approach b wins, we reconsider.

### 5. endpdf.com / hyperpdf.com / other commercial "annotate + save"

noted for completeness: commercial services that expose overlay-style editing behind an api. too expensive to run per edit in production, and sending content out of perimeter is the same gate as with adobe.

**verdict.** not for e2 or recommendation.

## the four hard problems overlay must solve

these are the real risks for approach c. phase 3 e2 is designed to test all four:

### p1. field discovery (which bboxes)

overlay is only as good as its bboxes. options:

- **geometric** -- pymupdf `get_text("dict")` span bboxes. fastest. may over-segment ("255,000" -> 4 spans).
- **hybrid** -- geometric + llm labelling (approach d as primitive). a vision llm identifies which spans are "value" vs "label."
- **pure ai** -- skip pymupdf, send page image to gpt-4o vision for bboxes.

e2 starts with geometric + a manual pick of "the date field on each sample." if the bbox from that span is clean and the overlay result passes fidelity, we know the bbox pipeline works and the harder question (p1 at scale) is worth investigating. if the bbox is wrong, approach c itself is suspect regardless of approach d.

### p2. background sampling

how do we fill behind the old text?

- solid colour: sample 1-2 pixels adjacent to the bbox. fast, works for most posters.
- patterned / gradient: sample a larger ring, interpolate, or (safer) copy the pixels from the surrounding region via pymupdf's `page.get_pixmap` and reinsert. more expensive.
- photographic: bbox over a photo background is nearly impossible to hide; fall back to drawing a semi-transparent chip with the new value, or abandon the edit.

e2 must include at least two failure cases: solid-bg value, patterned-bg value.

### p3. font matching

handled as described under pymupdf. the existing code already solves this for pre-curated templates; e2 confirms it holds for arbitrary uploads where we haven't hand-picked the font mapping.

preflight check: does the extracted embedded font contain every glyph in the new value? if not, fall back to a shipped font (existing behaviour: `fontname="helv"` default) and flag the field in the result.

### p4. rtl / bidi

arabic posters store glyphs in visual order in the pdf stream. for overlay:
- input: user types "الماء" (logical order).
- we need to shape it (arabic glyph forms) and render rtl (right-to-left) at the detected bbox.
- pymupdf's `insert_text` does not handle this; `insert_htmlbox` does, because it delegates to chromium-style shaping.

e5 (arabic stress test) specifically gates the entire approach c story on this. for e2 we only test english posters; e5 is what tells us whether approach c survives npc production.

## comparison matrix

| tool | bbox-first api | font reuse helpers | background sampling | rtl handling | license | integration cost |
|---|---|---|---|---|---|---|
| **pymupdf redact + insert** | yes (`add_redact_annot(rect)`, `insert_text((x,y), ...)`) | yes (existing `_extract_fonts`) | caller-provided | manual (insert_htmlbox for bidi) | afpl/comm | **zero -- already here** |
| **pikepdf** | yes (manual stream ops) | no | external | manual | mpl-2.0 | medium |
| **reportlab** | via merge workflow | custom | external | partial | bsd | medium |
| **html snippet composite** | via chromium | via css | via css | yes (chromium) | mixed | high |

## which to benchmark in phase 3

**primary for e2: pymupdf redact + insert.** rationale:
- already in the codebase; e2 is effectively a test of whether the existing machinery works *when we skip the `search_pattern` step and drive it from bboxes instead*.
- zero dep cost; fastest iteration.
- if it fails, approach c is in trouble regardless of which library we pick, because the failure is at the concept layer (p1-p4), not the implementation.

**no secondary in e2.** pikepdf, reportlab, and chromium-composite are all heavier and address the same problems less directly. if pymupdf fails we escalate through the approach-matrix, not through library substitution.

## what e2 needs in code

```
benchmarks/e2-overlay/
  run.py          # for each sample pdf, perform one pre-chosen field edit (date value),
                  # measure masked-ssim on non-edited region (mask = edit bbox, inverted)
  manifest.json   # declares which field to edit per sample; enables re-run without code changes
  results/        # per-run ssim + mae + font-match evidence + fidelity gotchas observed
```

kill criterion (from research-strategy.md): non-edited-region masked ssim < 0.99. that number is aggressive because the non-edited region is literally untouched bytes of the original rendering; anything under 0.99 means the redact + insert is leaking (cover rect mis-sized, pymupdf re-rasterising the page, something compositor-level).

## open questions for e2 and e5

- on `qms_psa_121_feb_2024_poster.pdf`, how much of the page is solid-colour background vs. patterned/photographic? this bounds p2 difficulty.
- the existing `pdf_editor.py` uses `apply_redactions(graphics=0)` by default; does that leave the original text-glyph outlines in place when they were converted to paths? if yes, overlay cannot cover them and we need a different strategy for outlined text.
- can we preflight glyph coverage of the embedded font before attempting an edit, so we fail fast rather than producing a bad output?
- for e5, does `insert_htmlbox(bbox, html_with_arabic, archive=...)` produce clean rtl arabic at an arbitrary bbox? that's the single highest-value test we can run on the arabic sample.
