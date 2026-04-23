# approach d — ai-assisted layout understanding (placeholder)

> status: **placeholder awaiting deep-research output**. outsourced to a deep-research agent with the prompt documented below. replace this file wholesale when the report lands.
> owner: elaa
> consumed by: `./approach-matrix.md`

## why this file exists as a placeholder

approach d is a *shared primitive* used inside approaches a/b/c to answer "which bbox is a label, which is its value, and what semantic role does each span play." the vendor/model landscape for this moves quickly (gpt-5 vision, gemini 2.5 pro, claude opus/sonnet vision, azure document intelligence revisions, pixtral, 2026-era open-weights document-ai models) and needs fresh primary-source evaluation rather than me restating training-cutoff knowledge.

rather than write a stale note, this file scopes what the deep-research output must cover so `./approach-matrix.md` can still make a decision when the report arrives.

## the deep-research prompt (issued 2026-04-23)

paraphrased:

> i'm evaluating vision-llm and layout-detection approaches for a problem: given an arbitrary poster/infographic pdf, auto-detect every editable text field as (bounding box, label, current value, confidence). two sample pdfs: a qatar ministry of sport poster (english, heavy graphic design, ~10 fields) and a water-themed infographic (english, mixed numeric values). target: recall >= 80% of true editable fields, precision >= 80%, cost <= usd 0.05 per pdf, latency <= 10s per pdf. must also work on arabic rtl posters.
>
> evaluate and rank these candidates with current (2026) pricing, latency, api shape, and arabic quality:
>
> 1.  gpt-4o / gpt-5 vision (structured outputs with bbox schema)
> 2.  gemini 2.5 pro vision (structured outputs with bbox schema)
> 3.  azure document intelligence `prebuilt-layout` and `prebuilt-read`
> 4.  layoutlmv3 self-hosted
> 5.  donut self-hosted
> 6.  doclaynet models
> 7.  2025-2026 challengers (mistral pixtral, claude sonnet/opus 4.x vision, open-weights document-ai)
>
> for each: (a) does the api return bboxes paired with a label/role, or just text? (b) measured or vendor-reported accuracy on chaotic poster layouts (not reports/invoices); (c) per-pdf cost at 1000 pdfs/month; (d) arabic/rtl: does the tool return text in logical or visual order; (e) trust-directly or need verification.

full prompt is in the conversation transcript; identical wording will be re-issued if the agent needs re-runs.

## what the integration contract requires from approach d (locks the evaluation rubric)

per `./integration-surface.md`, approach d's output must be convertible to `PDFFieldDefinition` equivalents. at minimum, for every editable field detected, we need:

-   **page index** -- required.
-   **bbox** in pdf points or normalised coordinates with origin declared -- required.
-   **current value** (the literal text currently visible at that bbox) -- required.
-   **label** (human-readable name; "Total Population" for a numeric value) -- desirable. if absent, approach d can only feed approach c (overlay) which does not need labels; it cannot feed approach a's auto-`PDFFieldDefinition` synthesis without a downstream labeller.
-   **confidence** per field -- desirable. lets us threshold before surfacing to the user.
-   **role / type** (title, body, caption, numeric value, date, ...) -- optional but useful for `format_hint`.

a tool that returns only text + reading-order without bboxes is insufficient. a tool that returns bboxes + text but no labels is a *detector* (useful as a primitive inside a/c). a tool that returns bboxes + text + labels is a *solver* (could drive a/b/c end-to-end).

## how approach d slots into the other approaches (for the matrix)

| pairing | approach d's role | failure mode if d fails |
|---|---|---|
| a + d | d provides labels for spans pymupdf already found | fall back to heuristic labelling (font-size contrast, proximity) or manual mapping ui |
| b + d | d names jinja placeholders in html that `auto_templatize` produced | `auto_templatize` falls back to its own llm-based placeholder naming (already what it does) |
| c + d | d tells overlay editor which bboxes are editable vs. decorative | manual bbox selection via ui |
| d alone | solver: detect + label + extract without a/b/c primitives | reduces to "you still need an editor" -- c is the thinnest editor, so d-alone collapses into c + d |

`d-alone` is not a real standalone option. approach d's recommendation always ships *with* one of a/b/c as its editor back-end.

## explicit open questions for the deep-research report

these are the questions the report must answer *specifically* so the matrix decision is unblocked:

1.  **can any single candidate clear the 80/80 recall/precision bar on non-invoice non-report pdfs?** (published benchmarks for invoices/reports are not sufficient evidence.)
2.  **which candidate handles arabic poster layouts best** in terms of (a) returning logical-order text, (b) associating rtl labels with their numeric values (which are often ltr even on arabic posters).
3.  **api shape**: which candidates return `{bbox, label, text, confidence}` as a first-class response shape vs. requiring post-processing from free-text output?
4.  **cost at 1000 pdfs/month** in 2026 pricing -- our budget gate is usd 0.05/pdf.
5.  **azure-native preference**: azure document intelligence prebuilt-layout stays inside our perimeter by default, which matters for npc content. does its quality on posters justify defaulting to it over a cross-cloud call to openai/gemini?
6.  **self-hosted option viability**: is layoutlmv3 / donut / pixtral-open-weights a realistic alternative for teams that want to avoid per-call cost, and what's the hardware floor?

## recommendation placeholder for the matrix

until the deep-research report lands, the matrix should treat approach d as:

-   **a primitive, not a standalone approach**. always paired with a/b/c.
-   **two likely primary candidates**: azure document intelligence (azure-native, paid-per-page, no data-leaves-perimeter story built-in) and a vision llm behind structured outputs (gpt-4o / gemini 2.5 pro). the deep-research picks between them.
-   **cost risk**: if the winner's per-pdf cost exceeds usd 0.05, approach d's use inside our production pipeline is gated on either (a) caching detected templates so d runs once per upload, not per edit, or (b) picking a self-hosted fallback.

## placeholder verdict pending report

treat approach d as **"likely included in the final recommendation as a primitive, specific vendor tbd"**. the matrix should not block phase-3 experiment scoping on this; e1 and e2 can proceed without d since they test geometric and overlay-only pipelines.

the first point where approach d's identity materially matters is when we design the *field-detection* sub-experiment inside either e1 or e2 -- at which point the deep-research report should be available. if it isn't, we scope that sub-experiment around whichever vendor we can spin up fastest (probably azure document intelligence, since we're already provisioned).

---

**when the deep-research report arrives, replace this entire file with the report content, preserving the commit trail.** the `./approach-matrix.md` entry for approach d can then be updated from "tbd-vendor" to the specific recommendation.
