# Retro procedure (run at the end of every skill)

The skill runs this itself, in the main conversation. It is the only writer of `learnings/` and `run-log.md`.

1. **Collect** `LEARNING CANDIDATES` and `DRIFT` from every agent report in this run. Add:
   - each BLOCKING review finding (a defect a dev agent should have prevented)
   - each verification failure that needed a fix round
   - each NOT_FIXED fix-check round
   - any correction or preference the user expressed during the run

2. **Filter.** Keep a candidate only if it is:
   - reusable — it would change behaviour on a *future, different* task
   - evidenced — it traces to something that actually happened in this run
   - new — not already in CLAUDE.md, `engineering-rules.md`, `git-rules.md`, the agent's definition, or the learnings file

   If an existing entry covers it, increment that entry's `(hits: N)` instead of adding a new one.

3. **Write.** Append accepted entries to the right `learnings/<domain>.md`:
   `- [YYYY-MM-DD] <imperative rule>. Why: <evidence>. (hits: 1)`
   Domains: planning, research, frontend, backend, database, review, debugging, devops, git.
   Keep each entry to one line, and make it specific: "Use `formatStorageSize()` before passing
   storage to client props", not "be careful with BigInt".

4. **Drift.** For confirmed drift (docs vs code), add a learning to the relevant domain. If
   CLAUDE.md is wrong, **propose** the exact CLAUDE.md edit to the user. Don't apply it — CLAUDE.md
   is checked in and user-owned.

5. **Promote.** Any entry that reaches `hits: 3` is a recurring failure. Propose moving it into
   the agent's definition in `.claude/agents/<agent>.md` as a rule, and removing it from learnings.
   Apply the promotion only if the user agrees.

6. **Cap.** If a learnings file exceeds 30 entries, tell the user to run `/learn consolidate`.

7. **Log.** Prepend an entry to `run-log.md`:
   ```
   ## YYYY-MM-DD · /skill · <short title>
   Outcome: DONE | PARTIAL | ESCALATED
   Loops: verify N, review N, fix-check N
   Notable: <one line>
   Feedback: <user feedback, or "none">
   ```

8. **Report** to the user in two or three lines: learnings added or updated, any proposed CLAUDE.md
   or agent edits, and an invitation to give feedback (`/learn <feedback>`).
