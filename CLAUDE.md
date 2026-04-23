# claude.md

> AI-native project documentation for R&D: Dynamic PDF Editing for Poster Workflow.

## project purpose

this is a focused R&D project to investigate and prototype a dynamic PDF editing approach for the poster/infographic workflow in the NPC (National Planning Council) content agent.

the problem (from the initiating brief): the target PDFs behave like flattened visual canvases rather than structured documents. text elements are positioned arbitrarily, with no reliable semantic mapping between headings, labels, and their corresponding values. each PDF has a unique layout, no reusable template exists, and users need to upload such PDFs and modify specific values dynamically while preserving exact visual design, layout precision, and formatting fidelity.

**repo:** `Ghaia-ai/dynamic-editing-r-n-d`
**tracking (single source of truth):** clickup list `901813626574` -- https://app.clickup.com/90181533002/v/l/f/901813626574?pr=901810347592
**solution repo (downstream integration target):** `Ghaia-ai/npc-pr-agent` at `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent`
  - relevant workflows: `src/workflows/fill_poster/`, `src/workflows/upgrade_poster/`, `src/workflows/infographic/`
  - relevant services: `src/services/visual_content/` (template_analyzer, template_filler, text_fitter, rendering_service)
  - pdf edit engine today: `src/services/pdf/pdf_editor.py` + `src/services/pdf/pdf_analyzer.py`
**initiating ticket:** clickup `86ewuq5my` -- https://app.clickup.com/t/86ewuq5my (R&D required: dynamic pdf editing approach for poster workflow)
**initiating brief:** `research/raw/2026-04-13_email_minhal_dynamic-pdf-rnd.pdf`
**bug context:** `research/wiki/bug-context.md` -- read this before proposing an approach

---

## context and rules

*   no emojis are allowed in any communication or documentation.
*   all filenames must be in lowercase.
*   do not add claude code attribution or co-authoring footer to git commits.
*   **tracking is exclusively done in clickup list `901813626574`.** do not open github issues or github projects for this R&D; surface gaps, bugs, and follow-ups as clickup tasks.
*   **commit cadence: commit at the end of every logical unit of work.** a "logical unit" = one research note, one benchmark implemented, one experiment analysed, one report section written, one scaffolding change landed. do not batch unrelated changes into a single commit. if a change is non-trivial and takes more than ~30 minutes, land a wip commit mid-way so intermediate state is recoverable.
*   backend: python 3.11+.
*   when updating environment variables or secrets, always modify `.env` files directly -- never modify `.env.example` files during runtime configuration. `.env.example` is a template for onboarding; `.env` is the live config.
*   research findings, benchmark results, and decision rationale go in the `research/` directory.
*   each experiment should be self-contained with its own directory, README, and reproducible setup.
*   sample pdfs and other shared datasets live in `datasets/` (top-level), grouped by source: `datasets/samples/` for the pdfs attached to the initiating brief, `datasets/<name>/` for future collections.
*   **treat this phase as exploratory.** the expectation set by the brief is to identify viable approaches (with pros/cons), validate feasibility through quick experiments or prototypes, and recommend a scalable and maintainable solution -- not to ship a final implementation.
*   **do not modify the solution repo (`npc-pr-agent`) from this repo.** cross-repo changes belong in a dedicated PR on that repo, opened only after an R&D direction is agreed.

## git commit and pr format (required)

for every code change, classify the change type and use this commit subject format:

```text
type(scope): short summary
```

allowed `type` values:
*   `feat` - new user-visible or system-visible functionality
*   `fix` - bug fix
*   `refactor` - code restructuring without behavior change
*   `test` - tests added/updated
*   `docs` - documentation-only change
*   `chore` - maintenance/config/build updates
*   `bench` - benchmark additions or updates
*   `research` - research notes, findings, analysis

**scopes:** `docs` | `infra` | `extract` | `render` | `overlay` | `html-roundtrip` | `layout-ai` | `benchmarks` | `diagrams` | `integration`
<!-- add project-specific scopes as new experiments land -->

