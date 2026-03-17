# Dependency Policy

## Automated Checks

- `npm run audit:deps` runs `npm audit` against the official npm registry.
- `npm run audit:licenses` summarizes dependency licenses.
- Dependabot is configured for npm and GitHub Actions updates.

## Current Risk Handling

- High-severity vulnerabilities should block releases and be fixed or explicitly removed from the dependency graph.
- Moderate vulnerabilities are triaged case by case when:
  - the upstream fix is breaking,
  - no fix is available yet, or
  - the vulnerable path is not reachable in ClawBox runtime behavior.

## Current Known Follow-Ups

- `react-syntax-highlighter` upgrade should be evaluated carefully because the available audit fix is breaking.
- `extract-zip` currently depends on `yauzl`; if `npm audit` still reports that chain, prefer replacing the dependency over suppressing the issue long term.

## Release Rule

Before tagging a release:

1. Run `npm run audit:deps`.
2. Review any remaining findings.
3. Document accepted residual risk in the release PR or release notes when an upstream fix is unavailable.
