---
name: clawbox-release-packaging
description: Use when changing ClawBox Tauri packaging, sidecar bootstrapping, version synchronization, Bun backend compilation, or release-related scripts and configuration. This includes the UTC date-based version generator, Tauri and Cargo version sync, Windows installer signing helpers, and GitHub release workflow guards. Do not use for actually cutting and pushing a release tag; use the release publish skill for that.
---

# ClawBox Release Packaging

Use this skill when the task involves ClawBox versioning, Tauri configuration, backend binary packaging, sidecar lifecycle, or release build scripts.

## Read first

- `package.json`
- `docs/releasing.md`
- `.github/release-notes-template.md`
- `docs/releases/`
- `scripts/collect-release-assets.mjs`
- `scripts/release-version.mjs`
- `scripts/sync-version.mjs`
- `scripts/sign-win-installer.mjs`
- `scripts/build-backend.mjs`
- `.github/workflows/release.yml`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `internal/onboard/` if the task also affects runtime bootstrap or environment setup

## Workflow

1. Identify which layer is changing: UTC version generation, version synchronization, Bun backend compile output, Tauri shell, release workflow guard, release-notes lookup, release-asset filtering, or installer/signing script.
2. Preserve `package.json` as the single source of truth for the app version. Any version automation must keep `package-lock.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` aligned.
3. Keep the UTC date-based version format semver-safe. The current release flow uses `YYYY.M.D-N`, with `git fetch --tags` plus local `vYYYY.M.D-N` tags determining the next sequence.
4. Keep sidecar naming and resource lookup behavior aligned with `scripts/build-backend.mjs` and `src-tauri/src/lib.rs`.
5. Keep Windows installer signing dynamic. `tauri:build-win:sign-installer` should resolve `ClawBox_<version>_x64-setup.exe` from `package.json`, not from a hard-coded filename.
6. Keep release publication scoped to user-facing assets only. The workflow should publish final `.dmg`, `.exe`, and the combined `CHECKSUMS.txt`, not the entire Tauri bundle tree.
7. Keep release notes lookup aligned with the documented flow. Hand-written notes live at `docs/releases/<tag>.md`, with GitHub-generated notes as the fallback when the file is absent.
8. If the change touches release publication behavior rather than packaging/configuration, hand off to `clawbox-release-publish` instead of extending this skill.
9. If the change touches Windows signing or platform-specific installers, note any credentials or OS environments you could not validate.

## Verification

- Run `node scripts/release-version.mjs --dry-run` or `npm run release:version -- --dry-run` when changing release-version logic.
- Run `npm run sync-version`.
- Run `npm run build:backend`.
- If Rust is available, run `cargo check --manifest-path src-tauri/Cargo.toml`.
- If the change touches the release workflow, confirm that the workflow still rejects a tag/version mismatch, still publishes only final user assets, and still prefers `docs/releases/<tag>.md` over auto-generated notes when that file exists.

## Guardrails

- Do not guess bundle resource paths or binary names.
- Do not hand-edit version values when changing the automated version flow; keep `npm version ... --no-git-tag-version` as the writer for `package.json` and `package-lock.json`.
- Do not reintroduce a hard-coded Windows installer filename into `package.json` scripts.
- Do not blur the boundary between "release packaging/config" and "actual release execution"; use `clawbox-release-publish` when the task is to cut, commit, tag, or push a release.
- Keep cross-platform branches explicit instead of merging them into a single simplified path.
- Mention any skipped platform validation in the final response.