pr body should use this structure:

```markdown
Description
- what changed and why

Type of Change
- [ ] New experiment / benchmark
- [ ] Research finding / analysis
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Refactoring (no functional changes)
- [ ] Test updates
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] Documentation update
- [ ] Configuration change

Related Issues
- None

Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] Benchmark results are reproducible
- [ ] I have made corresponding changes to the documentation
```

---

## before you start

### 1. use context7 mcp

before implementing anything from external libraries or frameworks:
```
use context7 mcp to fetch current documentation for any unfamiliar dependency
```

**do NOT rely on training data for library apis -- always fetch current docs.** this is especially important here because the PDF ecosystem (pymupdf, pdfplumber, pdf.js, adobe pdf extract, docling, unstructured, layoutparser) evolves rapidly and apis shift between minor versions.

### 2. check if it already exists

before creating new code:
- check `research/` for prior experiment results or analysis
- check `benchmarks/` for reusable harness code
- check `npc-pr-agent/src/services/visual_content/` for existing poster/template logic that may already solve a sub-problem (e.g. `template_analyzer.py`, `text_fitter.py`)

---

## project structure
```
dynamic-editing-rnd/
  CLAUDE.md                     # this file
  datasets/                     # shared reference data
    samples/                    # sample pdfs from the initiating brief
  research/                     # research findings, notes, comparisons
    raw/                        # primary source material: vendor docs, academic papers, briefs
    wiki/                       # synthesized analyses, citing sources in raw/
  benchmarks/                   # benchmark harness and experiment code
    results/                    # raw benchmark results (gitignored large files)
  diagrams/                     # architecture diagrams, workflow sketches (excalidraw, mermaid)
  reports/
    src/                        # typst source for reports; shared theme.typ
    out/                        # compiled pdfs (gitignored)
    assets/                     # images referenced by reports
```

## reports authoring

reports in this repo follow the same convention as `../avatar-r-n-d/reports/`:

- **format:** typst. source `.typ` in `reports/src/`, compiled pdfs in `reports/out/` (gitignored).
- **shared theme:** `reports/src/theme.typ`. fork to `theme-v<n>.typ` when making breaking style changes; do not mutate an in-use theme.
- **filenames:** `<slug>-v<major>.<minor>.typ` (e.g. `extract-tools-benchmark-v0.1.typ`).
- **front matter required:** `title`, `subtitle`, `date` (iso), `version`, `doc-type`.
- **structure:** tl;dr -> context -> findings -> decision/recommendation. never skip the decision section; R&D reports exist to shape action.
- **compile:** `typst compile reports/src/<slug>.typ reports/out/<slug>.pdf`.

---

## problem space and candidate approaches

read `research/wiki/bug-context.md` first -- it re-frames the problem given the current `npc-pr-agent` implementation.

the bug-aware candidates (supersede the four in the brief):

| # | approach | what it provides | primary risk |
|---|---|---|---|
| a | extract → auto-`PDFFieldDefinition` → existing editor | auto-templatization for pdfs | unreliable glyph reconstruction on illustrator/canva exports |
| b | pdf → html → existing html template path → pdf | reuses the working html pipeline (`template_analyzer`) | round-trip visual fidelity |
| c | overlay (original pdf + edit layer) | fidelity on non-edited regions is automatic | field detection + font matching at edit points |
| d | layout-ai (as a primitive used by a/b/c) | "find the field" becomes solvable | cost, latency, hallucination |

the full experiment sequence, gates, and kill criteria live in `research/wiki/research-strategy.md`.

### user workflow dimension

separately from the technical approach, evaluate:
*   how users declare which values are editable (auto-detect vs. explicit mapping step)
*   whether a per-pdf configuration step is acceptable
*   trade-offs between flexibility and usability

---

## coding standards

### naming conventions

