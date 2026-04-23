# datasets

shared input data for experiments and benchmarks. organised by source, not by experiment.

## layout

- `samples/` -- sample pdfs attached to the initiating brief (minhal, 2026-04-13).
  - `qms_psa_121_feb_2024_poster.pdf` -- qatar ministry of sport poster. heavy graphic design, likely mixed script.
  - `water_infographics_en_filled.pdf` -- water-themed infographic. the "_filled" suffix suggests the file was already processed through the existing npc-pr-agent fill path, so it may include residue from that run.

## conventions

- filenames lowercase, snake_case; strip vendor formatting unless it carries provenance meaning. original filename + origin logged here in the readme.
- commit only small (< ~10mb) license-safe samples. larger collections go to blob storage and are referenced from here by url.
- benchmarks load from relative path (`datasets/samples/<file>.pdf`); no absolute paths in code.
- when adding a new source collection, mkdir `datasets/<source-name>/` and describe provenance + license in this readme.

## provenance (current samples)

| file | source | received | license | notes |
|---|---|---|---|---|
| `samples/qms_psa_121_feb_2024_poster.pdf` | email attachment, minhal abdul sami | 2026-04-13 | internal / unclear | qatar ministry of sport; verify redistribution rights before external sharing |
| `samples/water_infographics_en_filled.pdf` | email attachment, minhal abdul sami | 2026-04-13 | internal / unclear | output of the existing fill-poster pipeline; use as a "worked example" reference |
