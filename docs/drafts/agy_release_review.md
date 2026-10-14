Подробный аналитический отчёт с архитектурной схемой сохранён в артефакте: [`release_review_report.md`](file:///home/itolstov/.gemini/antigravity-cli/brain/b2d21bc9-de4f-41e5-bd6d-af2d735f6c72/release_review_report.md). Ниже представлены результаты независимого ревью по ТЗ.

---

### Находки по приоритетам

#### P1: Баги и дыры (чинить до релиза)

1. [`src-tauri/src/proxy.rs:120-141`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L120-L141) — **Вызов блокирующего `reqwest::blocking` внутри асинхронного Tokio-контекста**
   - **Суть:** Команда объявлена как `pub async fn proxy_upload_file(...)`, но внутри создаёт `reqwest::blocking::Client::new()` и вызывает блокирующий `.send()`.
   - **Почему:** В Tokio попытка запустить/заблокировать внутренний рантайм из асинхронного контекста приводит к панике `Cannot start a runtime from within a runtime` или к блокировке рабочего потока Tokio. Первая же загрузка файла рискует уронить рантайм приложения.
   - **Как чинить:** Переписать на асинхронный `reqwest::Client` с `reqwest::multipart::Form`, либо (если синхронно) убрать ключевое слово `async` из сигнатуры команды `pub fn proxy_upload_file(...)`.

2. [`src/letta/liveSession.ts:74, 209, 222, 228`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L74-L228) — **Ложная защита от гонки при смене диалога: история диалога А затирает открытый диалог Б**
   - **Суть:** В методе [`loadHistory(conversationId)`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L71) при смене диалога выставляется `this.aborted = true`, но поле `this.activeTurnConversationId` **не сбрасывается и не меняется**.
   - **Почему:** Когда прерванный стрим диалога А выходит из цикла, срабатывает блок на строке 222: `if (this.activeTurnConversationId === conversationId)`. Поскольку `activeTurnConversationId` остался равен `"A"`, а `conversationId` в замыкании — тоже `"A"`, условие оказывается истинным! Код вызывает `getHistory("A")` и `this.emit()`, **перетирая в интерфейсе только что открытый диалог Б историей диалога А**. Аналогично в блоке `catch`: ошибка закрытия сессии А просачивается в стейт диалога Б.
   - **Как чинить:** Добавить поле текущего открытого диалога `currentViewConversationId: string | null`. В `loadHistory(id)` обновлять его в самом начале, а в `sendInternal` проверять строго `if (this.currentViewConversationId !== conversationId) return;`.

3. [`src-tauri/src/proxy.rs:40`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L40) — **Паника по границе байтов UTF-8 (`char boundary`) в SSRF-гарде**
   - **Суть:** `&req.path[..req.path.len().min(80)]`
   - **Почему:** Индексация среза `&str[..N]` в Rust работает по **байтам**, а не по символам. Если в пути окажется кириллица или эмодзи длиннее 80 байт, срез разрежет 2-4 байтовый символ пополам и вызовет `panic: byte index 80 is not a char boundary`, обрушив IPC-вызов.
   - **Как чинить:** Брать срез по символам Unicode: `let s: String = req.path.chars().take(80).collect();` или проверять `is_char_boundary(80)`.

4. [`src/chat/ChatRuntime.tsx:74`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L74) и [`src/chat/MyThread.tsx:63, 71`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L63-L71) — **Кнопка диффа и вывод аргументов тулов полностью сломаны (мертвый код)**
   - **Суть:** В [`ChatRuntime.tsx`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L74) аргумент `argsText` жестко задан как пустая строка: `argsText: ""`.
   - **Почему:** Компонент [`ToolCall`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L57) пытается распарсить аргументы через `JSON.parse(argsText || "{}")`. Так как `argsText` всегда пустой, `filePath` всегда `undefined`, флаг `canDiff` всегда `false`. Кнопка `diff: <file>` **никогда не рендерится**, а блок аргументов вызова скрыт.
   - **Как чинить:** Передавать реальный `argsText: raw?.arguments ?? (raw?.rawArguments || "")`, либо в `ToolCall` читать готовый объект `args` из пропсов.

5. [`.github/workflows/ci.yml:34, 88-91`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L34-L91) — **CI Release сломается при теге: отсутствие `libfuse2` для AppImage и рассинхрон lockfile**
   - **Суть:** На раннере `ubuntu-latest` (Ubuntu 24.04) отсутствует библиотека `libfuse2`, без которой `appimagetool` в `pnpm tauri build` не может собрать `.AppImage` (на локальной машине собрался только `LettaDock.AppDir`). Шаг `softprops/action-gh-release` упадет из-за отсутствия файла `*.AppImage`. Кроме того, незакоммиченные правки в `package.json`/`pnpm-lock.yaml` сломают шаг `pnpm install --frozen-lockfile`.
   - **Как чинить:** Добавить `libfuse2` в `apt-get install` в [`.github/workflows/ci.yml`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L34), а также синхронизировать и закоммитить `pnpm-lock.yaml`.

---

#### P2: Стоит поправить

6. [`src/letta/liveSession.ts:80-82`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L80-L82) и [`src/store/appStore.ts:395-401`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L395-L401) — **Гонка быстрого переключения диалогов (`loadHistory`)**
   - **Суть:** При быстром клике по нескольким диалогам медленный ответ для диалога А может прийти позже ответа для диалога Б.
   - **Почему:** Внутри `loadHistory` вызов `this.emit()` сразу пушит данные в Zustand через `onMessages`. Проверка в `appStore.ts` срабатывает уже после того, как устаревшие сообщения были записаны в стейт.
   - **Как чинить:** Ввести requestId / версию загрузки в `LiveSessionManager` и проверять актуальность ID перед вызовом `this.emit()`.

7. [`src/components/Sidebar.tsx:127-134`](file:///home/itolstov/Projects/mtl/LettaDock/src/components/Sidebar.tsx#L127-L134) и [`src/store/appStore.ts:197-199`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L197-L199) — **«Призрачный выбор» диалога при старте**
   - **Суть:** Из `localStorage` восстанавливаются `selectedAgentId` и `selectedConversationId`, но данные по ним не запрашиваются.
   - **Почему:** Вызывается только `connect(selectedProfileId)`. Список диалогов агента и сам диалог не открываются: в сайдбаре агент подсвечен, но диалоги пишут «Выбери агента», а чат пуст.
   - **Как чинить:** После успешного `connect` автоматически вызывать `listConversations` и `openConversation` для сохранённых ID.

8. [`src/letta/upload.ts:23`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/upload.ts#L23) — **IPC-зависание и риск OOM при вызове `Array.from(buf)`**
   - **Суть:** Для файла размером 15–20 МБ создается JS-массив из десятков миллионов чисел, сериализуемый в гигантский JSON-массив строк.
   - **Как чинить:** Добавить валидацию и ограничение максимального размера загружаемого файла (например, 20 МБ) с понятным алертом в интерфейсе.

9. [`src-tauri/src/proxy.rs:42, 94`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L42) — **Создание нового `reqwest::Client` на каждый HTTP-запрос**
   - **Суть:** Новый клиент инициализируется на каждый вызов команд.
   - **Почему:** Теряется пул соединений (HTTP Keep-Alive), и каждый запрос заново выполняет TLS-хэндшейк, замедляя работу UI.
   - **Как чинить:** Хранить единый `reqwest::Client` в состоянии `tauri::State` или через `OnceLock`.

10. [`src/chat/images.ts:61`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/images.ts#L61) — **Жестко зашит `mediaType: "image/png"`**
    - **Суть:** Если изображение не масштабировалось и было JPEG или WebP, оно все равно возвращается как `image/png`.
    - **Как чинить:** Извлекать реальный MIME-тип из префикса исходного `dataUrl`.

11. [`src/fileViewer/FileViewer.tsx:74`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L74) и [`src/store/appStore.ts:449`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L449) — **Клики по чипам `[файл: ...]` всегда открывают ошибку**
    - **Суть:** Для локальных путей просмотр не реализован, а песочница удаляется сразу после загрузки файла через `terminateSandbox`. Вьюер гарантированно падает в `"нет источника содержимого"`.
    - **Как чинить:** Отключить кликабельность чипов для локальных путей (показывать понятный тултип), либо не удалять песочницу немедленно.

12. [`docs/backlog.md:10`](file:///home/itolstov/Projects/mtl/LettaDock/docs/backlog.md#L10) — **Утечка локального пути автора (`home_itolstov`)**
    - **Суть:** В документации фигурирует локальное имя пользователя автора.
    - **Как чинить:** Заменить на обезличенный путь `home_user` или `~/.letta/projects`.

13. [`src-tauri/src/clipboard.rs:13`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L13) и [`src-tauri/tauri.conf.json`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json) — **Зависимость от `wl-clipboard` без объявления в пакете**
    - **Суть:** На чистой Wayland-системе без пакета `wl-clipboard` вставка картинок молча не будет работать.
    - **Как чинить:** Добавить `wl-clipboard` в рекомендации deb-пакета и отразить в README.

---

#### P3: Вкусовщина и мелкие шероховатости

14. [`src-tauri/src/lib.rs:29-46`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L29-L46) и [`src/letta/localKey.ts:10-13`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/localKey.ts#L10-L13) — В release-сборке фронтенд генерирует десятки холостых отклоненных IPC-вызовов `append_debug_log`. Рекомендуется проверять `import.meta.env.DEV`.
15. [`src/letta/proxyClient.ts:198`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/proxyClient.ts#L198) — Метод `downloadSandboxFile` избыточно принимает `apiKey`, хотя класс уже хранит `this.apiKey`.
16. [`src-tauri/src/lib.rs:35`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L35), [`src-tauri/src/clipboard.rs:17, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L17) — Предупреждения Clippy по поводу вложенных `if` (`collapsible_if`).
17. [`src/chat/ChatRuntime.tsx:95`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L95) — Коллизия `toolCallId` в `approval_request_message` при дублировании имен тулов (лучше брать `m.id`).
18. [`src/chat/MarkdownText.tsx:45`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MarkdownText.tsx#L45) — Добавить `rel="noopener noreferrer"` и обработку `auxclick` для внешних ссылок.
19. [`package.json:6`](file:///home/itolstov/Projects/mtl/LettaDock/package.json#L6) — Добавить `"test": "vitest run"` в секцию `scripts`.
20. `docs/drafts/agy_release_review.md` — Удалить пустой файл (0 байт), висящий в untracked.

---

### Что упростить
1. **Удалить команду `proxy_download_sandbox_file` в Rust**: скачивание файла из песочницы — это обычный `GET /v1/sandboxes/{id}/files?path=...`, который полностью укладывается в общую команду `proxy_letta_api`.
2. **Отключить логирование в `/tmp` в production**: убрать лишний IPC-трафик в релизной сборке.
3. **Убрать избыточный параметр `apiKey` в `downloadSandboxFile`** в пользу внутреннего поля `this.apiKey`.

---

### Чего не хватает в тестах
1. **Закоммитить существующие модульные тесты**: файлы [`src/letta/cloudAdapter.test.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.test.ts) и `src/letta/modelInfo.test.ts` сейчас не закоммичены.
2. **Добавить тесты на гонки**: тест в `liveSession.test.ts` на эмуляцию переключения диалогов во время активного стрима.
3. **Rust-тесты**: тест в `proxy.rs` на SSRF-проверку путей (включая невалидные и многобайтовые UTF-8 строки для проверки отсутствия паники).
4. **CI-интеграция**: добавить запуск `pnpm test` и `cargo test` перед шагом сборки в [`.github/workflows/ci.yml`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml).

---

### Чек секретов
- **Ключи и токены**: Реальных секретов в коде, конфигах и истории git не обнаружено. Ключ хранится в памяти сессии и не пишется в `localStorage`. В логах отображается только длина ключа (`keyLen`).
- **Персональные данные**: В [`docs/backlog.md:10`](file:///home/itolstov/Projects/mtl/LettaDock/docs/backlog.md#L10) найдена строка `home_itolstov`. В `Cargo.toml` и git указан автор `Igor Tolstov` (`attid0@gmail.com`).
- **Артефакты**: `.gitignore` корректно закрывает `.letta/`, `dist/`, `target/`.

---

### Вердикт одной строкой
**Чинить и публиковать.** (Архитектура крепкая, но требуется закрыть 5 блокеров P1 — в первую очередь панику/дедлок в `proxy_upload_file`, гонку смены диалогов в `liveSession` и сборку AppImage в CI).
