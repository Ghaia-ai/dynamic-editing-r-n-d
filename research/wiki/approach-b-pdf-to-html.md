# approach b — pdf to html to pdf round-trip

> status: draft
> owner: elaa
> contract to satisfy: route uploaded pdfs through the existing html template path in `npc-pr-agent/src/services/visual_content/template_analyzer.py` (`auto_templatize`), then re-render to pdf via playwright. bypasses `PDFFieldDefinition` entirely. see `./integration-surface.md` for seams.
> consumed by: `./approach-matrix.md`

## why this approach is attractive a priori

the html template path already works. `template_analyzer.auto_templatize(html)` uses an llm to turn hardcoded values into jinja placeholders; `rendering_service` renders via playwright. if we can convert an uploaded pdf into html **faithfully enough**, we inherit that entire pipeline for free: auto-templatization, editing, rendering, and the existing ux.

the cost is a **round-trip fidelity tax**: pdf -> html is lossy (font substitution, layout drift); html -> pdf via chromium is lossy again (different font metrics than the original pdf renderer). phase 3 e3 measures the compound loss against `fidelity-evaluation.md` thresholds.

## the candidates

### 1. pdf2htmlex -- `/pdf2htmlex/pdf2htmlex`

**what it produces.** a single html file per pdf (by default) with embedded fonts converted to woff, plus css that absolutely-positions every text run. it does not produce semantic html -- no `<p>`, no `<h1>`; every glyph run becomes a positioned `<span>`. layout fidelity is high because nothing is reflowed.

relevant options from the wiki:

- `--embed-external-font=1` -- embeds local matched fonts for fonts missing from the pdf (default on). critical: without this, font metrics can shift between extraction and rendering.
- `--font-format=woff` -- output format for extracted fonts.
- `--decompose-ligature=0` -- keeps ligatures intact; setting to 1 splits them (matters for round-trip where the html needs to match glyph-by-glyph).
- `--heps=1 --veps=1` -- horizontal/vertical offset tolerance in pixels; smaller = higher fidelity at the cost of larger html.
- `--fallback=0` -- when set, emits a fallback mode compatible with older browsers at some fidelity cost.

**strengths.**
- best-in-class visual fidelity among open-source pdf-to-html converters. explicitly designed to preserve layout, not to produce readable html.
- handles embedded fonts via woff extraction. this is the key mechanism -- font metrics are preserved end-to-end, which is what makes round-trip fidelity achievable at all.
- mature codebase; the algorithm has been in production for 10+ years.

**weaknesses.**
- **agpl-3.0 license.** this is the dealbreaker for a commercial npc deployment unless (a) we run it behind an http boundary treated as an independent service, or (b) the deployment topology happens to satisfy agpl without service-side distribution of derived works. **legal review is mandatory before production use.**
- not actively maintained; last significant release ~2020. the docker image is the recommended install path because of system-deps churn.
- produces html that is **adversarial to `template_analyzer.auto_templatize`**: every visible character may be its own `<span>`, so the llm sees a soup of positioned spans rather than semantic elements. auto-templatization quality likely degrades.
- outputs one huge html file. modifying programmatically is painful.
- arabic / rtl: treated as a sequence of positioned glyphs; logical order is not reconstructed.

**cost.** free (agpl). deployment cost: docker.

**verdict.** **primary candidate for e3 fidelity measurement.** even though license + maintenance risk make production use questionable, pdf2htmlex is the ground-truth benchmark for "how faithful can pdf -> html be at all." if it clears our thresholds we argue for it (with legal); if it doesn't, approach b is dead.

### 2. mutool convert -f html (mupdf)

**what it produces.** mupdf (the engine pymupdf wraps) can export to html. the output is simpler than pdf2htmlex: positioned spans without font-format gymnastics. no woff extraction; relies on font-family fallbacks.

**strengths.**
- same engine we already use for extraction (via pymupdf). consistent coordinate system.
- licensed agpl-3.0 / commercial; if we pay for the commercial license (artifex already quotes for pymupdf use), we're covered.
- command-line invocation is simple.

**weaknesses.**
- fidelity floor is lower than pdf2htmlex because fonts aren't packaged with the output -- it relies on the rendering browser having compatible fonts. **exactly the failure mode our bug context warns about.**
- produces less structured html than pdf2htmlex, which paradoxically might be easier for the llm in `auto_templatize` to chew on, but the trade-off is probably net negative for e3's visual diff.

**cost.** free (agpl), or commercial license we may already have.

**verdict.** secondary. benchmark only as a fallback to pdf2htmlex if the latter is blocked on licensing.

### 3. pdf.js (mozilla)

**what it produces.** `pdf.js` renders pdfs to canvas + a text layer div (for search/select) in the browser. it is not a pdf-to-html *conversion* tool -- it's a renderer that produces rasterised canvas with a transparent text overlay.

**strengths.**
- excellent rendering fidelity in-browser.
- apache-2.0 licensed.
- we already run chromium (playwright) for html rendering; pdf.js fits the ecosystem.

**weaknesses.**
- the output is canvas, not semantic html. editing values means manipulating the text layer + re-rendering, which quickly devolves into writing our own overlay framework (approach c in all but name).
- **doesn't actually fit approach b's core premise** (plug into the html template pipeline). pdf.js output is a runtime artifact, not a storable html template.

