# bug context: why the current PDF fill path fails on arbitrary uploads

> sources:
> - `../raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf` (initiating brief)
> - `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/workflows/fill_poster/tools.py`
> - `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/services/pdf/pdf_editor.py`
> - `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/services/visual_content/template_analyzer.py`
> - `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/services/visual_content/template_filler.py`
> status: draft
> owner: elaa

## what the npc-pr-agent currently does

two parallel systems handle "templated content":

1.  **html template path** (works well)
    -   admin (or auto-pipeline) uploads raw html.
    -   `template_analyzer.auto_templatize(html)` uses an llm to find dynamic text, converts hardcoded values into `{{ jinja }}` placeholders, normalises logos/footers/icons. returns `(templatized_html, placeholders)`.
    -   end users fill placeholders; `template_filler` + `rendering_service` (playwright) render to an image / pdf.
    -   success because html is already structured: dom tree gives us semantic anchors.

2.  **pdf template path** (the bug domain)
    -   admin pre-registers a pdf with a set of `PDFFieldDefinition` records, each carrying a `field_key`, `label`, and crucially a `search_pattern` (the literal current value on the page).
    -   `fill_poster/tools.py:fill_pdf_template(replacements)` looks up each field, then calls `PDFEditor.apply_field_update(field_def, new_value)`.
    -   `PDFEditor` is a pymupdf wrapper: **literal-text search-and-replace** driven by `search_pattern`. see `pdf_editor.py` header comment: "surgical text replacement using pymupdf".

## the failure mode

when the pdf is an arbitrary upload (poster designed in illustrator / canva / indesign by a third party):

-   there is no pre-registered `PDFFieldDefinition` — the admin curation step never happened. the current tool returns `{"success": false, "error": "no template"}` immediately (tools.py:69).
-   even if a user labels fields manually after upload, the `search_pattern` approach breaks because:
    -   text is rendered as glyph runs, not logical strings. a value like "255,000" may be stored as four separate runs with arbitrary ordering.
    -   fonts are often subsetted or embedded under obfuscated names.
    -   arabic / rtl text is stored in visual order in the pdf stream; the logical-order search pattern won't match.
    -   text may be outlined to paths (common for brand titles and numerals) — no text to search.

the failure surfaces in the existing `not_found` bucket (tools.py:236): "field found but value not located in pdf". this is the exact scar tissue the brief is reacting to.

## restated problem

the R&D is not "how do we edit PDFs." it's:

> **how do we turn an arbitrary uploaded PDF into something the system can fill, without an admin pre-curating a `PDFFieldDefinition` set?**

equivalently: **how do we make the pdf path as good as the existing html path?**

## implications for approach selection

1.  **"extract to structured + regenerate"** is effectively asking: can we auto-produce a `PDFFieldDefinition` set (or equivalent) from the pdf alone? that's the cheap experiment: we can validate it without touching fidelity concerns.
2.  **"pdf -> html -> pdf"** maps the unsolved pdf problem onto the already-solved html problem. if the pdf->html step is faithful enough, we get auto-templatization (step 1 of `template_analyzer`) for free. biggest risk: round-trip fidelity, especially with arabic and subsetted fonts.
3.  **"overlay"** skips the auto-template question entirely. the original pdf stays as a background; we place edit text on top at detected bboxes. fidelity of non-edited regions is automatic (we don't touch them). main risks: detecting the right bbox for a semantic field ("find the gdp value"), and matching fonts when drawing the replacement.
4.  **"ai-assisted layout understanding"** is really the *detection layer* that any of the above three need. it's not a standalone approach so much as a primitive we use inside 1, 2, or 3 to answer "which bbox / which text is the editable field."

## restated candidates (post-bug-analysis)

| # | approach | what it provides | primary risk |
|---|---|---|---|
| a | extract → fielddef → existing editor | auto-templatization for pdfs | unreliable glyph reconstruction on illustrator/canva exports |
| b | pdf → html → html template path → pdf | reuses the known-good html pipeline | round-trip visual fidelity |
| c | overlay (original pdf + edit layer) | visual fidelity is automatic on non-edited regions | field detection + font matching at edit points |
| d | layout-ai (as a primitive used by a/b/c) | turns "find the field" into a solvable task | cost, latency, hallucination |

## where this research memo lands relative to the brief

the brief asks for exploration across four approaches. this bug-context note re-frames them so that:

-   candidate d becomes a shared primitive, not a competing option.
-   candidate b gains weight because it plugs into an existing working pipeline.
-   candidate c gains weight because it sidesteps the hardest part (fidelity).
-   candidate a loses weight unless extraction is near-perfect.

## open questions

-   does `template_analyzer.auto_templatize` work on html that was mechanically converted from pdf (as opposed to hand-authored html)? this is the load-bearing assumption for approach b.
-   for approach c, what detector gives us bboxes paired with semantic labels on the sample pdfs (`datasets/samples/qms_psa_121_feb_2024_poster.pdf` and `datasets/samples/water_infographics_en_filled.pdf`)?
-   what is our fidelity threshold? see `research/wiki/fidelity-evaluation.md` (to write).
