# Phase 3 verification notes — sessions & streaming (SDK 0.8.42)

## Where sessions run (critical architecture fact)

- `backend: "cloud"` + **no computer** → SDK creates a **managed sandbox**
  per session. Tools would run there. NOT what LettaDock wants for the
  owner's agents (his tools run on ibook26 via letta server).
- `backend: "cloud"` + `computer: {name|deviceId}` → session runs on the
  registered remote computer. Owner's machine `ibook26` is registered and
  **online** (verified via `client.computers.list()`).
- Session protocol: SDK opens two hosted relay WebSockets (control/stream)
  to api.letta.com; same protocol as App Server.
- Browser portable client (`@letta-ai/letta-agent-sdk/client`) exports the
  SAME LettaAgentClient class WITH createSession/resumeSession (verified on
  prototype). Local backend is excluded there, cloud/remote allowed.
  Sessions over hosted relays work from browser with `webSocketAuth:
  "query"` (browser cannot set WS headers).

## Session interface (verified in types.d.ts)

- `client.resumeSession(id, options?)` — id = `agent-xxx` (default
  conversation) or `conv-xxx` (specific). Returns LettaCodeSession.
- `session.send(message, options?)` — message: string |
  TextContent/ImageContent[]; options: `{ otid }`.
- `session.stream(): AsyncGenerator<SDKMessage>` — one pass per turn,
  terminal after `result` message.
- `session.ready()` → `{ agentId, conversationId, model, tools }`.
- `session.abort()`, `session.close()` (close() sync, AsyncDisposable too).
- `session.bootstrapState({ order, limit })` → initial projection for
  hydration (docs pattern for opening saved conversation).
- `session.onDeviceStatus(listener)` → unsubscribe; `getDeviceStatus()`.
- `session.listModels() / updateModel()`.

## SDKMessage stream event types (types.d.ts 939)

`init | assistant | tool_call | tool_result | reasoning | result |
stream_event | error | retry | queue_update | loop_status`

- `assistant`: `{ type, content: string, uuid, otid?, seqId?, runId? }`
- `tool_call`: `{ type, toolCallId, toolName, toolInput, rawArguments?,
  uuid, runId? }`
- `stream_event`: `{ type:"stream_event", event: payload, uuid }`; payload
  variants: delta (`{type, index, delta:{text|reasoning}}`), message-shaped
  (`message_type`, content, tool_call…), unknown.
- `error`: `{ message, errorCode?, errorDetail?, stopReason, runId? }`
- `result`: `{ success, result?, error?, stopReason?, durationMs,
  conversationId, runIds? }`

## Streaming text deltas

- `extractStreamTextDelta` exported from both entries (stream-events.js).
- Delta payload: `{ type, index, delta: { type, text?, reasoning? } }`.

## Plan for LettaDock Phase 3 (browser/Tauri webview)

1. Switch adapter to `@letta-ai/letta-agent-sdk/client` (portable, no
   node:child_process). Verify it bundles under Vite.
2. `webSocketAuth: "query"` for browser WebSocket (no custom headers).
3. Open session per selected conversation with
   `computer: { name: "ibook26" }` so tools run on the owner's machine,
   matching his existing letta server usage. NO managed sandbox.
4. Read-only stays for history load (conversations.listMessages).
5. Send: `resumeSession(conversationId)` → `send(text)` → consume
   `stream()` until `result`, mapping assistant/tool/reasoning events into
   the external store. Optimistic user message on send.
6. Abort: session.abort() wired to UI stop button.
7. Multi-client visibility: messages sent from CLI/web appear after
   reload/refetch — no live push of foreign-client messages verified.
   Document as limitation; refresh button + reload on conversation switch.

## Reconnect/recovery (for robustness)

- Closed session is NOT reusable → resumeSession(conversationId) again.
- `recoverPendingApprovals()` for approvals pending across reconnect.
