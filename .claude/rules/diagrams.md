---
globs: ["diagrams/**"]
---

- prefer excalidraw (`.excalidraw` source) for architecture sketches; prefer mermaid (`.mmd` in markdown) for flow/sequence diagrams that should render inline on github.
- every diagram must have a short sibling `readme.md` or header comment stating: what it shows, when it was drawn, and what decision it supports. undated diagrams go stale fast.
- do not export diagrams to png/svg into the repo unless they appear in a committed report; generated images belong in `diagrams/out/` (gitignored).
