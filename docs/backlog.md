# LettaDock — Backlog

Informed decisions for future phases. Items here are NOT approved work —
each needs explicit GO before implementation (per spec §7).

## UX

### CWD-1: рабочая директория как в PWA (owner request 2026-10-14)
Выбор cwd для диалога (как выбор проектов в PWA: ~/.letta/projects —
home_user, ..._Projects, ..._Documents и т.д.). SDK: cwd в
CreateSessionOptions + session.changeDeviceState({cwd}) для живой сессии.
UI: селектор рядом с исполнением в шапке. Пер-диалог, как TARGET-1.
НЕ ДЕЛАТЬ ДО КОМАНДЫ.

### PERM-1: настройки привилегий как в PWA (owner request 2026-10-14)
Permission mode (standard/acceptEdits/unrestricted/strict) и управление
тулами на диалог. SDK: permissionMode в CreateSessionOptions +
changeDeviceState({permissionMode}) для живой сессии. UI: рядом с
исполнением/cwd. Сейчас всё на дефолтах агента — управления нет.
НЕ ДЕЛАТЬ ДО КОМАНДЫ.

### KEY-1: «использовать системный ключ» в диалоге добавления профиля
(owner request 2026-10-14, первое впечатление от стабла)
Диалог «+» сейчас требует вставить ключ вручную, хотя read_local_letta_key
уже умеет читать ~/.letta/settings.json. Добавить:
- чекбокс/кнопку «Взять ключ из ~/.letta/settings.json» — при выборе
  поле ключа скрывается, ключ резолвится при коннекте;
- если системный ключ не найден — понятная ошибка с путём;
- автосоздание профиля при первом запуске, если системный ключ есть
  (пустой сайдбар при рабочем ключе — bad UX, видено в стабле).

### UI-TEXT-1: вычистить устаревшие тексты из интерфейса
(owner request 2026-10-15, найдено в стабле)
В диалоге «+» висит «Phase 2: ключ не сохраняется на диск…» — внутренний
жаргон фаз в пользовательском интерфейсе. Просканировать ВСЕ
пользовательские строки (placeholder, title, подписи) на предмет мусора:
- Sidebar.tsx: диалог «+» (Phase-текст, placeholder «LETTER…»)
- проверить остальные: App.tsx, MyThread.tsx, FileViewer.tsx
Правило: в UI — только то, что нужно пользователю. Фазовые пометки,
номера коммитов, внутренние термины — только в комментариях кода.

### UI-STATE-1: пустое состояние до выбора диалога (owner request 2026-10-15)
При запуске, ДО подключения, в центре висит «Нет сообщений. Напиши
что-нибудь.» и активное поле ввода — но отправка не работает, пока не
выбраны сервер → агент → диалог. Ввести состояние «нет диалога»:
- центр: нейтральная заглушка (логотип/подсказка «Выбери диалог слева
  или создай новый»), БЕЗ призыва писать;
- composer (поле + кнопка) — disabled с подсказкой почему;
- появляется только когда выбран реальный диалог.
Связано с UX-5 (создание нового чата).
НЕ ДЕЛАТЬ ДО КОМАНДЫ.

### UI-DEV-1: маркер дев-сборки в заголовке окна (owner request 2026-10-15)
Кепшен окна в dev-сборке: «LettaDock DEV <короткий коммит>» — чтобы
мгновенно отличать дев-копию от стабла в доке/переключателе окон.
Реализация: tauri.conf.json title статичен — задавать программно при
запуске (import.meta.env.DEV + git rev-parse --short HEAD через Vite
define). В release — просто «LettaDock».
НЕ ДЕЛАТЬ ДО КОМАНДЫ.

### UX-6: кликабельные пути файлов в тексте сообщений (owner request 2026-10-15)
Кейс: агент пишет «Пакет готов: sp_ac/UPDATE_….sql» — путь в тексте.
Хочу кликнуть по пути → открылся файл в просмотрщике, в идеале ВНУТРИ
дока с подсветкой по расширению (sql/python/etc), допустимо открывать
в системном просмотрщике.
Детали реализации:
- в сообщениях ассистента авто-детект путей файлов (regex: слово с
  расширением и слэшами, kohnфигурируемый список известных расширений)
- рендерить как кликабельный чип (уже есть механика FileChips для
  [файл: …] — расширить на авто-детект)
- источник контента: у агента на ibook26 файл локален — нужен канал
  чтения (Rust-команда чтения файла с компьютера исполнения, scope
  ограничить рабочей директорией; БЕЗ произвольного чтения диска)
- Monaco с локальной подсветкой уже настроен (round-6 фикс)
НЕ ДЕЛАТЬ ДО КОМАНДЫ.

### UX-7: превью картинок в истории сообщений (owner request 2026-10-15)
Кейс: «уже не помню что отправлял 3 сообщения назад, не могу кликнуть
и посмотреть». Сейчас картинки в истории показываются как текст [image]
без превью и без возможности открыть.
Сделать:
- в истории user-сообщений рендерить РЕАЛЬНЫЕ превью (base64 уже есть
  в content parts — source.data), на месте маркера, вперемешку с текстом;
- клик по превью → просмотрщик на весь экран (лайтбокс: зум, закрыть
  по Esc/клику);
- мелкие thumbnails в строке, не раздувающие ленту (max-height ~120px,
  клик открывает полный размер).
НЕ ДЕЛАТЬ ДО КОМАНДЫ.

### UX-8: переименование диалогов (owner request 2026-10-15)
Кнопка/контекстное меню на диалоге в сайдбаре → inline-edit имени.
API: PATCH /v1/conversations/{id} {name}. Локальный title сейчас
выводится из summary (name=None у облачных) — после rename показывать
серверное имя приоритетно, summary только если name пустой.

### UX-2: копировать сообщение (owner request 2026-10-14)
Кнопка на сообщении — текст в буфер.

### UX-3: форк диалога от сообщения (owner request 2026-10-14)
Ветка от произвольного сообщения. SDK: client.conversations.fork(id,
{messageId}). Кнопка рядом с копированием.

### UX-4: тул-коллы свёрнуты по дефолту (owner request 2026-10-14)
Строка «иконка+имя», клик раскрывает аргументы/результат. Как в вебе.

### UX-5: создание нового чата/сессии (owner request 2026-10-14)
Кнопка «новый диалог» у агента. SDK: createSession(agentId) → новый conv.

### DELETE-1: Profile deletion confirmation (owner request 2026-10-14) — DONE
Two-step (arm 3s → confirm). f59802c.

### UX-3 (старое): Connection error surfaced better
Error banner is small; add retry button next to it (re-run connect()).

### ATTACH-1: Ctrl+V paste images + file attachments (owner request 2026-10-14)
Composer must accept Ctrl+V (images from clipboard, file paste) and a
paperclip. Images → ImageContent (base64) sent with the message
(SDK SendMessage = TextContent | ImageContent[]). Files → upload strategy
TBD: Letta Cloud file API vs agent MemFS vs repositories. Depends on
SESSION-CORS being fixed (sending must work first).
Research in flight: official web UI internals (subagent task_4).

### TARGET-1: execution target switcher (owner request 2026-10-14)
Web UI has a control to pick where tool execution runs (cloud vs remote
computer). LettaDock hardcodes the discovered online computer. Add a
selector in the header: cloud sandbox ↔ ibook26 (any registered computer).
Research in flight: subagent task_4 digging official UI source for the
exact API calls.

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
