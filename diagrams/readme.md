# diagrams

architecture sketches and workflow diagrams for the dynamic pdf editing R&D.

## conventions

- **excalidraw** (`.excalidraw` source) for architecture sketches.
- **mermaid** (`.mmd` in markdown) for flow/sequence diagrams that should render inline on github.
- every diagram has a short sibling `readme.md` or header comment stating: what it shows, when it was drawn, what decision it supports.
- exports to `diagrams/out/` (gitignored); only embed an export in a committed report once the diagram is stable.

## to draw

- [ ] end-to-end flow: upload pdf -> detect editable fields -> user edits -> regenerate pdf (one diagram per candidate approach).
- [ ] system integration: where the chosen approach plugs into `npc-pr-agent/src/services/visual_content/`.
