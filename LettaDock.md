# LettaDock — Technical Specification

> Lightweight Linux desktop client for existing Letta agents and conversations.
> **Initial target:** Pop!_OS / COSMIC / Wayland (150% display scale).
> **Product name:** LettaDock. **Suggested repository:** `letta-dock`.

## 1. Goal

Build a **fast, lightweight desktop UI** for working with agents already running on Letta. LettaDock is **not** a new harness, LLM proxy, memory engine, or agent runtime. The Letta server remains responsible for agent execution, tools, memory, and conversation history.

Primary workflow: open the app, select a local Letta server, see existing agents/conversations, attach to a running conversation, read its activity, respond to a question or approve an action, and continue working. A conversation can also be open simultaneously in the official CLI or web UI.

**Key UX requirement:** clicking a file reference must ultimately **show the file**, and clicking a change must **show a readable diff**, not merely copy a path.

## 2. Stack

- **Desktop shell:** Tauri 2, no Electron and no bundled Chromium.
- **Frontend:** Vite + React + TypeScript.
- **Chat components:** `@assistant-ui/react`; prefer `useExternalStoreRuntime` or the currently recommended equivalent for externally owned conversation state, subject to documentation verification.
- **UI primitives:** Tailwind CSS + shadcn/ui for sidebar, menus, panels, dialogs, etc.
- **Small local UI state:** Zustand (or simpler state if sufficient).
- **Letta integration:** current Letta Agent SDK client API **if compatible with the installed server**; otherwise documented Letta App Server transport/API behind the same adapter.
- **Later:** Monaco Editor / DiffEditor, lazy-loaded only when opening a file/diff.

Keep dependency count low. Do not add Next.js, Docker, a separate background web server, an internal LLM gateway, or another agent runtime.

**Note:** Tauri uses the system WebKitGTK on Linux. It is not fully native-widget UI, so measure its real startup and RAM usage on the target machine; do not assume it is lightweight without profiling.

## 3. Architecture

```text
LettaDock — Tauri 2
  React UI
    ├─ Server switcher
    ├─ Agent/conversation sidebar
    ├─ Chat thread (assistant-ui)
    ├─ Agent status / approvals
    └─ [later] File viewer & diff
           │
     LettaAdapter (TypeScript)
       ├─ Connection/auth/profile handling
       ├─ Existing agents & conversations
       ├─ History snapshot + live event reconciliation
       ├─ Sending messages / execution state
       └─ Reconnect + deduplication
           │
    ┌──────┴────────┐
    │               │
Local Letta       Letta Cloud
(default)         (optional)
```

### Adapter contract

Design a narrow interface around capabilities, not speculative SDK method names:

- `connect(profile)` / `disconnect()` / `getConnectionStatus()`
- `listAgents()` / `listConversations(agentId)`
- `openConversation(agentId, conversationId)` / `getHistory(...)`
- `subscribeToConversation(...)` / `unsubscribe(...)`
- `sendMessage(...)` / `getRunStatus(...)`
- Later: `approveAction(...)`, `rejectAction(...)`, `readFile(...)`, `getDiff(...)` **only where real server APIs support them**.

These are **application-level interface ideas**, not claims about Letta SDK method names. Before implementing each operation, verify current SDK/server APIs, event schema, authentication, and whether the operation is available on both local and cloud deployments. No invented endpoints or mock functionality silently presented as real.

### Conversations and multiple clients

- Select an **existing** conversation by its real server ID; opening must not create a conversation, agent, or run.
- Letta is the source of truth for conversation messages, run state, and memory.
- Support multiple clients attached to the same conversation: updates initiated in CLI/web should appear in LettaDock **if the server protocol allows it**.
- Determine experimentally whether the API provides replayable conversation-wide events or only requester-specific streaming. If the latter, explicitly document limitations and implement snapshot/history reconciliation or polling where appropriate; **do not promise universal live broadcast until verified**.
- Stable message IDs, deduplication, ordering, reconnection, and backfilling missing history are required before declaring multi-client sync complete.
- Avoid duplicating conversation persistence in the UI. Only cache what is needed for responsive rendering.

## 4. Server profiles: local-first

Support both a local self-hosted Letta App Server (primary) and Letta Cloud (optional).

- First profile: **Local Letta**, default. **Do not hardcode a server URL/port**: user configures the endpoint.
- Second: **Letta Cloud**, optional; allow more profiles later.
- Persist the last-selected server and conversation where useful.
- Scope all identities by `(serverProfileId, agentId, conversationId)`.
- Never merge or sync histories between local and cloud.
- Do not spawn or install a second Letta server.
- No mandatory relay/cloud dependency. Localhost first; remote endpoints, including Tailscale, later.
- Never store credentials in plaintext frontend config/localStorage or log them. Investigate secure OS storage/Tauri plugin for secrets when actual auth is implemented.
- Verify direct WebSocket/HTTP connectivity, origin restrictions, TLS, and auth requirements in Tauri/WebKitGTK. If a Rust-side proxy is necessary, keep it minimal, local-only, and justified.

