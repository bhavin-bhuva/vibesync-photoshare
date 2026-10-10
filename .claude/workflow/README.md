# AI Workflow Architecture

```
/new-feature ──► planner ──► [researcher] ──► database-dev ──► backend-dev ──► frontend-dev
     (manager loop)                                   │                          │
                                                      └──── verify gate ◄────────┘
                                                                 │
                                                           code-reviewer ──► retro

/debug-fix ──► debugger ──► fix-checker ──► code-reviewer ──► retro
                   ▲            │
                   └── fail ────┘

/devops ──► devops (doctor | build | migrate | deploy) ──► retro
                                     (outward actions need user confirmation)

/learn ──► records feedback → learnings/*.md, consolidates, promotes rules into agents
```

## Why the skill is the manager
Claude Code subagents cannot spawn other subagents. So the **skill** (running in the main
conversation) is the manager. It dispatches agents, runs the verification gates, and talks
to you. The `planner` agent does the thinking part of managing: it breaks the work down,
assigns files to agents, and defines the contracts between layers.

## Self-healing loops (bounded)
| Loop | Trigger | Max rounds | Then |
|---|---|---|---|
| Verify gate | tsc/eslint/prisma errors in touched files | 3 | escalate to user with errors |
| Review | BLOCKING review findings | 2 | escalate with open findings |
| Fix check | fix-checker says NOT FIXED | 3 | escalate with all evidence |
| Env doctor | Docker down, stale Prisma client, pending migrations | 1 auto-fix attempt | report diagnosis |
| Knowledge drift | agent reports DRIFT | — | learnings corrected; CLAUDE.md edit *proposed* |

## Self-improvement
1. Every agent ends its report with `LEARNING CANDIDATES` and `DRIFT`.
2. At the end of each run the skill holds a **retro**. It filters the candidates, appends
   accepted ones to `learnings/<domain>.md`, and logs the run in `run-log.md`.
3. Every agent reads its learnings file before starting work, so the next run benefits.
4. `/learn <feedback>` records your feedback at any time. `/learn consolidate` dedupes and
   prunes learnings. A lesson that has fired repeatedly is promoted into the agent's own definition.

### What counts as a learning
Accepted: user feedback; a real defect the reviewer or fix-checker caught; a verification
failure traced to a repeatable pattern; confirmed drift between docs and code.
Rejected: summaries of what was done; one-off facts about a single feature; anything already
in CLAUDE.md or `engineering-rules.md`.

Entry format: `- [YYYY-MM-DD] <imperative rule>. Why: <evidence>. (hits: N)`
Each file is capped at 30 entries. Past the cap, run `/learn consolidate`.

## Files
- `engineering-rules.md` — shared rules + report format for every agent
- `git-rules.md` — branch, commit, push and PR rules (skills own git; agents are read-only)
- `learnings/*.md` — per-domain lessons (planning, research, frontend, backend, database, review, debugging, devops, git)
- `run-log.md` — one entry per skill run (what happened, loops taken, feedback)
