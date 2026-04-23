# benchmarks

experiment harnesses and results for the dynamic pdf editing R&D.

## layout

- `datasets/` -- shared test PDFs (sample posters, infographics). commit only small, license-safe samples.
- `results/` -- structured json outputs from benchmark runs. gitignored by default; commit only curated summaries referenced in a report.

## conventions

each experiment is a self-contained subdirectory:

```
benchmarks/
  <experiment-name>/
    readme.md            # hypothesis, methodology, how to reproduce
    requirements.txt     # pinned versions
    run.py               # entrypoint
    analyze.py           # optional: post-processing / plot generation
```

- results filenames: `{experiment}_{isoDate}_{shortHash}.json`.
- every result must include an `environment` block (python version, os, cpu, cold/warm).
- visual fidelity experiments must report per-pixel mae and ssim at minimum.
- paid-api experiments must cap and log actual cost.
