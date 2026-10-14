# LettaDock

Lightweight Linux desktop client for existing [Letta](https://letta.com) agents and
conversations. Attach to what your agents are already doing — read activity, answer
questions, approve actions — without leaving your desktop.

> Требует запуск агентов через Letta Cloud или self-hosted App Server.
> Русская версия README ниже / Russian README below.

## Features

- Attach to existing conversations — history loads, nothing is created behind your back
- Live streaming responses with stop/cancel
- Image paste (Ctrl+V) with `[N]` markers — interleave screenshots with text
- File attachments → agent sandbox, path inserted into the message
- Per-conversation execution target: cloud sandbox ↔ your own registered computer
- Model switcher + context-window usage estimate in the header
- Monaco file viewer and side-by-side diffs for Edit/Write tool calls
- Dark theme, keyboard-friendly, runs at 150% scaling (COSMIC/Wayland)

## Install

Grab a `.deb` / `.AppImage` from [Releases](../../releases) (Linux x86_64):

```bash
sudo dpkg -i LettaDock_*.deb
```

Requires a Letta account (API key) and — for tool execution on your own machine —
a registered computer (`letta server`).

## Development

```bash
pnpm install
pnpm tauri dev      # dev copy on port 1420
pnpm tauri build    # stable build → deb/rpm/AppImage
```

Dev and stable copies run side by side. Both read the API key from
`~/.letta/settings.json` (env `LETTA_API_KEY`); local storage is separate.

## Architecture

Tauri 2 + React + TypeScript, `@assistant-ui/react`, Tailwind CSS 4, Zustand.
All Letta Cloud HTTP traffic goes through a local Rust proxy command (no direct
frontend fetches); WebSocket relays connect directly. Spec: [LettaDock.md](./LettaDock.md).

## Status

MVP complete (Phases 1–4): shell, read-only connectivity, live conversations,
tool/approval rendering, file viewer + diffs, attachments, images, model/target
switchers. Phase 5 (packaging polish, secure key storage) in progress.

---

# LettaDock (RU)

Лёгкий Linux-десктоп-клиент для существующих агентов и диалогов Letta.
Подключаешься к тому, что агенты уже делают: читаешь активность, отвечаешь
на вопросы, апрувишь действия — не уходя с десктопа.

## Возможности

- Подключение к существующим диалогам — история грузится, ничего не создаётся
- Живой стриминг ответов, stop/cancel
- Вставка картинок (Ctrl+V) маркерами `[N]` — скриншоты вперемешку с текстом
- Файлы → в песочницу агента, путь вставляется в сообщение
- Исполнение на выбор (пер-диалог): облако ↔ свой компьютер
- Смена модели + оценка заполнения контекста в шапке
- Monaco-просмотр файлов и side-by-side диффы для Edit/Write
- Тёмная тема, 150% масштаб (COSMIC/Wayland)

## Установка

`.deb` / `.AppImage` из [Releases](../../releases) или сборка самому
(`pnpm tauri build` → `dpkg -i`). Нужен ключ Letta API; для исполнения
на своей машине — зарегистрированный компьютер (`letta server`).

## Разработка

```bash
pnpm install
pnpm tauri dev
```

Дев- и стабл-копии живут параллельно. Ключ обе читают из
`~/.letta/settings.json`.

## CI

- push/PR в `main` → check: tsc, frontend build, cargo check
- тег `v*` → сборка + публикация deb/AppImage в GitHub Releases
