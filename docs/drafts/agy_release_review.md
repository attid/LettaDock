Подробный технический план устранения всех найденных замечаний и пошаговый чеклист оформлены в артефакте [`pre_release_fix_plan.md`](file:///home/itolstov/.gemini/antigravity-cli/brain/fae1be49-6395-4525-8471-670b07a9ce53/pre_release_fix_plan.md). Ниже представлен полный отчет независимого ревью по согласованной структуре.

---

### Чек секретов и приватности

1. **История Git (`git log -p`):** Чисто. Токены Letta, ключи `sk-...`, `LETTER_...`, Bearer-токены в истории коммитов отсутствуют.
2. **Файлы настроек:** Директория `.letta/` и файл `settings.local.json` корректно внесены в [.gitignore](file:///home/itolstov/Projects/mtl/LettaDock/.gitignore#L19-L21) и никогда не попадали в индекс Git.
3. **Пути владельца:** Локальный путь `/home/itolstov` в коде и репозитории отсутствует. В коде и документации упоминается имя зарегистрированного компьютера `ibook26` (в [types.ts](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/types.ts#L10), [cloudAdapter.ts](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L249), [App.tsx](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L217) и [docs/](file:///home/itolstov/Projects/mtl/LettaDock/docs/phase3-session-notes.md)) — секретом не является, но в публичных доках может быть обезличено (например, `local-machine`).
4. **Логирование:** В [cloudAdapter.ts](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L110-L112) логируется только длина ключа (`keyLen=${apiKey.length}`), сам ключ не выводится. Функция `append_debug_log` пишет в `/tmp/lettadock-ui.log` — для публичного релиза логирование в общий `/tmp` небезопасно.

---

### Находки по приоритетам

#### P1 — Блокеры релиза (баг / безопасность)

1. [`src-tauri/tauri.conf.json:20-22`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json#L20-L22)
   - **Суть:** Отключен Content Security Policy (`"security": { "csp": null }`).
   - **Почему:** При рендеринге Markdown и внешних сообщений от агентов/LLM отсутствие CSP открывает окно для XSS: исполнение внедренного JS внутри WebView с доступом к IPC-командам Tauri.
   - **Как чинить:** Задать строгий CSP: `default-src 'self'; connect-src 'self' https://api.letta.com wss://*.letta.com; img-src 'self' data: asset:; style-src 'self' 'unsafe-inline'; script-src 'self';`

2. [`src-tauri/src/proxy.rs:34, 50`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L34-L50)
   - **Суть:** Формирование URL через конкатенацию `format!("https://api.letta.com{}", req.path)` с безусловной отправкой `Authorization: Bearer <api_key>`.
   - **Почему:** SSRF / утечка API-ключа: если `req.path` содержит `@evil.com` (например, `@attacker.com/v1/...`), парсер URL воспримет `api.letta.com` как userinfo, а запрос с боевым Bearer-токеном отправится на сторонний сервер. Пути `//evil.com` также не фильтруются.
   - **Как чинить:** Валидировать, что `req.path` начинается строго с `/v1/`, не содержит `@`, не начинается с `//` и гарантированно резолвится на хост `api.letta.com`.

3. [`src-tauri/src/clipboard.rs:21-31`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L21-L31)
   - **Суть:** Сохранение скриншота буфера в предсказуемый `/tmp/lettadock-clip.png` и запуск внешней утилиты `base64 -w0`.
   - **Почему:** Уязвимость к symlink-атакам в shared `/tmp` (CWE-377), утечка конфиденциальных скриншотов локальным процессам, несовместимость с macOS/non-GNU (флаг `-w0`). При этом крейт `base64` уже скачан в `Cargo.lock`.
   - **Как чинить:** Подключить `base64` в [Cargo.toml](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/Cargo.toml) и кодировать `out.stdout` в памяти через `base64::engine::general_purpose::STANDARD.encode(&out.stdout)` без диска и без `std::process::Command`.

4. [`src/chat/MarkdownText.tsx:44-46`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MarkdownText.tsx#L44-L46)
   - **Суть:** Тег `<a>` рендерится как стандартная HTML-ссылка без перехвата клика.
   - **Почему:** Клик по внешней ссылке открывает ее прямо в окне WebKitGTK, безвозвратно замещая интерфейс приложения. Ссылки `javascript:...` могут приводить к выполнению произвольного JS.
   - **Как чинить:** Подключить `@tauri-apps/plugin-opener` (уже есть в зависимостях), перехватывать `onClick`: отменять переход (`e.preventDefault()`), проверять протокол (`http/https`) и открывать URL во внешнем системном браузере через `openUrl(href)`. Ссылки `javascript:` блокировать.

5. [`src/letta/liveSession.ts:142-219`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L142-L219)
   - **Суть:** Race condition при переключении диалогов во время активного стриминга.
   - **Почему:** Метод `loadHistory(convB)` закрывает сессию, но не отменяет асинхронный цикл `for await (const msg of this.session.stream())` диалога A. Ошибки или остаточные чанки диалога A затирают стейт диалога B, а по завершении стрима вызов `this.adapter.getHistory(conversationId, 50)` перезаписывает историю диалога B сообщениями из A. При этом `sendInternal` блокирует отправку в любых диалогах (`if (this.turn.phase === "streaming") return`).
   - **Как чинить:** Хранить `activeTurnConversationId`, в `loadHistory()` вызывать `this.abort()`, а в стрим-цикле и блоках `catch`/`finally` проверять совпадение ID диалога перед вызовом `emit()` и обновлением истории.

6. [`src/store/appStore.ts:369-408`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L369-L408)
   - **Суть:** Асинхронная гонка в [`openConversation`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L369).
   - **Почему:** При быстром клике по диалогам (A -> B) два промиса выполняются параллельно. Если A завершится позже B, стор запишет историю A в `liveMessages`, когда в интерфейсе уже активен диалог B.
   - **Как чинить:** Проверять `if (get().selectedConversationId !== id) return;` после завершения асинхронных вызовов.

7. [`src/chat/MyThread.tsx:57, 78`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L57-L78)
   - **Суть:** Кнопка дифф-просмотрщика в [`ToolCall`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L57) завязана на `{canDiff && onOpenFile && ...}`.
   - **Почему:** Компонент передается в `@assistant-ui/react` через `components={{ tools: { Fallback: ToolCall } }}`. Библиотека никогда не передает кастомный проп `onOpenFile`, поэтому он всегда `undefined`. Кнопка `diff: <filename>` для инструментов `Edit/Write` **не рендерится никогда**.
   - **Как чинить:** Использовать `openFileRef.current?.(filePath!)`, точно так же, как сделано в [`FileChips`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L38).

8. [`src/fileViewer/FileViewer.tsx:57-60`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L57-L60)
   - **Суть:** В команду `proxy_download_sandbox_file` передаются только `{ sandboxId, path }` без `apiKey`.
   - **Почему:** Rust-обработчик [`proxy_download_sandbox_file`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L70-L80) требует обязательное поле `api_key: String`. Десериализация serde падает с ошибкой `missing field apiKey`. Скачивание файлов из песочницы гарантированно не работает.
   - **Как чинить:** Передавать `apiKey` из стора через `useAppStore.getState().getProfileKey()`.

9. [`.github/workflows/ci.yml:80-81`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L80-L81)
   - **Суть:** В релизной джобе `release` отсутствует шаг `pnpm install`.
   - **Почему:** В runner-контейнере нет `node_modules` и CLI Tauri. Сборка релиза по тегам `v*` гарантированно упадет на шаге `pnpm tauri build`.
   - **Как чинить:** Добавить шаг `run: pnpm install --frozen-lockfile` перед сборкой.

10. [`.github/workflows/ci.yml:5, 8`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L5-L8)
    - **Суть:** Воркфлоу триггерится только на ветку `main`, а локальная ветка в Git — `master`.
    - **Почему:** При публикации репозитория с веткой `master` CI вообще не будет запускаться на push/PR.
    - **Как чинить:** Переименовать ветку в `main` (`git branch -M main`) перед публикацией или указать в `ci.yml` `branches: [main, master]`.

---

#### P2 — Стоит поправить

1. [`src-tauri/src/proxy.rs:111, 122`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L111-L122)
   - **Суть:** Блокирующий вызов `reqwest::blocking::Client` внутри асинхронной команды Tauri `proxy_upload_file`.
   - **Почему:** Блокирует поток выполнения Tokio; тянет тяжелую зависимость `blocking` в `Cargo.toml`.
   - **Как чинить:** Использовать асинхронный `reqwest::multipart::Form` и вызов `client.post(...).send().await`.

2. [`src/lib/mockData.ts:1-41`](file:///home/itolstov/Projects/mtl/LettaDock/src/lib/mockData.ts#L1-L41)
   - **Суть:** 41 строка неиспользуемых мок-данных Phase 1 (`MOCK_SERVERS`, `MOCK_AGENTS`, `MOCK_CONVERSATIONS`).
   - **Почему:** Мертвый груз в кодовой базе.
   - **Как чинить:** Удалить файл [`src/lib/mockData.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/lib/mockData.ts).

3. [`src-tauri/src/lib.rs:25-43`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L25-L43)
   - **Суть:** Хардкод пути `/tmp/lettadock-ui.log` для отладочного лога.
   - **Почему:** На многопользовательской системе файл в `/tmp` подвержен подмене прав или symlink-атаке; на Windows путь не существует.
   - **Как чинить:** Писать в системный каталог логов приложения (`app_handle.path().app_log_dir()`) или закрыть команду макросом `#[cfg(debug_assertions)]`.

4. [`src/chat/images.ts:51, 61`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/images.ts#L51-L61)
   - **Суть:** Хардкод `mediaType: "image/png"` для картинок <= 2000px, независимо от исходного формата.
   - **Почему:** Если в буфере был JPEG/WebP, base64 берется из `dataUrl` как есть, но отправляется в Letta/LLM под видом PNG.
   - **Как чинить:** Извлекать реальный MIME-тип из заголовка `dataUrl`. В [`ChatRuntime.tsx:181`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L181) брать `img.mediaType`, а не хардкодить `image/png`.

5. [`src/components/Sidebar.tsx:123-132`](file:///home/itolstov/Projects/mtl/LettaDock/src/components/Sidebar.tsx#L123-L132)
   - **Суть:** Пустой хук `useEffect` авто-подключения при старте.
   - **Почему:** При перезапуске приложения сохраненный `selectedProfileId` восстанавливается из `localStorage`, но подключение к серверу не стартует, пока пользователь не кликнет на сервер вручную (хотя ключ может быть доступен в `settings.json`).
   - **Как чинить:** Вызывать `connect(selectedProfileId)` при старте или убрать пустой хук.

6. [`src/letta/upload.ts:30`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/upload.ts#L30)
   - **Суть:** Возврат `(parsed.files ?? [])[0]` без проверки на существование элемента.
   - **Почему:** Если бэкенд вернет пустой список, функция вернет `undefined`, что приведет к падению `uploaded.path` в вызывающем коде.
   - **Как чинить:** Выбрасывать ошибку `if (!parsed.files?.[0]) throw new Error(...)`.

7. [`src-tauri/src/lib.rs:9`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L9)
   - **Суть:** `std::env::var("HOME")` для поиска `~/.letta/settings.json`.
   - **Почему:** На Windows переменная `HOME` отсутствует (используется `USERPROFILE`).
   - **Как чинить:** Использовать `dirs::home_dir()`.

8. [`src/App.tsx:96-99`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L96-L99) и [`src/letta/cloudAdapter.ts:278`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L278)
   - **Суть:** В [`TargetSelector`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L96) передается `deviceId: profile.computerName` (где имя — это строка вроде `"ibook26"`).
   - **Почему:** В Letta SDK `deviceId` — это UUID зарегистрированного устройства. Передача человекочитаемого имени в поле `deviceId` приведет к ошибке сессии.
   - **Как чинить:** В адаптере проверять тип идентификатора или передавать `name: targetOverride.name`.

9. [`src/letta/modelInfo.ts:30`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/modelInfo.ts#L30)
   - **Суть:** Обращение `conversation.model` без проверки на `null`/`undefined`.
   - **Почему:** Если API вернет пустой ответ, функция упадет с `TypeError`.
   - **Как чинить:** Добавить `if (!conversation) return null;`.

---

#### P3 — Чистка и полировка

1. [`index.html:7`](file:///home/itolstov/Projects/mtl/LettaDock/index.html#L7) — Заменить дефолтный `<title>Tauri + React + Typescript</title>` на `LettaDock` и заменить favicon `/vite.svg` на иконку приложения.
2. [`src-tauri/Cargo.toml:4-5`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/Cargo.toml#L4-L5) — Заменить `authors = ["you"]` и `description = "A Tauri App"` на реальные метаданные.
3. [`package.json:20`](file:///home/itolstov/Projects/mtl/LettaDock/package.json#L20) — Удалить неиспользуемую зависимость `class-variance-authority`.
4. [`src/App.tsx:228`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L228) — Вызов `registerFileOpener(handleOpenFile)` происходит прямо в теле рендера компонента. Обернуть в `useEffect`.
5. [`docs/drafts/agy_release_review.md`](file:///home/itolstov/Projects/mtl/LettaDock/docs/drafts/agy_release_review.md) — Удалить пустой файл (0 байт) перед релизом.
6. [`src-tauri/src/proxy.rs`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L33) — Создание `reqwest::Client::new()` на каждый запрос. Вынести в Tauri State или `OnceLock` для переиспользования connection pool и TLS-сессий.

---

### Что упростить

1. **Буфер обмена в Rust ([`src-tauri/src/clipboard.rs`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs)):**
   Убрать запись в `/tmp`, спавн субпроцесса `base64 -w0` и последующее удаление файла. Кодировать байты `stdout` прямо в памяти через крейт `base64`. Это сократит 25 строк кода и уберет дисковые гонки.
2. **Отказ от `reqwest::blocking` ([`src-tauri/src/proxy.rs`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs)):**
   Перевод `proxy_upload_file` на асинхронный multipart позволит выкинуть флаг `"blocking"` из `Cargo.toml`, сократив время сборки и вес бинарника.
3. **Централизация вызова просмотрщика ([`src/chat/MyThread.tsx`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx)):**
   Вместо глобальной переменной `openFileRef` вызывать метод открытия файла через `appStore` (`useAppStore.getState().openViewer(...)`), сделав навигацию прозрачной и типизированной.

---

### Чего не хватает в тестах

В репозитории сейчас **0 тестов**. Рекомендуется минимально настроить Vitest и добавить следующие проверки:

1. **Санитизация сообщений (`src/letta/cloudAdapter.test.ts`):**
   - Тестирование [`stripRemindersFromText`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L43): вырезание блоков `<system-reminder>`, одиночных тегов, пробелов.
   - Тестирование [`contentToParts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L55): парсинг строковых JSON-массивов с объектами `{type: 'text'}` и `{type: 'image'}`.
2. **Расчет контекста (`src/letta/modelInfo.test.ts`):**
   - Тестирование [`extractModelInfo`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/modelInfo.ts#L29): формула `chars / 4`, расчет процентовки, корректность при `limit = 0`, пустом списке сообщений и `null`.
3. **Парсинг маркеров изображений (`src/chat/ChatRuntime.test.ts`):**
   - Разбор текста вида `"до [1] после [2]"` и сопоставление с массивом `pendingImages`.
4. **Rust unit-тесты (`src-tauri/src/proxy.rs`):**
   - Проверка валидатора путей прокси: блокировка `@evil.com`, `//evil.com`, `../` и пропуск `/v1/agents`.

---

### Вердикт

**Чинить и публиковать** (в коде найдено 10 критических P1 проблем: блокирующий CSP, риск утечки ключа через прокси, гарантированное падение CI-релиза и сломанный просмотр диффов/файлов).
