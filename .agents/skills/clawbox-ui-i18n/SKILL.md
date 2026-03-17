---
name: clawbox-ui-i18n
description: Use when changing ClawBox React components, dialogs, settings pages, sidebar flows, or any user-facing copy that must stay aligned with react-i18next and the project's bilingual locale files.
---

# ClawBox UI i18n

Use this skill for ClawBox frontend UI work, copy changes, settings screens, onboarding screens, dialogs, and general React component changes.

## Read first

- The target component under `src/components/`
- Any matching Zustand store under `src/store/`
- `src/services/api.ts` if the component loads or mutates backend data
- `src/locales/en/translation.json`
- `src/locales/zh/translation.json`

## Workflow

1. Add or update translation keys before wiring UI text.
2. Keep translation keys nested by feature instead of flattening unrelated labels into generic buckets.
3. Prefer existing store actions and selectors over adding duplicate component-local copies of remote state.
4. If a component opens dialogs or renders chat blocks, inspect the sibling components in the same feature folder before changing layout or behavior.

## Verification

- Update both locale files in the same diff.
- Run `npm run build:frontend`.

## Guardrails

- Do not leave hard-coded user-facing strings in JSX.
- Preserve existing Radix UI and Tailwind patterns unless the task explicitly redesigns the feature.
- Keep frontend API usage centralized in service modules where possible.
