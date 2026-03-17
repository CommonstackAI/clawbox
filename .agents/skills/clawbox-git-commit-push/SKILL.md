---
name: clawbox-git-commit-push
description: Use when the user asks to stage ClawBox changes, write a git commit, create a non-interactive commit, or push the current branch safely without mixing unrelated worktree changes.
---

# ClawBox Git Commit Push

Use this skill when the task is to prepare a clean git commit and push it from the current ClawBox repository.

## Read first

- `git status --short --branch`
- `git diff --stat`
- `git diff --cached --stat`
- Targeted `git diff -- <paths>` for files intended for the commit

## Workflow

1. Inspect repo state before staging anything.
2. Confirm the requested commit scope from actual modified files, not assumptions.
3. Stage only intended paths with `git add <paths>`.
4. Create the commit with `git commit -m "..."`.
5. Check upstream with `git rev-parse --abbrev-ref --symbolic-full-name @{u}`.
6. Use `git push` when upstream exists, or `git push -u origin <branch>` when the target is obvious.
7. Report the commit hash, branch, and push result.

## Guardrails

- Never use destructive commands such as `git reset --hard`, `git checkout --`, rebase, or force-push unless the user explicitly asks.
- Never stage unrelated or generated files silently.
- Never amend a commit unless explicitly requested.
- Prefer non-interactive git commands only.
- Stop and ask when branch target, commit scope, or staged changes are ambiguous.

## Verification

- Run `git status --short --branch` before and after the commit.
- Run `git log --oneline -1` after the commit.
- If pushed, verify the branch is no longer ahead with `git status --short --branch`.
