# Git Rules (basic — v1)

These rules follow the conventions already in this repo's history. Lessons go in `learnings/git.md`.

## Who touches git
- **Agents (subagents)**: read-only git only — `status`, `diff`, `log`, `show`, `blame`, `grep`.
  Never `add`, `commit`, `checkout`, `switch`, `branch`, `stash`, `reset`, `rebase`, `merge`, `push`.
  The skill owns all git state changes.
- **Skills (main conversation)**: create branches and stage changes as below. Commit, push and open
  PRs **only when the user asks**.

## Branches
- Never commit directly to `main`. All work merges to `main` through a PR.
- Branch names: `feature/<kebab-name>`, `fix/<kebab-name>`, `docs/<kebab-name>`, `chore/<kebab-name>`.
  Examples: `feature/ai-photo-culling`, `docs/project-documentation`.
- Before starting code changes, the skill checks `git status` and the current branch:
  - On `main` with a clean tree → create the branch (`git switch -c <type>/<name>`) and tell the user.
  - Uncommitted changes that aren't part of this task → ask the user before branching or editing.
  - Already on a matching feature branch → stay on it.

## Commits
- Format: `<type>(<optional scope>): <imperative summary>`. Keep the summary to 72 characters or
  fewer, lowercase after the colon.
  Types: `feat`, `fix`, `docs`, `chore`, `refactor`. Example: `fix(share): verify cookie on selection download`.
- Body (optional): explain **why** in 1–3 lines when it isn't obvious from the summary.
- One logical change per commit. A schema change and its migration folder go in the same commit.
- Stage files **by name**. Never use `git add -A`, `git add .`, or `git commit -a`.
- Before committing, check `git diff --cached --name-only`. Never commit `.env*`, `*.pem`,
  `src/generated/prisma/`, `.next/`, scratch scripts, or secrets of any kind.
- End the message with the attribution lines the harness provides, if any.

## Push and PRs (user request only)
- `git push -u origin <branch>`, then `gh pr create --base main`.
- PR title: same format as commits. PR body:
  - **Summary**: what and why
  - **Changes**: the files and areas touched
  - **Verification**: commands run → results, with anything NOT RUN listed explicitly
  - **Manual test steps**
- End the PR body with the attribution line the harness provides, if any.

## Never, without an explicit request for that exact action
- force-push (`--force`, `--force-with-lease`)
- rewrite history that's already pushed (`rebase`, `commit --amend` on pushed commits)
- `reset --hard`, `clean -f`, `checkout -- <file>` or `restore` on the user's changes
- delete branches, local or remote
- skip hooks (`--no-verify`)
- merge PRs, or push to `main`
