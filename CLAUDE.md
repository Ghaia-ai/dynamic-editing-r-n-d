# claude.md

> AI-native project documentation for R&D: Dynamic PDF Editing for Poster Workflow.

## project purpose

this is a focused R&D project to investigate and prototype a dynamic PDF editing approach for the poster/infographic workflow in the NPC (National Planning Council) content agent.

the problem (from the initiating brief): the target PDFs behave like flattened visual canvases rather than structured documents. text elements are positioned arbitrarily, with no reliable semantic mapping between headings, labels, and their corresponding values. each PDF has a unique layout, no reusable template exists, and users need to upload such PDFs and modify specific values dynamically while preserving exact visual design, layout precision, and formatting fidelity.

**repo:** `Ghaia-ai/dynamic-editing-r-n-d`
**github project:** `r-n-d-prototypes` (org-level, Ghaia-ai)
**solution repo (downstream integration target):** `Ghaia-ai/npc-pr-agent` at `/Users/elaabouazza/Desktop/Ghaia/npc-pr-agent`
  - relevant workflows: `src/workflows/fill_poster/`, `src/workflows/upgrade_poster/`, `src/workflows/infographic/`
  - relevant services: `src/services/visual_content/` (template_analyzer, template_filler, text_fitter, rendering_service)
**initiating ticket:** clickup `86ewuq5my` (R&D required: dynamic pdf editing approach for poster workflow)
**initiating brief:** `dynamic-pdf-rnd1.pdf` (email from minhal abdul sami, 2026-04-13)

---

## context and rules

*   no emojis are allowed in any communication or documentation.
*   all filenames must be in lowercase.
*   do not add claude code attribution or co-authoring footer to git commits.
*   when a new gap, bug, or feature idea comes up during work, create a github issue on `Ghaia-ai/dynamic-editing-r-n-d` using `gh issue create`. do not wait -- track it immediately so nothing is lost.
*   **every issue created in the repo must be linked to the `r-n-d-prototypes` github project.** after creating an issue, always add it to the project and fill out all relevant project fields (status, priority, size, work type).
*   **github issues are the single source of truth for task tracking.** all work items, priorities, and refinement live in issues.
*   backend: python 3.11+.
*   when updating environment variables or secrets, always modify `.env` files directly -- never modify `.env.example` files during runtime configuration. `.env.example` is a template for onboarding; `.env` is the live config.
*   research findings, benchmark results, and decision rationale go in the `research/` directory.
*   each experiment should be self-contained with its own directory, README, and reproducible setup.
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
  research/                     # research findings, notes, comparisons
    raw/                        # primary source material: vendor docs, sample pdfs, academic papers
    wiki/                       # synthesized analyses, citing sources in raw/
  benchmarks/                   # benchmark harness and experiment code
    datasets/                   # shared test pdfs (sample posters, infographics)
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

the brief frames four candidate approaches to evaluate. each should get at least one experiment in `research/` or `benchmarks/`:

1.  **pdf to structured format conversion**
    *   can we reliably extract layout-aware data (text + positioning)?
    *   tools to evaluate: pymupdf, pdfplumber, adobe pdf extract api, docling, unstructured.io
    *   success metric: round-trip fidelity when re-rendering extracted data

2.  **html-based editing workflow (pdf -> html -> pdf)**
    *   feasibility of converting PDFs into pixel-perfect HTML/CSS
    *   tools to evaluate: pdf2htmlex, mutool convert -F html, pdf.js, commercial converters
    *   success metric: visual diff (ssim / per-pixel) against original after round-trip

3.  **overlay-based editing**
    *   keep the original PDF as an immutable background; place editable text layers on top at detected text boxes
    *   success metric: user can change values without disturbing non-edited regions

4.  **ai-assisted layout understanding**
    *   detect regions, labels, and values dynamically (e.g. layoutlm, doclaynet, donut, gpt-4o vision)
    *   success metric: precision/recall on label-value pair detection across the sample set

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

## issue creation protocol

when creating issues on `Ghaia-ai/dynamic-editing-r-n-d`, follow this format exactly.

**critical: every issue must be linked to the `r-n-d-prototypes` github project immediately after creation.**

### title format
```
[Domain] short imperative description
```

suggested domains: `Extract`, `Render`, `Overlay`, `HtmlRoundtrip`, `LayoutAI`, `Benchmarks`, `Integration`, `Infra`, `Docs`.

### project fields (set on the `r-n-d-prototypes` project board)

| field | options |
|-------|---------|
| Status | Backlog, Explore, Design, Build, Validate, Done |
| Work Type | Research, Spike, Benchmark, Feature, Bug, Tech Debt |
| Priority | Critical, High, Medium, Low |
| Size | XS, S, M, L, XL |

### labels

**work type tags:**
-   `benchmark`, `research`, `infra`, `dataset`

**approach tags (this R&D):**
-   `approach:extract`, `approach:html-roundtrip`, `approach:overlay`, `approach:layout-ai`

**workflow signals:**
-   `blocked` -- waiting on another issue or external dependency
-   `needs-decision` -- requires architecture call
-   `quick-win` -- under a day, good for momentum
-   `has-spec` -- issue body is a complete implementation spec

### issue body

```markdown
## context
[1-2 sentences. what triggered this. link parent issue if sub-issue.]

## problem / hypothesis
[what's being investigated or what's wrong.]

## approach
[how to investigate / solve. include methodology, metrics to capture.]

## success criteria
- [ ] [testable / measurable outcome]
- [ ] [testable / measurable outcome]

## dependencies
Blocks: #N | Blocked by: #N | Related: #N
```

### decomposition

-   experiment = parent issue (the what/why). sub-issues = tasks (the how).
-   each sub-issue should be completable in 1-3 hours.
-   max 7 sub-issues per parent. if more, split the experiment.
-   every sub-issue must map to a testable or measurable outcome.

---

## getting help

1.  check `research/` for prior findings and decisions
2.  use context7 mcp to fetch current library docs
3.  use code graph context mcp for codebase structural queries
4.  use azure mcp for azure service documentation and best practices
5.  cross-reference existing poster/template logic in `npc-pr-agent/src/services/visual_content/`
6.  ask user for clarification
