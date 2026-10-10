---
name: new-feature
description: Build a new feature (or extend an existing one) in PhotoHouse end-to-end with a team of agents — planner, researcher, database-dev, backend-dev, frontend-dev, code-reviewer — with verification gates, review loops, and a learning retro. Use when the user asks to add, build, implement, or extend functionality.
argument-hint: <feature description>
---

# /new-feature — you are the manager

You orchestrate the agents in this conversation. Subagents can't talk to each other or to the
user, so all coordination goes through you. Each agent starts cold: pass it everything it needs
(the request, plan excerpt, contracts, prior agents' reported signatures, file ownership).

Feature request: $ARGUMENTS

## Phase 0 — Setup
- Read `.claude/workflow/README.md` once, if you haven't this session.
- Read `.claude/workflow/git-rules.md` and `.claude/workflow/learnings/git.md`.
- Check `git status` and the current branch. If there are uncommitted changes unrelated to this
  request, ask the user before starting, so the review diff isn't polluted.
- After the plan is approved and before Phase 3, if you're on `main`, create
  `feature/<kebab-name>` and tell the user.
- Check `command -v docker && docker compose ps`. If the env is down, run the `devops` agent in
  doctor mode first, or tell the user that verification will be limited.

## Phase 1 — Plan
1. Dispatch **planner** with the full request.
2. If the planner returns `NEEDS_INPUT`, ask the user (AskUserQuestion), then re-dispatch with the answers.
3. Show the user the plan: goal, out of scope, tasks, success criteria. Keep it short. **Wait for
   approval** before any code is written. Treat the user's edits to the plan as feedback for the retro.

## Phase 2 — Research (only if the plan lists research)
Dispatch **researcher** with the specific questions. If findings change the plan, update it and
tell the user what changed.

## Phase 3 — Build
Dispatch in dependency order: **database-dev → backend-dev → frontend-dev**. Skip any layer the
plan doesn't need. Run agents in parallel only when the plan says their file sets don't overlap.

Pass each agent:
- the request
- its task block
- the contracts
- the actual signatures reported by earlier agents, which override the planned contract if they differ

After each agent:
- `DONE` → continue.
- `NEEDS_INPUT` → ask the user, then re-dispatch.
- `BLOCKED` → decide whether a different agent should handle it, or escalate to the user.
- Reported a contract change → check that downstream tasks still fit.

## Phase 4 — Verify gate (self-healing, max 3 rounds)
Run these yourself:
- `docker compose exec -T app npx tsc --noEmit`
- `npx eslint` on every changed file
- `prisma validate`, if the schema changed
- the plan's behavioural success criteria, where they can be run

On failure, send the **exact error output** to the agent that owns the failing file. Repeat. After
3 failed rounds, stop and escalate to the user with the errors and what was tried.

## Phase 5 — Review (max 2 fix rounds)
Dispatch **code-reviewer** with the request, the plan, and the list of changed files.
- `APPROVE` → continue.
- `CHANGES_REQUIRED` → route each BLOCKING finding to its owner agent, then re-run Phase 4 and
  re-review. Tell the reviewer it's a re-review, so it focuses on the delta and on whether the
  findings were resolved.
- Show SHOULD_FIX and NIT findings to the user. Don't auto-fix them unless the user says so.
  After 2 rounds with BLOCKING findings still open, escalate.

## Phase 6 — Hand-off
Tell the user:
- what was built
- files changed
- verification results, including anything NOT RUN
- open SHOULD_FIX items
- manual test steps they should try

Then suggest a commit message (`feat(<scope>): …`) and ask whether to commit, push and open a PR.
Do each only on request, following `git-rules.md`: stage files by name, check staged files for
secrets, use the PR body format.

## Phase 7 — Retro
Follow `.claude/workflow/retro.md`.
