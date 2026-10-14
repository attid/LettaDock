# LettaDock — Backlog

Informed decisions for future phases. Items here are NOT approved work —
each needs explicit GO before implementation (per spec §7).

## UX

### DELETE-1: Profile deletion confirmation (owner request 2026-10-14)
Remove button currently deletes instantly — too easy to hit accidentally.
Design: two-step (first click arms → «Удалить?» inline confirm / second
click deletes; auto-disarm after ~3s or on blur). Consider same pattern
for conversation actions later.

### UX-2: Remove stale profiles automatically
Profiles referencing lost session keys show repeated errors on startup.
Offer one-click «очистить нерабочие профили» instead of N manual deletes.

### UX-3: Connection error surfaced better
Error banner is small; add retry button next to it (re-run connect()).

### ATTACH-1: Ctrl+V paste images + file attachments (owner request 2026-10-14)
Composer must accept Ctrl+V (images from clipboard, file paste) and a
paperclip. Images → ImageContent (base64) sent with the message
(SDK SendMessage = TextContent | ImageContent[]). Files → upload strategy
TBD: Letta Cloud file API vs agent MemFS vs repositories. Depends on
SESSION-CORS being fixed (sending must work first).

## Sessions / Phase 3 follow-ups

### SESSION-CORS (blocking, log-verified 2026-10-14)
Session SDK client fetches api.letta.com directly; CORS headers exist only
on /v1/agents. /v1/conversations/{id}, /v1/environments/{...},
/repositories are blocked in the webview → session ready() = "Connection
error" in browser, fine in Node. WS relay itself opens OK (verified).
Options: (a) route ALL session HTTP through the Rust proxy by injecting a
custom fetch into createCloudClient; (b) re-implement session on the
WebSocket layer directly (relay WS works). Leaning (a) — smaller surface.

### S-1: Live updates from other clients
Messages sent from CLI/Telegram don't appear in an open conversation.
Investigate relay subscription or polling refresh (spec §3 explicitly says
document, not promise).

### S-2: WebSocket relay CORS check
Session streaming goes direct to wss relay with webSocketAuth=query.
Not yet exercised end-to-end from the webview (REST was the blocker).
Verify on first real send; if relay also blocks, extend proxy to WS.

### S-3: Session teardown on conversation switch
LiveSessionManager closes the old session on switch; verify no zombie
relays after rapid switching (watch ibook26 server logs if needed).

## Phase 5 (packaging)

### P-1: Secure storage for API keys
Replace read_local_letta_key with OS keychain (Tauri stronghold/keyring).
User-entered keys must not live in localStorage ever.

### P-2: Release build measurements
Phase 1 metrics were debug-build. Re-measure cold start + idle RAM on
--release before declaring performance targets met.
