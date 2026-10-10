# Engineering Rules (all development agents)

Every agent that writes or reviews code follows these rules. Project facts live in `CLAUDE.md`;
lessons learned live in `.claude/workflow/learnings/`. Read both before starting.

## 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, return `NEEDS_INPUT` instead of guessing.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing.

## 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Unrelated dead code: mention it in your report, don't delete it.
- Remove imports/variables/functions that YOUR changes made unused. Leave pre-existing dead code.
- Only edit files assigned to you. If you need a change in another agent's file, report it.

The test: every changed line traces directly to the request.

## 4. Goal-Driven Execution
Define success criteria. Loop until verified.

This project has **no test runner** — do not add one unless asked. Verification is:

| Check | Command (run from repo root) |
|---|---|
| Types | `docker compose exec -T app npx tsc --noEmit` |
| Lint (changed files) | `docker compose exec -T app npx eslint <file> <file>…` |
| Prisma schema | `docker compose exec -T app npx prisma validate` |
| Route responds | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<path>` |
| Server errors | `docker compose logs app --since 5m 2>&1 \| tail -50` |

- **Baseline first.** Before editing, run type-check and note pre-existing errors. You are responsible
  only for errors in files you touched — but never introduce new ones.
- **Don't run `npm run build` inside the dev container** — it shares `.next` with the running dev server.
  Production builds are the DevOps agent's job.
- **If Docker isn't available** (`docker: command not found`, or the containers are down), say so in
  the report. Never claim verification passed when it didn't run.

For multi-step work, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

## Git
Agents use **read-only git only**: `status`, `diff`, `log`, `show`, `blame`, `grep`. Never stage,
commit, switch branches, stash, reset or push. The orchestrating skill owns git. Full rules are in
`.claude/workflow/git-rules.md`.

## Report format (every agent ends with this)

```
STATUS: DONE | BLOCKED | NEEDS_INPUT
SUMMARY: one or two sentences
FILES CHANGED: path — what changed (or "none")
VERIFICATION: each command run → result (PASS / FAIL + key output / NOT RUN + why)
ASSUMPTIONS: anything you decided without being told
OPEN QUESTIONS: what the user or another agent must answer (empty if none)
DRIFT: places where CLAUDE.md, learnings, or these rules contradict the actual code (empty if none)
LEARNING CANDIDATES: reusable lessons from this task, one line each, with the evidence (empty if none)
```

Learning candidates are lessons that would have prevented a mistake or saved time — not a
summary of what you did. Agents never write to `learnings/` directly; the orchestrating skill does.
