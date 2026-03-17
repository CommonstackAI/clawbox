# Releasing ClawBox

## Distribution Policy

| Platform | Release status |
| --- | --- |
| macOS | GitHub Releases artifact |
| Windows | GitHub Releases artifact |
| Linux | Source build only for now |

ClawBox releases are published from git tags like `v2026.3.16-1`.

## Release Workflow

- Workflow file: `.github/workflows/release.yml`
- Trigger: push a tag that starts with `v`
- Outputs:
  - macOS `.dmg`
  - Windows `.exe`
  - Combined `CHECKSUMS.txt`
- Release notes source:
  - Preferred: `docs/releases/<tag>.md`
  - Fallback: GitHub auto-generated release notes when that file is missing

## Signing

- Windows signing is optional.
- `scripts/sign-win.mjs` skips signing when `WIN_SIGN_THUMBPRINT` is not set.
- `npm run tauri:build-win:sign-installer` resolves the current `ClawBox_<version>_x64-setup.exe` name from `package.json`.
- The public release workflow builds unsigned artifacts by default unless you extend it with signing secrets.

## Recommended Release Steps

1. Fetch the latest release tags:
   - `git fetch --tags`
2. Generate the next UTC date-based version:
   - `npm run release:version`
3. Copy `.github/release-notes-template.md` to `docs/releases/v<version>.md` and replace the placeholders if you want curated release notes.
4. Run:
   - `npm run scan:repo`
   - `npm run audit:licenses`
   - `npm run audit:deps`
   - `npm run build:frontend`
   - `npm run build:backend`
   - `cargo check --manifest-path src-tauri/Cargo.toml`
5. Commit the versioned files, including `docs/releases/v<version>.md` when you created one.
6. Push a tag like `v2026.3.16-1`.
7. Verify that GitHub Releases only shows the final `.dmg`, `.exe`, and `CHECKSUMS.txt`.

The release workflow verifies that `github.ref_name` exactly matches `v<package.json version>` before any build starts. It uses `docs/releases/<tag>.md` as the release body when present; otherwise it falls back to GitHub-generated notes.

## Source Builds

Linux users should currently build from source:

```bash
npm ci
npm run build:frontend
npm run build:backend
cargo check --manifest-path src-tauri/Cargo.toml
```
