---
globs: ["benchmarks/**"]
---

- all benchmark results go to `benchmarks/results/` as structured json. one file per run, named `{experiment}_{isoDate}_{shortHash}.json`.
- benchmark runs are reproducible or they don't exist: pin every version in the experiment's requirements file, seed all randomness, record the exact dataset path.
- visual fidelity benchmarks must report at least two metrics: per-pixel mae and ssim. optionally include a perceptual metric (lpips) when comparing text-heavy regions.
- latency numbers are meaningless without an environment block in the json: python version, os, cpu model, whether the run was cold or warm.
- never commit raw pdf renders, ground-truth images, or large pickles. the results json summarizes; artifacts stay local.
- when a benchmark depends on a paid api (adobe, openai), cap cost in the harness and log actual cost in the results json.
