# Contributing to ClawBox

## Before You Start

- Node.js `>= 20`
- Bun `>= 1.1`
- Rust stable toolchain if you touch Tauri packaging
- OpenClaw `>= 2026.3.12` for full integration testing

Install dependencies:

```bash
npm ci
```

## Local Development

Frontend + backend:

```bash
npm run dev
```

Desktop app:

```bash
npm run tauri:dev
```

## Validation Expectations

- Frontend changes:
  - `npm run build:frontend`
- Backend, gateway proxy, config, onboarding:
  - `npm run build:backend`
- Tauri, sidecar, packaging:
  - `npm run sync-version`
  - `cargo check --manifest-path src-tauri/Cargo.toml`

Always run the repository hygiene checks before opening a PR:

```bash
npm run scan:repo
npm run audit:licenses
```

Optional dependency audit:

```bash
npm run audit:deps
```

If you do not have a real OpenClaw runtime available, run the lightweight smoke test:

```bash
npm run smoke:backend
```

## OpenClaw-Facing Changes

Do not guess OpenClaw protocol details.

Recommended reference setup:

1. Clone `openclaw` next to this repository as `../openclaw`, or
2. Write a local `.openclaw-source-path` file that points to an OpenClaw checkout.

When changing chat, sessions, channels, onboarding, or skills, verify the matching OpenClaw version and update [`docs/openclaw-compatibility.md`](docs/openclaw-compatibility.md) if the client contract changes.

## i18n

All user-facing frontend text must use `react-i18next`.

If you add or change copy, update both locale files together:

- `src/locales/en/translation.json`
- `src/locales/zh/translation.json`

## Pull Requests

- Keep changes scoped.
- Explain any OpenClaw compatibility impact.
- Mention commands you ran.
- Say explicitly if you could not validate a platform-specific path.

## Triage Expectations

- ClawBox repository issues are handled on a best-effort basis.
- If a report is actually an OpenClaw daemon or Gateway protocol issue, maintainers may ask you to move it upstream.
- Release-blocking regressions should include exact versions, platform, and reproduction steps.
