---
name: learn
description: Record feedback about how the PhotoHouse agents work so they improve over time, or maintain the learnings store. Use when the user gives feedback on agent output ("the frontend agent keeps…", "don't do X again", "that review was wrong"), or runs /learn consolidate | /learn review | /learn status.
argument-hint: <feedback> | consolidate | review | status
---

# /learn

Input: $ARGUMENTS

Learnings live in `.claude/workflow/learnings/<domain>.md`. Domains: planning, research,
frontend, backend, database, review, debugging, devops, git. Format and rules are in
`.claude/workflow/README.md`.

## Feedback (default)
1. Work out which agents the feedback is about. If it's unclear, ask.
2. Rewrite it as a specific, imperative rule with the evidence:
   `- [YYYY-MM-DD] <rule>. Why: user feedback — <what happened>. (hits: 1)`
3. If an existing entry covers it, update that entry and bump its hits instead.
4. If the feedback contradicts an existing entry or rule, the user's latest word wins. Replace the
   old entry and say so.
5. If the user frames it as a hard rule ("always", "never"), propose adding it directly to
   `.claude/agents/<agent>.md` or `engineering-rules.md` instead. Show the exact edit and apply it
   on approval.
6. Show the user the exact line(s) written.

## consolidate
For each learnings file:
- merge duplicates and sum their hits
- drop entries that are now enforced by an agent definition, or that are stale (verify against
  the code — do the files and functions mentioned still exist?)
- tighten wording

Show a before/after count and the removed entries.

## review
Read `run-log.md` and all the learnings files. Report:
- recurring failure patterns (the same loop type or domain failing repeatedly)
- entries with `hits >= 3`, which are promotion candidates
- agents that escalate often
- concrete proposed edits to agent or skill definitions

Apply them only on approval.

## status
Give a short summary: entries per domain, top-hit entries, last 5 runs from `run-log.md`.
