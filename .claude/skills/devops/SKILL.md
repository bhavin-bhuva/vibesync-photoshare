---
name: devops
description: PhotoHouse DevOps and deployment — local environment doctor/self-heal, production Docker build check, infra/env/CI audit, and deployment preparation with user-confirmed outward actions. Use for "env is broken", "containers won't start", "build the image", "deploy", "set up CI", or infra questions.
argument-hint: doctor | build | audit | deploy-prep | <free-form devops task>
disable-model-invocation: true
---

# /devops

Task: $ARGUMENTS (if empty, use `doctor`)

0. Read `.claude/workflow/git-rules.md`. If the task will edit files (Dockerfile, compose, CI) and
   you're on `main`, create `chore/<kebab-name>` first. Pushes, tags and PRs always need user approval.
1. Dispatch the **devops** agent with the task and the mode (`doctor`, `build`, `audit`, `deploy-prep`,
   or the free-form task).
2. If it returns `STATUS: NEEDS_INPUT` or a non-empty `NEEDS CONFIRMATION` section:
   - Show each one to the user with its exact command, impact and rollback.
   - Ask for explicit approval **per action**. Approving one doesn't approve the next.
   - Run only the approved actions, yourself. Verify each result and report it.
   - Production migrations, deploys, and AWS changes always need fresh confirmation, even if
     approved in an earlier run.
3. If the agent asked for the deployment target (or other durable infra facts) and the user answered,
   record it in `.claude/workflow/learnings/devops.md`, so it's never asked again.
4. Hand-off: what was checked, what was healed, what's waiting on the user.
5. Retro: follow `.claude/workflow/retro.md`.
