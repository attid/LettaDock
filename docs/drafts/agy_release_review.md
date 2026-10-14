# Ревью репозитория LettaDock перед первым публичным релизом

Проведено полное независимое ревью всего кодовой базы репозитория: Rust-бэкенда (`src-tauri/`), адаптера Letta и сессий (`src/letta/`), UI и рантайма чата (`src/chat/`, `src/fileViewer/`, `src/store/`, `src/components/`, `src/App.tsx`), конфигураций и CI (`.github/workflows/ci.yml`).

---

### Находки по приоритетам

#### P1: Блокеры релиза (баги логики, гонки, сломанный функционал)

1. [`src/letta/liveSession.ts:221`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L221), [`src/letta/liveSession.ts:80-95`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L80-L95) и [`src/store/appStore.ts:378-390`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L378-L390) — **Гонка стрима и истории при быстром переключении диалогов (Race Condition)**
   - **Суть:** При быстром переключении диалогов сообщения или стрим из одного диалога могут отобразиться в окне другого диалога.
   - **Почему:**
     1. В `liveSession.ts:221` проверка в цикле стрима:
        ```ts
        if (this.activeTurnConversationId !== conversationId) break;
        ```
        `activeTurnConversationId` устанавливается в `conversationId` в строке 212 и **никогда не изменяется и не сбрасывается** в `loadHistory`. В комментарии в строке 56 автор сам отметил: *«the turn id equals its own conversation by construction, so comparing against it was always true»*, но исправил только строку 235, оставив в цикле стрима (строка 221) сравнение, которое всегда ложно. Стрим не прерывается сменой экрана.
     2. В `appStore.ts:378-390` при смене диалога создается новый экземпляр `LiveSessionManager`. Старый экземпляр диспозится асинхронно (`await live.dispose()`), но его метод `dispose()` вызывает лишь `closeSession()`, не отменяя уже запущенный `loadHistory()` и не отвязывая `handlers.onMessages`. Когда отложенный сетевой ответ `getHistory()` старого экземпляра возвращается, он вызывает `this.emit()` и затирает сообщения в сторе историей брошенного диалога.
     3. Переменная `activeTurnConversationId` не сбрасывается в `null` в блоке `finally` в `sendInternal()`, из-за чего строка 82 в `loadHistory()` считает любой предыдущий завершенный ход активным и вхолостую ставит `this.aborted = true`.
   - **Как чинить:**
     - В цикле стрима (строка 221) сравнивать с текущим экраном: `if (this.currentViewConversationId !== conversationId) break;`.
     - В `sendInternal()` взводить `activeTurnConversationId` до `openSession()`, а в блоке `finally` гарантированно сбрасывать `this.activeTurnConversationId = null`.
     - В `LiveSessionManager` добавить флаг `private disposed = false;`. В методе `dispose()` выставлять `this.disposed = true`, а в начале `emit()` делать `if (this.disposed) return;`.

