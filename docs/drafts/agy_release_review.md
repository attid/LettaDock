Подробный структурированный отчёт сохранён в артефакте: [release_review_report.md](file:///home/itolstov/.gemini/antigravity-cli/brain/63a9c079-c3c5-4135-8c64-adb7a154b0ba/release_review_report.md).

---

### Находки по приоритетам

#### P1 — Блокеры релиза (чинить обязательно)

1. [`src/letta/liveSession.ts:227-238`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L227-L238)
   - **Суть:** Гонка при переключении диалогов во время стриминга.
   - **Почему:** После выхода из цикла `for await (const msg of this.session.stream())` код безусловно сбрасывает `this.turn` в `idle`. Если пользователь переключился на другой диалог и сразу отправил сообщение, старый стрим прерывается и затирает статус стриминга нового диалога обратно в `idle`, ломая UI.
   - **Как чинить:** Сразу после выхода из цикла `for await` добавить возврат, если диалог сменился:
     ```typescript
     if (this.currentViewConversationId !== conversationId) return;
     ```

2. [`src-tauri/tauri.conf.json:21`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json#L21)
   - **Суть:** CSP блокирует Web Workers и шрифты Monaco Editor.
   - **Почему:** В директиве CSP нет `worker-src 'self' blob:`, поэтому Monaco не может создать воркеры для подсветки кода и парсинга (JSON, TS, CSS). В `font-src` отсутствует схема `asset:`, из-за чего блокируется иконочный шрифт Monaco (`codicon.ttf`).
   - **Как чинить:** Расширить CSP:
     ```json
     "csp": "default-src 'self'; connect-src 'self' https://api.letta.com wss://api.letta.com; img-src 'self' data: asset: http://asset.localhost https://asset.localhost; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; font-src 'self' data: asset: http://asset.localhost https://asset.localhost;"
     ```

3. [`src/chat/MyThread.tsx:71-78, 86-96`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L71-L96)
   - **Суть:** Кнопка «diff» не передаёт `oldContent` и открывает обычный редактор вместо [`DiffEditor`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L25).
   - **Почему:** В [`ToolCall`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L64) проверяются только `new_string` и `content`, а при клике в `openFileRef` передается только `newContent`. В [`FileViewer.tsx:125`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L125) условие `file.oldContent != null` не выполняется, и вместо сравнения версий открывается одиночный просмотр.
   - **Как чинить:** Добавить разбор `args.old_string` / `args.old_content` и прокидывать `oldContent` в пейлоад `openFileRef.current?.({ path, newContent, oldContent })`.

4. [`.github/workflows/ci.yml:89-96`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L89-L96)
   - **Суть:** Шаг релиза упадет из-за отсутствия токена в `softprops/action-gh-release@v2`.
   - **Почему:** Action требует явной передачи переменной окружения `GITHUB_TOKEN`. Без нее создание GitHub Release по тегу завершится ошибкой аутентификации.
   - **Как чинить:** Добавить `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

---

#### P2 — Важные улучшения (стоит поправить)

5. [`src/chat/MyThread.tsx:164-202`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L164-L202)
   - **Суть:** Перехват `Ctrl+V` ломает вставку обычного текста при отсутствии `wl-clipboard` или `xclip`.
   - **Почему:** `e.preventDefault()` вызывается синхронно при любом `Ctrl+V`. Если утилит нет в системе, Rust возвращает `None`, и даже скопированный текст невозможно вставить.
   - **Как чинить:** Добавить `wl-clipboard` и `xclip` в зависимости пакета в [`src-tauri/tauri.conf.json`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json#L24) (`bundle.linux.deb.depends`), либо не прерывать дефолтное поведение при отсутствии данных из утилит.

6. [`src-tauri/src/clipboard.rs:16, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L16)
   - **Суть:** Синхронный `Command::output` без таймаута.
   - **Почему:** Если процесс-владелец буфера в X11/Wayland зависнет, синхронный запуск `xclip`/`wl-paste` намертво подвесит поток IPC Tauri.
   - **Как чинить:** Использовать асинхронные команды `tokio::process::Command` с таймаутом `tokio::time::timeout(1000ms)`.

7. [`src-tauri/src/proxy.rs:45, 97, 136`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L45)
   - **Суть:** `reqwest::Client::new()` создается на каждый запрос.
   - **Почему:** Теряется пул соединений (keep-alive), каждый запрос выполняет повторный TCP и TLS handshake.
   - **Как чинить:** Хранить один `reqwest::Client` в `tauri::State` или `OnceLock`.

8. [`src/chat/ChatRuntime.tsx:253-259`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L253-L259)
   - **Суть:** Нестабильная ссылка `convertMessage: (m) => m` в [`useExternalStoreRuntime`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L4).
   - **Почему:** Создается заново при каждом рендере, что провоцирует лишние срабатывания хука рантайма.
   - **Как чинить:** Вынести `const identity = (m: ThreadMessageLike) => m;` в константу модуля.

9. [`src/fileViewer/FileViewer.tsx:109-112`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L109-L112)
   - **Суть:** Кнопка декларирует «закрыть (Esc)», но обработчик клавиши Escape отсутствует.
   - **Почему:** Клавиша Esc ничего не закрывает.
   - **Как чинить:** Добавить `useEffect` со слушателем `keydown` (`e.key === "Escape"`).

10. [`src/store/appStore.ts:197-199`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L197-L199)
    - **Суть:** Сохраненные `selectedAgentId` и `selectedConversationId` не активируются при старте.
    - **Почему:** В [`Sidebar.tsx:128-134`](file:///home/itolstov/Projects/mtl/LettaDock/src/components/Sidebar.tsx#L128) вызывается только `connect(profileId)`, но не подгружаются диалоги агента и история сообщений. Пользователь всегда видит пустое окно.
    - **Как чинить:** После завершения `connect` вызывать `selectAgent` и `openConversation` для сохраненных значений.

11. [`src/chat/ChatRuntime.tsx:100`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L100)
    - **Суть:** Коллизия `toolCallId` в `approval_request_message`.
    - **Почему:** Используется `raw?.tool_call?.name ?? m.id`. Несколько запросов на один и тот же инструмент получат одинаковый `id`, вызывая дублирование ключей в React.
    - **Как чинить:** Использовать `toolCallId: m.id`.

---

#### P3 — Шероховатости и код-стайл

12. [`src/letta/cloudAdapter.ts:122`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L122), [`src/App.tsx:134`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L134) — Неэффективные динамические импорты `proxyClient.ts` и `adapters.ts`, порождающие варнинги Vite при сборке.
13. [`src/letta/upload.ts:31`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/upload.ts#L31) — Сериализация буфера `Array.from(buf)` в массив JSON-чисел для файлов до 20 МБ.
14. [`docs/drafts/agy_release_review.md`](file:///home/itolstov/Projects/mtl/LettaDock/docs/drafts/agy_release_review.md) — Мусорный пустой файл (0 байт) в рабочей директории.
15. [`src-tauri/src/lib.rs:35`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L35), [`src-tauri/src/clipboard.rs:17, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L17) — Предупреждения Clippy `collapsible_if`.

---

### Что упростить

1. **Удалить команду [`proxy_download_sandbox_file`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L89-L107):**
   Это обычный `GET /v1/sandboxes/{id}/files?path=...`. Универсальная команда [`proxy_letta_api`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L31) полностью покрывает этот запрос. Удаление отдельной команды уберет 25 строк кода и лишнюю структуру.
2. **Перевести просмотрщик файлов на Zustand-стор ([`src/chat/MyThread.tsx:30`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L30)):**
   Вместо глобальной переменной `openFileRef` и функции `registerFileOpener` сохранять состояние просмотрщика в [`useAppStore`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L188).
3. **Отключить пустые IPC-вызовы `append_debug_log` в production ([`src/letta/localKey.ts:10`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/localKey.ts#L10)):**
   В release-сборке команда не зарегистрирована в Rust. Достаточно проверять `import.meta.env.DEV` перед отправкой IPC.

---

### Чего не хватает в тестах

В репозитории есть 13 тестов в двух файлах ([`modelInfo.test.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/modelInfo.test.ts) и [`cloudAdapter.test.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.test.ts)), но отсутствуют критические сценарии:
1. **Тесты на гонки в [`LiveSessionManager`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L43):** смена диалога во время стриминга (проверка, что старый стрим не сбрасывает чужой `turnState`) и вызов `abort()`.
2. **Тесты на парсер маркеров изображений [`sendWithMarkers`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L161):** разбиение строк `[1]`, обработка пропущенных или некорректных номеров.
3. **Модульные тесты Rust для SSRF-валидатора в [`src-tauri/src/proxy.rs`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L32):** пропуск `/v1/agents`, блокировка `..`, `@`, `//`, корректная нарезка UTF-8 (Cyrillic).
4. **CI:** добавить шаги `cargo test` и `cargo clippy -- -D warnings` в [`.github/workflows/ci.yml`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml).

---

### Чек секретов и приватности

- **Ключи и токены:** Захардкоженных API-ключей, токенов или паролей в коде и git-истории **не обнаружено**.
- **Локальные пути:** Путей разработчика вида `/home/...` в коде нет.
- **Папка `.letta/`:** Изолирована в `.gitignore` и не трекается.
- **Приватность:**
  - В [`src-tauri/Cargo.toml:5`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/Cargo.toml#L5) указано `authors = ["Igor Tolstov"]`.
  - В коммитах git указан email `attid0@gmail.com`.
  - Имя локального компьютера владельца (`ibook26`) упоминается в документации и комментариях кода как пример (`src/letta/types.ts:10`, `src/fileViewer/FileViewer.tsx:6`). Если требуется полная обезличенность, его стоит заменить на `my-computer`.

---

### Вердикт одной строкой

**Чинить и публиковать** (в коде найдено 4 критических P1 блокера: гонка в `liveSession`, блокирующий CSP для Monaco, сломанный режим диффа и отсутствие `GITHUB_TOKEN` в CI-релизе; после их закрытия проект готов к первому публичному релизу).
