// Phase 2 API verification notes — @letta-ai/letta-agent-sdk 0.8.42
//
// Source: reading installed package types + live read-only probes against
// api.letta.com (scripts deleted after verification; findings recorded here).

## Verified facts

- Export is `LettaAgentClient` (NOT `LettaCode` as docs table implies).
  Other exports: `createAgent`, `createSession`, `resumeSession`, `prompt`,
  `query`, `listMessagesDirect`, `RepositoriesClient`, ...
- Package exports map: `.` (Node) and `./client` (browser/RN portable client).
- Client sub-clients:
  - `client.agents`      [list, retrieve, update, delete]
  - `client.conversations` [list, retrieve, create, update, fork, listMessages, enqueue]
  - `client.models`      [list]
  - `client.agentRepositoriesClient` [list, attach, detach]
- `client.agents.list()` returns `{ agents: [...] }`.
- `client.conversations.list({ agentId })` returns `{ conversations: [...] }`.
  Fields seen: id, created_at, (name was empty string in practice).
- `client.conversations.listMessages(conversationId, { limit })` —
  conversationId is POSITIONAL (docs `listMessages(options)` shape is the
  session method, not this one). Returns `{ messages: [...] }`.
- Message shape: `{ id, date, otid, run_id, step_id, name, sender_id,
  seq_id, is_err, message_type, ... }`.
  message_type values observed: `user_message`, `assistant_message`,
  `reasoning_message`, `system_message`, `tool_return_message`,
  `approval_request_message`, `approval_response_message`.
  `content` is a string for user/assistant/reasoning messages.
- Pagination: `listMessages(conversationId, { limit, before, after, order })`.

## Cloud vs local

- This session has NO local Letta App Server running (checked: no process,
  no listening port with /v1/health; ~/.letta has no local server state).
- Cloud works with LETTA_API_KEY. Local/remote backend support will use
  `backend: "local"` (spawns bundled server — NOT wanted for LettaDock) or
  a remote client with `url` — must verify before Phase 3.
  Per spec: LettaDock must NOT spawn a second server.
- NEXT STEP before live transport: verify remote/url client mode against
  a real App Server (owner runs one on demand).

## Env/auth handling in app

- API key: user-provided per profile, stored via Tauri secure storage when
  implemented. For Phase 2 dev shell we read it from a dev-supplied value at
  runtime (no key in code/bundle).
