# Devops learnings

Read before starting. Written only by the orchestrating skill's retro or by `/learn`.
Format: `- [YYYY-MM-DD] <imperative rule>. Why: <evidence>. (hits: N)` — max 30 entries.

- [2026-10-10] Check `command -v docker` before anything else; when setup ran, `docker` was not on the PATH of Claude's shell and the host had no `node_modules`, so every verification command fails without it. Why: observed during workflow setup. (hits: 1)