2. [`src/fileViewer/FileViewer.tsx:9-12`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L9-L12) и [`src-tauri/tauri.conf.json:21`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json#L21) — **Monaco Editor блокируется строгой CSP-политикой и не загрузится (полный отказ просмотрщика)**
   - **Суть:** Компонент Monaco Editor гарантированно падает с ошибкой загрузки при попытке открыть любой файл или дифф.
   - **Почему:**
     В `tauri.conf.json:21` задан строгий CSP:
     `script-src 'self'; connect-src 'self' https://api.letta.com wss://api.letta.com;`
     Библиотека `@monaco-editor/react` по умолчанию не бандлит ядро Monaco, а пытается на лету инжектировать скрипт загрузчика с внешнего CDN (`https://cdn.jsdelivr.net/...`). Движок WebKitGTK блокирует этот запрос по правилу `script-src 'self'`. При этом локальный пакет `monaco-editor` уже есть в `package.json`, но загрузчик на него не настроен.
   - **Как чинить:**
     Настроить `@monaco-editor/react` на использование локального бандла `monaco-editor`:
     ```ts
     import * as monaco from "monaco-editor";
     import { loader } from "@monaco-editor/react";
     loader.config({ monaco });
     ```

3. [`src/fileViewer/FileViewer.tsx:74`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L74), [`src/chat/MyThread.tsx:23-28, 80`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L23-L28), [`src/App.tsx:226-227`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L226-L227) — **Клики по чипам `[файл: ...]` и кнопке `diff: ...` всегда падают в ошибку**
   - **Суть:** Пользователь видит кликабельные кнопки файлов и диффов, но нажатие на них всегда открывает окно с текстом: *«нет источника содержимого (sandbox недоступен)»*.
   - **Почему:**
     - `openFileRef` в `MyThread.tsx:23` типизирован как `(path: string) => void`.
     - В `ToolCall` (строка 80) определяются `filePath` и `newContent`, но в функцию передается только голый `filePath!`, а `newContent` отбрасывается.
     - В `App.tsx:226` обработчик вызывает `setViewerFile({ path })`, не передавая ни `newContent`, ни `sandboxId`.
     - В `FileViewer.tsx:51-74` проверяется: если нет `file.newContent` и нет `file.sandboxId`, немедленно выбрасывается исключение.
   - **Как чинить:**
     - Расширить сигнатуру `registerFileOpener(fn: (ref: FileRef) => void)`.
     - В `ToolCall` передавать `{ path: filePath, newContent, oldContent: args.old_string as string | undefined }`.
     - Для загруженных файлов сохранять ID созданной песочницы в сторе и прокидывать `sandboxId` в `FileRef`.

---

#### P2: Стоит поправить перед релизом (надежность, UX, окружение)

4. [`src/fileViewer/FileViewer.tsx:96`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L96) — **Кнопка «закрыть (Esc)» не реагирует на клавишу Escape**
   - **Суть:** В интерфейсе просмотрщика написано `закрыть (Esc)`, однако нажатие клавиши `Escape` ничего не делает.
   - **Почему:** В компоненте отсутствует обработчик события клавиатуры `keydown`.
   - **Как чинить:** Добавить `useEffect` с `window.addEventListener("keydown", (e) => { if (e.key === "Escape") onClose(); })`.

5. [`src/chat/images.ts:61`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/images.ts#L61) — **Подмена MIME-типа изображения на `image/png`**
   - **Суть:** Если изображение не требовало масштабирования (размер менее 2000x2000) и было формата JPEG или WebP, оно отправляется в API с заголовком `image/png`.
   - **Почему:** В строке 61 жестко зашито `mediaType: "image/png"`.
   - **Как чинить:** Определять MIME-тип из префикса исходного `dataUrl` (`dataUrl.match(/^data:([^;]+);/)?.[1] || "image/png"`), если картинка не рендерилась через canvas.

6. [`src/letta/localKey.ts:10-13`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/localKey.ts#L10-L13) и [`src-tauri/src/lib.rs:29-73`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L29-L73) — **Массовые ошибки IPC в релизной сборке из-за `append_debug_log`**
   - **Суть:** В продакшене консоль засоряется неперехваченными rejected-промисами `Command append_debug_log not found`.
   - **Почему:** Команда зарегистрирована в Rust только под `#[cfg(debug_assertions)]`, но фронтенд продолжает вызывать её на каждое действие пользователя.
   - **Как чинить:** В `localKey.ts` поставить guard:
     ```ts
     export async function appendDebugLog(line: string): Promise<void> {
       if (!import.meta.env.DEV) return;
       const { invoke } = await import("@tauri-apps/api/core");
       await invoke("append_debug_log", { line });
     }
     ```

7. [`src/chat/MarkdownText.tsx:44-62`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MarkdownText.tsx#L44-L62) — **Внешние ссылки в Markdown уязвимы к клику колесиком (`auxclick`)**
   - **Суть:** Клик средней кнопкой мыши по ссылке в сообщении агента не перехватывается `onClick` и может попытаться открыть URL прямо внутри окна WebKitGTK.
   - **Почему:** Перехвачен только `onClick`. Нет `target="_blank"`, `rel="noopener noreferrer"` и перехвата `onAuxClick`.
   - **Как чинить:** Добавить `onAuxClick={(e) => e.preventDefault()}`, атрибуты `target="_blank" rel="noopener noreferrer"` и валидацию `props.href` перед рендером в DOM.

8. [`src-tauri/src/proxy.rs:45, 97, 136`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L45) — **Создание нового `reqwest::Client` на каждый HTTP-запрос**
   - **Суть:** Новый клиент инициализируется на каждый вызов команд прокси.
   - **Почему:** Теряется пул TCP/TLS соединений (HTTP Keep-Alive), каждый запрос заново выполняет TLS-хэндшейк к `api.letta.com`, замедляя отклик UI и расходуя системные сокеты.
   - **Как чинить:** Передавать единый `reqwest::Client` через `tauri::State` или инициализировать через `std::sync::OnceLock`.

9. [`src-tauri/src/clipboard.rs:16, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L16) — **Синхронный запуск внешних утилит `wl-paste` и `xclip` без таймаута**
   - **Суть:** Вызов `Command::output()` синхронно блокирует поток IPC.
   - **Почему:** Если процесс буфера обмена зависнет (например, при удержании выделения другим приложением), команда зависнет навсегда.
   - **Как чинить:** Сделать команды асинхронными (`async fn`) с использованием `tokio::process::Command` и `tokio::time::timeout(Duration::from_millis(500), ...)`.

10. [`src-tauri/src/lib.rs:9`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L9) — **Прямое чтение `$HOME` без фоллбэка**
    - **Суть:** `std::env::var("HOME")` вернет ошибку, если переменная не задана или при запуске под Windows.
    - **Как чинить:** Использовать стандартный `dirs::home_dir()` (крейт `dirs` уже входит в дерево зависимостей Tauri).

11. [`.github/workflows/ci.yml:49-52`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L49-L52) — **В CI не запускаются тесты и Clippy для Rust**
    - **Суть:** CI выполняет только `cargo check`, пропуская `cargo test` и `cargo clippy`.
    - **Как чинить:** Добавить шаги `cargo test --manifest-path src-tauri/Cargo.toml` и `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.

---

#### P3: Вкусовщина, мелкие шероховатости и предупреждения сборки

12. [`src/letta/cloudAdapter.ts:122`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L122) и [`src/App.tsx:134`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L134) — **Неэффективные динамические импорты (предупреждения Vite)**
    - Модули `proxyClient.ts` и `adapters.ts` уже статически импортированы в соответствующих файлах. Динамический `await import(...)` не выносит их в отдельный чанк и порождает варнинги при `pnpm build`.
13. [`src/letta/upload.ts:31`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/upload.ts#L31) — **Сериализация бинарного буфера в массив чисел `Array.from(buf)`**
    - Файл размером 20 МБ разворачивается в массив из 20 млн JS-чисел (~160 МБ в куче) и сериализуется в JSON вида `[1,2,3...]`. Рекомендуется передавать бинарный base64.
14. [`src-tauri/src/lib.rs:35`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L35), [`src-tauri/src/clipboard.rs:17, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L17) — **Предупреждения компилятора `clippy::collapsible_if`**
    - Вложенные блоки `if` можно объединить в один оператор `if let ... && ...`.
15. [`src/chat/ChatRuntime.tsx:100`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L100) — **Коллизия `toolCallId` в `approval_request_message`**
    - Идентификатор берется как `raw?.tool_call?.name ?? m.id`. При наличии нескольких запросов на один и тот же инструмент ключи совпадут. Надежнее использовать `m.id`.
16. `docs/drafts/agy_release_review.md` — В рабочей копии остался пустой модифицированный файл черновика (стоит сбросить перед коммитом).

---

### Что упростить

1. **Удалить команду `proxy_download_sandbox_file` в Rust**:
   - Скачивание файла из песочницы — это обычный `GET /v1/sandboxes/{id}/files?path=...`. Универсальная команда `proxy_letta_api` уже умеет выполнять такие запросы. Отдельная Rust-команда и отдельный метод в клиенте создают лишний дублирующий код.
2. **Отключить логирование в `/tmp` в production**:
   - Ограничить логирование условием `import.meta.env.DEV`, устранив лишние IPC-вызовы.
3. **Убрать избыточный аргумент `apiKey` в `downloadSandboxFile`**:
   - Класс `LettaProxyClient` уже хранит `this.apiKey`, прокидывать его повторно аргументом метода не требуется.

---

### Чего не хватает в тестах

1. **Тесты на жизненный цикл и гонки сессий (`src/letta/liveSession.test.ts`)**:
   - Симуляция смены диалога во время активного стрима: проверить, что события старого диалога не просачиваются в новый.
   - Симуляция быстрого двойного переключения `loadHistory`: проверить, что более медленный первый ответ не перезаписывает второй.
2. **Rust unit-тесты для SSRF-фильтрации в `src-tauri/src/proxy.rs`**:
   - Проверка блокировки обхода путей (`..`), userinfo (`@`), относительных URL (`//`), а также строк с многобайтовыми символами UTF-8 (русские буквы, эмодзи) на предмет корректной работы `chars().take(80)`.
3. **Автоматизация в CI**:
   - Добавить шаги `cargo test` и `cargo clippy` в [`.github/workflows/ci.yml`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml).

---

### Чек секретов

- **API-ключи и пароли**: Реальных секретов в файлах репозитория и истории git-коммитов **не обнаружено**.
- **Хранение ключа**: Ключ держится исключительно в оперативной памяти сессии и не сохраняется в `localStorage`. В логах фиксируется только длина ключа (`keyLen`).
- **Файл настроек Letta**: Директория `.letta/` и файл `settings.json` корректно изолированы в `.gitignore` и в репозиторий не попадают.
- **Персональные данные**:
  - В `src-tauri/Cargo.toml:5` указано имя `Igor Tolstov`.
  - В коммитах git указан email `attid0@gmail.com`.
  - Локальных путей разработчика (`/home/...`) в коде и документации нет.

---

### Вердикт одной строкой

**Чинить и публиковать.** (Архитектура и кодовая база аккуратные и компактные, но публикацию блокируют 3 критических бага P1: гонка смены диалогов в `liveSession`, блокировка Monaco Editor строгим CSP и сломанная передача параметров для открытия файлов и диффов).
