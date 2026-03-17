# ClawBox / OpenClaw Compatibility

## Supported Baseline

| ClawBox branch | Recommended OpenClaw version |
| --- | --- |
| `main` | `>= 2026.3.12` |

ClawBox is a client for the OpenClaw Gateway. The Gateway is a separate project and runtime.

## Transport Expectations

- Gateway URL shape: `http://127.0.0.1:18789/v1` or equivalent
- Transport: WebSocket RPC upgraded from the configured HTTP URL
- Connect flow: challenge/response handshake with a local device identity
- Optional capability currently used by ClawBox chat: `tool-events`

## Minimum RPC Surface For The Lightweight Smoke Test

The included mock gateway implements the minimum RPC surface needed for repository smoke coverage:

- `models.list`
- `config.get`
- `config.patch`
- `sessions.list`
- `sessions.preview`
- `sessions.patch`
- `sessions.reset`
- `sessions.delete`
- `chat.history`
- `chat.send`

Run it directly:

```bash
node scripts/mock-gateway.mjs --port 18789
```

Or use the end-to-end smoke check:

```bash
npm run smoke:backend
```

## Additional RPC Used By Full Application Features

The real app also expects broader OpenClaw functionality, including:

- Agents: `agents.list`, `agents.create`, `agents.update`, `agents.delete`
- Cron: `cron.status`, `cron.list`, `cron.add`, `cron.update`, `cron.remove`, `cron.run`, `cron.runs`
- Channels and web login: `channels.status`, `channels.logout`, `web.login.start`, `web.login.wait`, `config.schema.lookup`
- Skills: `skills.status`, `skills.update`, `skills.install`
- Soul editing: `agents.files.get`, `agents.files.set`

## Known Incompatibilities

Older OpenClaw builds may fail in the following ways:

- No device pairing or a different connect handshake
- No `tool-events` capability, which weakens streamed tool visibility in chat
- Missing `config.patch` restart semantics
- Missing channel schema lookup or web login RPCs
- Mismatched session payloads for `chat.history` or `sessions.preview`

If you intentionally support an older Gateway, document the downgraded behavior in your PR.
