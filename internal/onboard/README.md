# Onboard State Management

## Overview

The onboard system now tracks setup state in `~/.clawbox/onboard-state.json` to ensure proper environment detection across sessions.

## State File Location

- **Path**: `~/.clawbox/onboard-state.json`
- **Format**: JSON

## State Schema

```json
{
  "completed": true,
  "mode": "portable",
  "timestamp": "2026-03-11T13:30:00.000Z",
  "nodeVersion": "v24.14.0",
  "openclawVersion": "2026.3.12"
}
```

### Fields

- `completed` (boolean): Whether onboard has been completed
- `mode` ("portable" | "system"): Environment mode chosen during onboard
- `timestamp` (string): ISO timestamp of last onboard completion
- `nodeVersion` (string, optional): Node.js version in use
- `openclawVersion` (string, optional): OpenClaw version installed

## Onboard Trigger Logic

The application enters onboard mode when:

1. **State file missing**: `~/.clawbox/onboard-state.json` does not exist
2. **State incomplete**: `completed` field is `false`
3. **Portable runtime missing**: Mode is `portable` but `~/.clawbox` directory is missing
4. **OpenClaw config missing**: `~/.openclaw/openclaw.json` does not exist
5. **Provider not configured**: OpenClaw config exists but has no provider configured

## Benefits

### Before
- Only checked `~/.openclaw/openclaw.json`
- Deleting `~/.clawbox` (portable runtime) did not trigger re-onboard
- No way to detect which mode was used

### After
- Tracks onboard state in `~/.clawbox/onboard-state.json`
- Deleting `~/.clawbox` automatically triggers re-onboard
- Records environment mode for better diagnostics
- Portable mode validates runtime directory still exists

## State Lifecycle

1. **First Launch**: No state file → enters onboard
2. **Env Setup Complete**: Writes state with `mode`, `nodeVersion`, `openclawVersion`
3. **Provider Config Complete**: Updates `timestamp`
4. **User Deletes `.clawbox`**: State file gone → re-enters onboard
5. **User Deletes `.openclaw`**: Config missing → re-enters onboard

## Implementation Files

- `internal/onboard/onboard-state.ts` - State management functions
- `internal/onboard/constants.ts` - Path constants
- `internal/onboard/routes.ts` - API endpoints that read/write state
