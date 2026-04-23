# functional requirements

> status: draft
> owner: elaa
> sources: `../raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf`, `./bug-context.md`, `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent/src/workflows/fill_poster/tools.py`

what the end product must let the user do. derived from the brief and the existing `fill_poster` contract so the chosen approach slots into user expectations that already exist.

## primary user flow (must-have)

f1.  **upload an arbitrary pdf.** not a pre-registered template. the pdf may be authored by any tool (illustrator, canva, indesign, word-export, latex-export). no admin curation step between upload and editability.

f2.  **see which values are editable.** the system presents a list of detected fields (label + current value). the user does not need to click into the pdf to discover what can be edited.

f3.  **edit one or more values.** for each editable field, the user supplies a new string. the system must accept arbitrary new values within the constraints declared by the field's `format_hint` (see `PDFFieldDefinition.format_hint` in `npc-pr-agent/src/models/pdf_template.py:49-52`: integer, integer_comma, decimal, percentage, currency, date, auto).

f4.  **download a modified pdf.** output is a single pdf file. visual design preserved to the thresholds in `fidelity-evaluation.md`. filename convention matches existing `fill_poster`: `{template.name}_filled.pdf`.

f5.  **re-edit.** the user can submit further edits against the already-modified pdf without re-uploading. this mirrors the existing `context.pdf_last_fill_url` pattern in `fill_poster/tools.py:155`.

## secondary flow (should-have)

f6.  **override detected fields.** when auto-detection misses a value or identifies one that shouldn't be editable, the user can add or remove a field. editing the field list should not require admin permissions.

f7.  **preview before commit.** the user sees the proposed change rendered against the original before downloading the final pdf.

f8.  **reject a change.** if the rendered preview looks wrong (e.g. a font substitution made the value unreadable), the user can discard that edit without affecting others.

## explicit non-requirements (for this R&D phase)

n1.  editing images, icons, colours, or layout geometry. **text values only.** image/icon editing is already handled in the html template path (`template_analyzer.py`) and is out of scope here.
n2.  adding new fields that don't exist in the original pdf. the system surfaces what's there; it does not synthesise new labels.
n3.  collaborative multi-user editing of the same pdf. single-user session, inherit existing websocket pattern.
n4.  multi-page documents longer than ~5 pages. posters and infographics are 1-2 pages; a longer-document edit surface is a different product.

## integration-derived requirements

these fall out of the fact that the new approach plugs into `npc-pr-agent`, not a greenfield app:

i1.  the output contract must be a `PDFFieldDefinition` list (or a strict superset) so downstream code in `fill_poster/tools.py:160-204` keeps working unchanged. see `integration-surface.md` for the fuller picture.
i2.  the approach must return quickly enough to send progress events on the existing websocket action-event stream (see `send_action_event` calls in `fill_poster/tools.py`). specific latency budget in `requirements-nonfunctional.md`.
i3.  arabic input must round-trip unchanged in edited fields (preserve logical order in the replacement stream even if the pdf stores glyphs in visual order).
i4.  the modified pdf must upload to azure blob storage via the same pattern (`generate_blob_name` / `upload_bytes_to_blob`).

## success criteria (functional)

-   on `datasets/samples/qms_psa_121_feb_2024_poster.pdf` (uploaded without any admin pre-registration), a user can detect, edit, and download a modified pdf with at least one numeric field changed. modified pdf passes `fidelity-evaluation.md` thresholds.
-   same flow on `datasets/samples/water_infographics_en_filled.pdf`.
-   same flow on an arabic poster (pending `[Data]` clickup task).

## open questions surfaced during requirements writing

-   can f3's `format_hint` values be inferred from the current value, or must the user specify? the existing code assumes they are specified by the admin; our approach either needs to infer them or surface them as "auto" and accept looser validation.
-   f7 preview: does the existing frontend support a "proposed change" render distinct from the committed one? check `docs/frontend-regeneration-guide.md` in npc-pr-agent before claiming this flow.
