---
globs: ["research/**"]
---

- every file under `research/raw/` must preserve its original filename and cite provenance at the top (source url, date fetched, license).
- files under `research/wiki/` are *our* synthesized notes. they must cite the specific file(s) in `research/raw/` they derive from, by relative path.
- never paste large blobs from paid apis (adobe pdf extract, openai vision) into wiki notes without trimming. keep sample outputs small and representative.
- each experiment directory must contain a `readme.md` with: hypothesis, methodology, dataset used (path under `benchmarks/datasets/`), results summary, and a "next steps" bullet.
- write findings in decision-oriented language: "tool X is / is not viable for Y because Z." avoid passive summaries.
