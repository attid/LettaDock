# LettaDock

Lightweight Linux desktop client for existing Letta agents and conversations.

Stack: Tauri 2 + Vite + React + TypeScript, `@assistant-ui/react`, Tailwind CSS 4, Zustand.

Spec: [LettaDock.md](./LettaDock.md)

## Development

```bash
pnpm install
pnpm tauri dev
```

## Status: Phase 3 — live conversation — DONE (owner-confirmed 2026-10-14)

- [x] Phase 2: read-only cloud connectivity (agents, conversations, history)
- [x] Phase 3: send + streaming + abort via hosted relay sessions
  - sessions run on the owner's registered remote computer (auto-discovered
    via computers.list(), e.g. ibook26) — NOT managed sandboxes
  - ALL SDK HTTP goes through the local Rust proxy (owner decision: nothing
    leaves the frontend directly; api.letta.com lacks CORS on most routes)
  - connectionId resolved fresh per session (rotates on device reconnect)
  - key resolution: entered key this session, else ~/.letta/settings.json
    env.LETTA_API_KEY via Tauri command (read_local_letta_key)
- [x] Message rendering: chronological order (API is DESC), user messages
  visible (stringified content parts parsed), <system-reminder> blocks
  stripped (human text only), conversation titles from summary
- [x] Routing shown in UI: data = api.letta.com (via proxy), execution =
  discovered computer (ibook26)
- Known limitation: messages sent from other clients (CLI/Telegram) do not
  arrive live; visible after reopening the conversation.

Debug log: every significant step → /tmp/lettadock-ui.log.

Next: ATTACH-1 (Ctrl+V images/attachments) + TARGET-1 (execution switcher)
after subagent research on official UI internals lands; then Phase 4
approvals/files/diffs by separate GO.

## Status: Phase 1 — runnable shell (mock data) — DONE

- [x] Tauri 2 + Vite + React + TS skeleton
- [x] assistant-ui chat with clearly marked mock messages
- [x] Server/agent/conversation sidebar with mock entries, dark theme
- [x] Verified on Pop!_OS COSMIC desktop at 150% scaling (owner-confirmed)
- [x] Measured cold startup and idle RAM (dev build):
  - cold spawn via `pnpm tauri dev` (vite ready 304ms + cargo up-to-date check): ~8s to process
  - idle RSS of app tree: ~578 MB — main ~200 MB, WebKitWebProcess ~310 MB, NetworkProcess ~55 MB
  - method: `scripts/measure.sh`; note: debug build, release build will be smaller
  - WebKitGTK subprocesses are counted (spec requirement)

Not implemented (per spec): Letta transport, login, Monaco, approvals, Android.

Phase 1 STOP — awaiting approval for Phase 2 (read-only Letta connectivity).

## Structure

```
src/
  chat/        assistant-ui chat (mock runtime)
  components/  Sidebar
  lib/         utils, mock data
  store/       Zustand UI state
src-tauri/     Tauri 2 shell (no custom commands yet)
```