## 5. UI requirements

### MVP

- Fast-launching standalone Linux window, responsive at **150% scaling** on COSMIC/Wayland.
- Dark theme.
- Left sidebar listing configured servers (mock in Phase 1), agents, and existing conversations.
- Main chat pane with rendered Markdown, code blocks, and a message composer.
- Streaming/in-progress, connected/disconnected/error indicators once integration is live.
- Tool activity displayed as distinct messages/events (when available).
- Keyboard accessibility and reasonable layout at laptop resolutions.

### After MVP

- Agent approvals and actionable pending questions, with correct attribution to the originating conversation.
- Explicit stop/cancel only if Letta supports it, with safeguards against affecting other concurrent clients unexpectedly.
- Open file references in an internal viewer; syntax highlighting and side-by-side/unified diff using Monaco.
- Obtain file content from documented Letta capabilities or explicit filesystem access — never guess that a path visible in the chat is readable locally.
- Optional notification when an agent awaits user attention.
- Android is a **future phase**, not part of the Linux MVP.

## 6. Security & operational constraints

- Do not expose local shell execution capabilities to agent output in the MVP.
- Keep secrets out of logs, screenshots, and frontend bundles.
- Treat agent messages, file paths, and tool outputs as untrusted input.
- File access must respect server/workspace boundaries.
- No telemetry or unrelated external services in the MVP.
- Read-only discovery must not start or alter existing agents or conversations.

## 7. Implementation roadmap and acceptance criteria

### Phase 1 — Runnable Linux shell

- Create Tauri 2 + Vite + React + TypeScript application.
- Integrate `assistant-ui` using clearly marked mock messages.
- Add a functional server/agent/conversation sidebar with mock entries and a dark theme.
- Verify startup and rendering on Pop!_OS COSMIC / Wayland at 150% display scaling.
- Document development and production build commands.
- Measure cold startup time and idle RAM including Tauri/WebKitGTK subprocesses; record measurement method.

**Acceptance:** usable standalone desktop window, functioning mock chat and navigation, no bundled Electron/Chromium, reproducible build and measured startup/RAM.

### Phase 2 — Read-only Letta connectivity

- Verify the real installed local Letta App Server protocol and SDK compatibility.
- Implement configurable server profiles and authentication where necessary.
- List real agents and conversations and load existing conversation history.
- Opening an existing conversation must not create a new one.
- Distinguish empty results, connection failures, authentication errors, and incompatible protocol versions.

**Acceptance:** existing local conversations can be browsed read-only with stable IDs and without modifying server state.

### Phase 3 — Live conversations

- Send messages, render streaming events, and reconcile live events with server history.
- Handle disconnections, reconnections, duplicates, and out-of-order events.
- Test concurrent access to a conversation from LettaDock and the official CLI/web UI.
- Record any API limitations in observing other clients' responses.

**Acceptance:** messaging works in an existing conversation, reconnection does not duplicate messages, and multi-client behavior is documented and tested.

### Phase 4 — Agent activity and files

- Render tool activity, pending questions, and approvals when supported by the server API.
- Implement explicit stop/cancel only if supported, respecting concurrent conversation users.
- Add file preview and lazy-loaded Monaco DiffEditor; fetch content from supported APIs or authorized workspace access.

**Acceptance:** file references can be opened and readable diffs viewed where content is accessible; unsupported actions are visibly unavailable rather than simulated.

### Phase 5 — Distribution and performance

- Produce a documented Linux build/package.
- Harden credential storage and error recovery.
- Profile startup and memory with real conversations and optimize expensive UI components.
- Android adaptation is a possible later project, not a Linux MVP requirement.

**Acceptance:** reproducible Linux package, documented resource measurements and tested connection/error behavior.

## 8. Non-goals

- Replacing Letta's agent runtime or memory.
- Migrating or synchronizing agents between local and cloud.
- Reimplementing Markdown/chat widgets, editors, or diff algorithms from scratch.
- A full IDE, project orchestration system, or general-purpose code execution agent.
- Automatically installing, upgrading, or launching Letta server processes.

## 9. Links for research

- Tauri 2: https://v2.tauri.app/
- assistant-ui: https://github.com/assistant-ui/assistant-ui
- Letta Agent SDK: https://github.com/letta-ai/letta-agent-sdk
- Letta documentation: https://docs.letta.com/
- Monaco React integration: https://github.com/suren-atoyan/monaco-react

