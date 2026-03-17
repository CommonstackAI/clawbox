---
name: clawbox-chat-stream
description: Use when changing or debugging ClawBox chat sending, SSE streaming, reasoning blocks, tool-call blocks, session synchronization, or title generation across the React frontend and the Bun OpenClaw bridge.
---

# ClawBox Chat Stream

Use this skill when the task involves ClawBox chat flow, assistant streaming, tool event rendering, session history hydration, or title generation.

## Read first

- `src/hooks/useChat.ts`
- `src/services/ai.ts`
- `src/store/chat.ts`
- `src/components/chat/`
- `internal/routes/chat.ts`
- `internal/providers/openclaw-rpc.ts`
- `src/services/api.ts`

## Workflow

1. Map the end-to-end path: UI event -> frontend store/hook -> SSE parser -> backend route -> OpenClaw RPC event.
2. If request or response payloads change, update every consumer in the same task instead of leaving cross-layer drift.
3. For tool-call regressions, verify both streamed events and history rehydration. ClawBox uses live events plus follow-up history reconciliation.
4. For title or unread-count issues, inspect the `finally` path in `src/hooks/useChat.ts` and the corresponding Zustand store updates.

## Verification

- Run `npm run build:frontend`.
- Run `npm run build:backend`.
- If the local gateway is available, use `bun test/openclaw-stream.ts --prompt "..."` as a manual smoke test.

## Guardrails

- Never guess OpenClaw protocol fields or event names.
- Preserve the SSE event types expected by `src/services/ai.ts`.
- Keep message block ordering consistent with the `text`, `reasoning`, and `tool_call` model.
