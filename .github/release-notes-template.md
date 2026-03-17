<!-- Copy this file to docs/releases/<tag>.md and replace the placeholders before pushing the release tag. -->

# ClawBox {{version}} {{channel_label}}

{{one_line_summary}}

## Important

- {{important_note_1}}
- {{important_note_2}}
- {{important_note_3}}

Delete this section if there is nothing release-blocking, recovery-related, or migration-related to call out.

## What's Changed

### Desktop App

- {{desktop_change_1}}
- {{desktop_change_2}}
- {{desktop_change_3}}

### Packaging and Distribution

- {{packaging_change_1}}
- {{packaging_change_2}}

### Docs and Workflow

- {{docs_change_1}}
- {{docs_change_2}}

Delete any subsection that has no meaningful entries. Prefer short, user-relevant bullets over raw commit dumps.

## Upgrade Notes

- App version: `{{app_version}}`
- Git tag: `{{tag}}`
- Minimum supported platform notes: {{platform_note}}
- Signing status: {{signing_note}}

If the release includes a recovery tag, hotfix-only tag, or re-published artifact set, explain the relationship between the app version and the Git tag here.

## Assets

- macOS: `{{macos_asset_name}}`
- Windows: `{{windows_asset_name}}`
- Checksums: `CHECKSUMS.txt`

List only the assets users should actually download. Do not document internal bundle files here.

## Full Changelog

{{compare_url}}

Example:
`https://github.com/CommonstackAI/clawbox/compare/{{previous_tag}}...{{tag}}`
