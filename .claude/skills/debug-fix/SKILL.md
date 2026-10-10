---
name: debug-fix
description: Debug and fix a bug or issue in PhotoHouse with a debugger → fix-checker → code-reviewer loop, then record what was learned. Use when the user reports something broken, an error, unexpected behaviour, a failing build, or a regression.
argument-hint: <bug description, error message, or steps to reproduce>
---

# /debug-fix — you are the manager

Bug report: $ARGUMENTS

Agents start cold. Give each one the full bug report plus everything learned so far.

## Phase 0 — Intake
- If the report lacks what's needed to reproduce it (where it happens, expected vs actual, error
  text, plan tier or role), ask the user **once**, briefly, before dispatching. If it's reproducible
  as written, don't ask.
- Read `.claude/workflow/git-rules.md` and `.claude/workflow/learnings/git.md`. Check `git status`,
  the current branch, and the Docker env, as in `/new-feature` Phase 0.
- Before the debugger edits anything, if you're on `main`, create `fix/<kebab-name>` and tell the user. If the bug looks environmental
  (containers down, connection refused, stale Prisma client), run the **devops** agent in doctor mode first.

## Phase 1 — Diagnose and fix
Dispatch **debugger** with the bug report.
- `NEEDS_INPUT` → ask the user, then re-dispatch.
- If the root cause needs a schema change or a larger redesign, stop and ask the user. That may be
  a `/new-feature` job instead.
- Show the user a one-paragraph summary: root cause + fix.

## Phase 2 — Independent check (self-healing, max 3 rounds)
Dispatch **fix-checker** with the bug report and the debugger's full report.
- `FIXED` → continue.
- `NOT_FIXED` / `PARTIAL` → re-dispatch **debugger** with the checker's "FOR DEBUGGER" evidence,
  and say it's round N. Repeat.
- After 3 rounds, escalate to the user with every round's hypothesis and evidence.

## Phase 3 — Review (max 2 fix rounds)
Dispatch **code-reviewer** with the bug report, the root cause, and the changed files.
- BLOCKING findings → back to **debugger**, then re-run fix-checker.

## Phase 4 — Hand-off
Tell the user:
- the root cause (`path:line`)
- the fix
- the verification evidence
- siblings found and not fixed
- anything NOT RUN

Then suggest a commit message (`fix(<scope>): …`, with the root cause in the body) and ask whether
to commit, push and open a PR. Do each only on request, following `git-rules.md`.

## Phase 5 — Retro
Follow `.claude/workflow/retro.md`. Bugs are the richest source of learnings. Always ask: "What rule
would have prevented this bug from being written?" Then add it to the learnings of the agent that
would have written that code (frontend, backend or database).