**verdict.** skip. it's a renderer, not a converter. if we want in-browser pdf editing ux (out of scope for this r&d), revisit later.

### 4. adobe pdf extract api -- html output mode

**what it produces.** alongside structured json output, adobe's extract service offers an html export option. html is semantic (paragraphs, tables, headings), with font/color preserved in inline styles. commercial-quality conversion.

**strengths.**
- highest fidelity html among commercial options, because adobe has the reference implementation of the pdf spec.
- semantic markup that `template_analyzer.auto_templatize` would handle well.
- already considered for approach a (extract json); the html mode is just a different serialisation of the same service call.

**weaknesses.**
- same data-residency gate as approach a. content leaves our perimeter.
- paid per document (confirm current pricing during e3).
- requires a network round-trip, inflating the detect-latency budget.

**cost.** paid. our cap applies.

**verdict.** candidate for e3, **second to pdf2htmlex**. if pdf2htmlex's license is a hard block, adobe becomes the head-to-head against pdf2htmlex on fidelity.

### 5. apryse / pdftron websdk html output

**what it produces.** commercial converter (same vendor as pdftron pdfnet). produces semantic html with javascript-driven reflow options or pixel-perfect absolute positioning.

**strengths.**
- commercial-grade fidelity similar to adobe.
- self-hosted option available (stays inside our perimeter, unlike adobe).

**weaknesses.**
- expensive ($ per developer + deployment).
- large sdk footprint; nontrivial to integrate into a python pipeline (js-centric).
- licensing negotiation before we can evaluate.

**verdict.** **do not benchmark in e3** unless e3 shows adobe and pdf2htmlex both fall short. treat as an escalation path for the recommendation phase.

### 6. weasyprint / playwright "reverse" (html -> pdf) only

noted for completeness: weasyprint and playwright print-to-pdf are on the html -> pdf side of the round-trip, which is the *second* leg. the first leg (pdf -> html) is the hard problem; `rendering_service.render(...)` in `npc-pr-agent` already handles the second leg adequately via playwright + headless chromium.

our e3 harness therefore reuses `rendering_service` for the second leg and only swaps converters for the first.

## comparison matrix

| tool | fidelity (expected, full-page ssim) | output quality for auto_templatize | license | data leaves our perimeter | deployment cost |
|---|---|---|---|---|---|
| **pdf2htmlex** | high (0.95+) | poor (positioned spans, no semantic) | agpl-3.0 | no | docker |
| **mutool convert -f html** | medium (0.85-0.90) | medium | agpl / commercial | no | system dep |
| **pdf.js** | n/a (renderer, not converter) | n/a | apache-2.0 | no | — |
| **adobe pdf extract (html mode)** | high (0.95+) | good (semantic markup) | commercial | **yes** | cloud api |
| **apryse / pdftron** | high (0.95+) | good | commercial (paid) | no (self-host option) | sdk integration |

## which to benchmark in phase 3

**primary for e3: pdf2htmlex.** rationale:
- highest a-priori visual fidelity we can evaluate without a commercial contract.
- failing here kills approach b cheaply; succeeding lets us argue for licensing work.

**secondary for e3: adobe pdf extract (html mode).** rationale:
- alternative path if pdf2htmlex license blocks production use.
- also benchmarks adobe's structure inference quality for free (same api call serves both approach a and approach b).
- requires data-residency consent; do not run on real npc content without approval. the two sample pdfs in `datasets/samples/` are acceptable for testing because their provenance is already shared externally.

**explicitly skipped in e3:**
- **mutool convert -f html** -- we'd only use this if pymupdf's commercial license already covers it and pdf2htmlex is blocked; narrow branch.
- **pdf.js** -- wrong shape.
- **apryse** -- too expensive to evaluate in r&d; escalation path.

## critical question e3 must answer

**"does the output html feed `template_analyzer.auto_templatize` productively, or does it look like glyph-soup to the llm?"**

this question is orthogonal to visual fidelity. pdf2htmlex might pass the ssim test but still fail here because the html is structurally hostile. e3 must produce not just the round-trip visual diff but also a sample run of `auto_templatize` against the converted html, and a human assessment of whether the resulting jinja placeholders are usable.

if auto_templatize falls apart on pdf2htmlex output, approach b collapses to two narrower variants:
- **b-prime**: pdf -> adobe html -> auto_templatize (pays for data-residency)
- **b-prime-prime**: pdf -> pdf2htmlex -> *custom* templatizer that works with positioned spans (new code)

## open questions for e3

- what is the actual file size of pdf2htmlex output on our two samples? large html slows the llm path.
- does pdf2htmlex preserve arabic glyph ordering when rendered back, even if it mangles logical order?
- does adobe extract html mode give us arabic better than english? verify before we commit.
- does `auto_templatize` need modification to handle positioned-span html, or does it tolerate glyph soup?

## recommended e3 experiment shape

```
benchmarks/e3-html-roundtrip/
  run.py                 # takes pdf, produces html via one of {pdf2htmlex, adobe-extract-html}
  roundtrip.py           # html -> pdf via playwright (reuse pattern from rendering_service)
  auto_templatize_probe.py   # smokes the html through template_analyzer.auto_templatize; human-scored
  results/               # json with ssim/mae + templatize-quality rubric
```

kill criterion (from research-strategy.md): best converter < 0.90 full-page ssim, **or** auto_templatize produces unusable output on both converters. either condition kills approach b.
