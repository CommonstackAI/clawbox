# Security Policy

## Supported Versions

The latest `main` branch is the supported security target for this repository.

## Reporting A Vulnerability

Please use GitHub private vulnerability reporting for this repository if it is enabled.

If private reporting is not available:

- Do not open a public issue with exploit details or credentials.
- Contact a maintainer directly through GitHub first.
- Include the affected commit, platform, and reproduction steps.
- Redact any API keys, device tokens, session data, or local file paths.

## Secret Handling

- Never commit `.env` files, certificates, tokens, or private keys.
- ClawBox reads local runtime state from `~/.wrapperbox` and may connect to OpenClaw data in `~/.openclaw`; neither directory belongs in bug reports unless fully redacted.
- Windows signing is optional. If `WIN_SIGN_THUMBPRINT` is not set, the signing script skips signing by design.

## What To Include

- ClawBox version
- OpenClaw version
- OS and architecture
- Whether the issue reproduces against the real Gateway or the lightweight smoke test

## Dependency Review

- Run `npm run audit:deps` against the official npm registry before release work.
- Run `npm run audit:licenses` before adding new direct dependencies.
- Current dependency handling guidance lives in [`docs/dependency-policy.md`](docs/dependency-policy.md).
