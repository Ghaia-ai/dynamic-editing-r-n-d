# non-functional requirements

> status: draft
> owner: elaa
> sources: `./requirements-functional.md`, existing precedents in `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/services/visual_content/`

no formal slo exists for the poster/pdf path in `npc-pr-agent`; the existing code uses implicit timeouts as the working budget. this note captures those precedents and sets explicit targets the chosen approach must meet.

## latency

precedents observed in the codebase (all ms):

| setting | value | source |
|---|---|---|
| `NPC_PLAYWRIGHT_OP_TIMEOUT_MS` (default) | 10000 | `template_analyzer.py:48` |
| `rendering_service.render` default timeout | 10000 | `services/rendering_service.py:446` |
| `rendering_service` extended render timeout | 15000 | `services/rendering_service.py:1119` |
| `image_generation_service` http timeout | 120000 | `services/image_generation_service.py:442` |
| `template_analyzer` per-op timeout | 10000 | `template_analyzer.py:436, 477` |

these are the per-operation ceilings the rest of the system already tolerates. they are not slos; they are failure cutoffs. we infer user-perceived budgets from them.

### targets for the pdf-fill path

| stage | budget (p95, wall-clock) | rationale |
|---|---|---|
| **detect editable fields** on uploaded pdf (one-time, after upload) | <= 10s | matches `NPC_PLAYWRIGHT_OP_TIMEOUT_MS` precedent; long enough for a single llm call over a rendered page image |
| **apply edits** to an already-detected template | <= 3s | `fill_pdf_template` today completes in ~1-2s on pre-curated templates; we must not regress this |
| **render preview** (if approach C overlay) | <= 2s | user-perceived interactivity; bigger than this and the ux collapses |
| **full cold round-trip** (upload -> detect -> edit -> download) | <= 15s | the `send_action_event` progress stream masks wait-time up to this point; beyond it the session feels broken |

for paid-api approaches (d in the matrix, possibly b), **record actual p50/p95 latency and cost per page** in the result json. do not assert on the target until we have numbers.

## cost

this R&D will incur paid-api cost only in gate 2 (phase 3 e3, e4). target:

-   **per-pdf editable-field detection** cost <= usd 0.05. higher than this and deploying to production becomes unviable.
-   every paid-api experiment run caps total spend at usd 5 in the harness and logs actual cost in the result json.

## language support

-   **english**: first-class. all experiments use it by default.
-   **arabic / rtl**: first-class for npc. the chosen approach must round-trip arabic edited values without corrupting glyph order or shaping. the codebase already treats arabic as the primary language (see `npc-pr-agent/docs/Qatar-Cultural-Rules-Reference.md`).
-   mixed-script pdfs (arabic + english numerals) must work. posters often mix.

explicitly out of scope for this phase: hebrew, farsi, urdu, east-asian scripts. flag but don't test.

## deployment constraints

-   **platform**: azure. all infra under resource group `ghaia-r-n-d` under subscription `Ghaia_Dev_Customers` (`204b04cb-fa16-4e25-ab22-cb067808eac6`).
-   **process model**: inherit from npc-pr-agent. python 3.11+, async everywhere, fastapi + websocket.
-   **storage**: modified pdfs upload to azure blob storage via the existing `upload_bytes_to_blob` helper. do not introduce new storage backends.
-   **secrets**: azure key vault or `.env` (local dev). do not invent new secret-management patterns.
-   **llm access**: use existing azure openai deployment (`AZURE_OPENAI_*` env vars). gemini / gpt-4o direct calls permitted only for benchmarks, not for the production path unless the recommendation specifically justifies it.

## reliability / failure modes

-   **partial success must be observable**: for a batch of n field updates, `success=true` when at least one applied; `changes[].status` reports per-field outcome (mirror the existing pattern in `fill_poster/tools.py:192-201`).
-   **auto-detection false positives** must degrade gracefully. if the user tries to edit a field that doesn't actually correspond to a replaceable region, the response is `status: "not_found"` with no error -- the existing bucket.
-   **corrupted or password-protected pdfs** must be rejected with a clear error before any expensive processing kicks off.

## observability

-   structured logs via `gagent_core.logs.logger`, following the `[{session_id}]` prefix pattern used in the incumbent code.
-   every extraction / edit operation emits an action event via `send_action_event` so the frontend progress ui remains informed.
-   cost + latency + fidelity metrics from each experiment land in `benchmarks/results/` as versioned json for historical comparison.

## security & privacy

-   uploaded pdfs may contain qatar government content. **do not send raw pdfs to third-party apis without user consent**. where an approach requires external inference (gpt-4o vision, google document ai), consent + data-residency review are prerequisites to the recommendation.
-   modified pdfs inherit the blob-storage retention policy of the existing `fill_poster` outputs; do not introduce longer retention in this path.

## open questions

-   is there a written slo document anywhere in the npc-pr-agent repo or confluence that these targets should reconcile against? quick search shows none under `docs/`. if one exists outside the repo, update this note.
-   for arabic posters specifically, does the existing pdf editor handle rtl at all today, or does it fail silently? needs a live test before gate 1 kicks off.