| type | convention | example |
|------|------------|---------|
| files | `snake_case.py` | `layout_extractor.py` |
| classes | `PascalCase` | `PdfExtractor` |
| functions | `snake_case` | `extract_text_boxes()` |
| constants | `UPPER_SNAKE` | `DEFAULT_DPI` |
| private | `_leading_underscore` | `_parse_cmap()` |
| type vars | `PascalCase` | `T`, `BoxT` |

### benchmark code patterns

-   every benchmark must be reproducible: pin versions, document setup steps, seed random
-   capture: extraction latency, rendering latency, visual fidelity (ssim/pixel diff), token/cost where applicable
-   results stored as structured json in `benchmarks/results/`
-   test inputs pulled from `datasets/` (never hardcode absolute paths); record which dataset + file was used in every result json
-   each experiment gets a README with hypothesis, methodology, results summary

---

## testing standards

### running tests
```bash
pytest                              # all tests
pytest tests/ -v                    # verbose
pytest -x                          # stop on first failure
pytest -s                          # show print statements
```

### test naming
```python
# test_<module>.py
# test_<function>_<scenario>_<expected>
def test_extract_text_boxes_multilingual_returns_bidi_order(): ...
```

---

## environment setup

### required environment variables
```bash
# azure openai (for llm/vision experiments)
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_DEPLOYMENT=your-deployment

# adobe pdf services (optional -- benchmark only)
ADOBE_PDF_CLIENT_ID=
ADOBE_PDF_CLIENT_SECRET=

# google vision / document ai (optional -- benchmark only)
GOOGLE_APPLICATION_CREDENTIALS=

# gemini (optional -- layout understanding benchmarks)
GOOGLE_GEMINI_API_KEY=
```

### installing dependencies
```bash
pip install -e ".[dev]"
```

---

## available mcp tools

### context7 (library documentation)
fetch up-to-date docs for any library before implementing:
```
resolve-library-id -> query-docs
```

### code graph context (codebase analysis)
use for structural queries against indexed repos:
-   `find_code` -- keyword search across indexed repos
-   `analyze_code_relationships` -- callers, callees, class hierarchy
-   `execute_cypher_query` -- raw cypher against the code graph

### azure mcp
use for any azure-related operations:
-   `documentation` -- fetch azure docs
-   `bestpractices` / `get_azure_bestpractices` -- coding and deployment best practices
-   `pricing` -- cost estimation
-   `cloudarchitect` -- architecture guidance

### azure resources

all infrastructure must live in the **ghaia-r-n-d** resource group under the **Ghaia_Dev_Customers** subscription (`204b04cb-fa16-4e25-ab22-cb067808eac6`). never create or write to resources in other resource groups.

---

## task tracking (clickup)

tracking is exclusively in clickup list `901813626574` -- https://app.clickup.com/90181533002/v/l/f/901813626574?pr=901810347592. do not open github issues or github projects for this R&D.

### title format
```
[Domain] short imperative description
```

suggested domains: `Extract`, `Render`, `Overlay`, `HtmlRoundtrip`, `LayoutAI`, `Benchmarks`, `Integration`, `Infra`, `Docs`.

### task body

```markdown
## context
[1-2 sentences. what triggered this. link parent task if a subtask.]

## problem / hypothesis
[what's being investigated or what's wrong.]

## approach
[how to investigate / solve. include methodology, metrics to capture.]

## success criteria
- [ ] [testable / measurable outcome]
- [ ] [testable / measurable outcome]

## dependencies
[parent / blocks / blocked by -- linked via clickup relationships]
```

### decomposition

-   experiment = parent task (the what/why). subtasks = work items (the how).
-   each subtask should be completable in 1-3 hours.
-   max 7 subtasks per parent. if more, split the experiment.
-   every subtask must map to a testable or measurable outcome.

---

## getting help

1.  check `research/` for prior findings and decisions
2.  use context7 mcp to fetch current library docs
3.  use code graph context mcp for codebase structural queries
4.  use azure mcp for azure service documentation and best practices
5.  cross-reference existing poster/template logic in `npc-pr-agent/src/services/visual_content/`
6.  ask user for clarification
