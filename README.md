# LettaDock

Lightweight Linux desktop client for existing Letta agents and conversations.

Stack: Tauri 2 + Vite + React + TypeScript, `@assistant-ui/react`, Tailwind CSS 4, Zustand.

Spec: [LettaDock.md](./LettaDock.md)

## Development

```bash
pnpm install
pnpm tauri dev
```

## Status: Phase 1 — runnable shell (mock data)

- [x] Tauri 2 + Vite + React + TS skeleton
- [x] assistant-ui chat with clearly marked mock messages
- [x] Server/agent/conversation sidebar with mock entries, dark theme
- [ ] Verify on Pop!_OS COSMIC desktop at 150% scaling
- [ ] Measure cold startup and idle RAM

Not implemented (per spec): Letta transport, login, Monaco, approvals, Android.

## Structure

```
src/
  chat/        assistant-ui chat (mock runtime)
  components/  Sidebar
  lib/         utils, mock data
  store/       Zustand UI state
src-tauri/     Tauri 2 shell (no custom commands yet)
```
