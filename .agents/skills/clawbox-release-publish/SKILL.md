---
name: clawbox-release-publish
description: Use when the user asks to prepare, cut, validate, tag, or publish a ClawBox desktop release. Covers the UTC date-based version flow (`npm run release:version`), release validation commands, release commit/tag creation, and pushing the matching `v` tag for the current package version that triggers GitHub Releases. Do not use for changing packaging or versioning logic itself; use the packaging skill for that.
---

# ClawBox Release Publish

Use this skill to run the current ClawBox release process end to end.

## Read first

- `docs/releasing.md`
- `.github/release-notes-template.md`
- `docs/releases/`
- `package.json`
- `scripts/release-version.mjs`
- `scripts/sync-version.mjs`
- `.github/workflows/release.yml`
- `git status --short --branch`

If the user also asks to create the commit or push the branch/tag, read `.agents/skills/clawbox-git-commit-push/SKILL.md`.

## Workflow

1. Inspect the worktree before starting. Stop if unrelated dirty changes would be mixed into the release.
2. Fetch tags with `git fetch --tags` before generating a version. The UTC day sequence is based on local tags.
3. Run `npm run release:version`. This updates `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
4. Read back the selected version with `node -p "require('./package.json').version"` and use that exact value for the release commit and tag.
5. If the user wants curated release notes, copy `.github/release-notes-template.md` to `docs/releases/v<version>.md` and fill it in before the release commit. If that file is missing, GitHub falls back to auto-generated notes.
6. Run the standard release validation set unless the user explicitly scopes it down:
   - `npm run scan:repo`
   - `npm run audit:licenses`
   - `npm run audit:deps`
   - `npm run build:frontend`
   - `npm run build:backend`
   - `cargo check --manifest-path src-tauri/Cargo.toml`
7. If the user wants the release prepared but not published, stop after reporting the version, changed files, release notes status, and validation status.
8. If the user wants the release published, create a focused commit for the release files, create tag `v<version>`, push the branch, then push the tag.

## Expected commands

Prepare the next release version:

```bash
git fetch --tags
npm run release:version
```

Validate the release:

```bash
npm run scan:repo
npm run audit:licenses
npm run audit:deps
npm run build:frontend
npm run build:backend
cargo check --manifest-path src-tauri/Cargo.toml
```

Publish after validation:

```bash
VERSION=$(node -p "require('./package.json').version")
cp .github/release-notes-template.md "docs/releases/v${VERSION}.md"

git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml docs/releases/v${VERSION}.md
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin HEAD
git push origin "v$VERSION"
```

## Guardrails

- Do not hand-edit the version fields when the goal is to cut a release. Use `npm run release:version`.
- Do not create or push a tag that differs from `v<package.json version>`. The release workflow rejects mismatches.
- Do not silently skip `git fetch --tags`; without it, the same UTC day can generate the wrong `-N`.
- Do not stage unrelated files, generated artifacts, or user work that is outside the release scope.
- Do not assume release notes are mandatory; if `docs/releases/<tag>.md` is absent, the workflow falls back to GitHub-generated notes.
- Do not claim Windows signing was performed unless `WIN_SIGN_THUMBPRINT` or equivalent signing prerequisites were actually available.
- If validation is incomplete, say exactly which commands were skipped or failed.

## Verification

- Confirm `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` all reflect the same version after `npm run release:version`.
- Run `npm run sync-version` after version generation only when you need to verify the sync chain; it should not create additional diffs.
- After commit/tag creation, report the version, commit hash, branch, and pushed tag.
