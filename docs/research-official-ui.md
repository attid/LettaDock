# Research: official Letta UIs (subagent report, 2026-10-14)

Closed-source: chat.letta.com / Desktop. Open references: letta-code
(harness), letta-agent-sdk (+react-chat demo), letta-oss-ui (Electron).
All endpoints verified against SDK/CLI source, base = api.letta.com.

## Execution target switch (TARGET-1)

- List: GET /v1/environments?onlineOnly=true&limit=50&after=cursor
  → { connections: [{ id, connectionId, deviceId, connectionName,
  lastHeartbeat(ms), currentMode, metadata }], hasNextPage }
- Online = connectionId != null && now - lastHeartbeat < 120s
- GET /v1/environments/{deviceId} — by stable device id
- Switch = field `computer` in enqueue:
  POST /v1/conversations/{id}/messages/enqueue
  { agent_id, client_message_id: uuid, computer: "cloud" | name | deviceId
  | connectionId, messages: [{role,content:[text parts],client_message_id}] }
  → 202 { status:"queued", workflow_id, ... }
- No `computer` field → keeps current target. "cloud"/"cloud-sandbox"
  normalize to "cloud". Cancel: DELETE /v1/conversations/{id}/messages/
  enqueue/{client_message_id}
- Prefer deviceId or name for persistent choice; connectionId is ephemeral.
- Managed sandbox (for "cloud"): POST /v1/agents/{id}/sandboxes
  { conversationId?, githubRepositories? } → { sandboxId, deviceId };
  refresh: POST /v1/agents/{id}/sandboxes/refresh; terminate: POST
  /v1/sandboxes/{id}/terminate
- Status: SSE GET /v1/agents/{id}/super-runs/stream — subscribe BEFORE send.
- Browser WS relay: wss .../status/ws?agentId&conversationId&channel=
  control|stream&token= (two sockets, dedup by idempotency_key/seq).

## system-reminder rendering

All UIs strip before render; no toggle/collapse:
- react-chat strips ONLY auto-generated ones (regex on "automated message
  providing (context about the user's environment|information about you)"),
  drops part if empty after strip (server-side).
- oss-ui strips all <system-reminder>…</system-reminder> from user rows.
- letta-code TUI removes system context blocks from history; image part →
  "[Image]".
LettaDock already matches (c32604d). Consider adopting the react-chat
narrower regex if false positives appear.

## Images & files (ATTACH-1)

- NO file upload API for images — base64 inline content parts:
  { type:"image", source:{ type:"base64", media_type:"image/png|jpeg|gif|webp",
  data:"<raw base64, NO data: prefix>" } }
- TUI paste flow: resize to max 2000×2000, 5MB byte limit (Anthropic),
  ≤25MP input; placeholder [Image #N] in input; expand at send into
  interleaved text/image parts.
- Non-image files: multipart into SANDBOX (not message attachment):
  1) POST /v1/agents/{agentId}/sandboxes → sandboxId
  2) POST /v1/sandboxes/{sandboxId}/files FormData field `file` (remove
     Content-Type header; fetch sets boundary) → files land in /root/downloads
  3) GET /v1/sandboxes/{id}/files?path=…
  Message references the file by text path only.

## Other worth copying

- Direct send with streaming: POST /v1/conversations/{id}/messages
  { messages, streaming:true, stream_tokens:true, include_pings:true,
  background:true, agent_id (only for "default") } → SSE.
- History pagination: listMessages limit+order:"desc" → { messages,
  hasMore, nextBefore }; load-older via `before`.
- Optimistic dedup: client generates otid (uuid), sends with message;
  history rows carry same otid → dedup on merge (react-chat
  use-chat-session.ts:215).
- Retry: `retry` event → reset row accumulator; 503 with errorCode
  "cloud_api_shutting_down", admitted:false, retryable:true + Retry-After →
  retry only that; SDK maxRetries:0, idempotency via client_message_id.
- createTranscriptAccumulator() from SDK: joins fragments by otid/uuid,
  merges tool args by toolCallId, has rebase() — use instead of hand-rolling.
- Headers: Bearer + User-Agent letta-code/<ver> + X-Letta-Source.
  OAuth device flow exists (app.letta.com/api/oauth/device/code) but NOT
  needed with at-let-/sk-let- keys.

## Paths (citations)

letta-code: src/backend/api/{environments,conversation-enqueue,sandbox-files,
request,agent-message}.ts, src/headless-cloud-send.ts,
src/cli/helpers/{paste-registry,backfill}.ts, src/constants.ts,
src/utils/image-resize.shared.ts
letta-agent-sdk: src/{computers,cloud-session,cloud-status-transport,remote,
sandbox-files,app-server-session,types}.ts
react-chat: lib/letta/sdk-rows.ts, app/api/{chat,conversations}/route.ts,
hooks/use-chat-session.ts
oss-ui: src/electron/libs/{transcript,runtime}.ts
Docs: /platform/computers/{byom,teleportation,cloud-sandboxes},
/agent-sdk/{remote-client/reference,browser,messages,sessions}

Caveat: chat.letta.com picker source unavailable; behavior reconstructed
from docs + CLI/SDK implementations of the same endpoints.
