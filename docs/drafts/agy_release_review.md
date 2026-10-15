# Ревью репозитория LettaDock перед первым публичным релизом

Проведено независимое ревью всей кодовой базы репозитория (`src-tauri/`, `src/letta/`, `src/chat/`, `src/store/`, `src/components/`, CI и конфигурационных файлов).

---

## Находки по приоритетам

### P1 — Критические баги и уязвимости (чинить до релиза)

#### 1. Гонка и утечка состояния при смене диалога из-за пересоздания `LiveSessionManager`
- **Файл и строки:** [`src/store/appStore.ts:378-388`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L378-L388) и [`src/letta/liveSession.ts:243-252, 348-350`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L243-L252)
- **Суть:** Если переключить диалог во время стриминга ответа, старый поток падает с ошибкой и перезаписывает стор ошибкой и сообщениями старого диалога прямо поверх нового.
- **Почему:** В [`appStore.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts) при смене диалога старый менеджер уничтожается вызовом `await live.dispose()`, а затем создаётся новый экземпляр `new LiveSessionManager(adapter, ...)`. Защита от устаревшего стрима в [`liveSession.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L245) проверяет:
  ```ts
  if (this.currentViewConversationId !== conversationId) return;
  ```
  Но в старом экземпляре `this.currentViewConversationId` остался равен старому `conversationId` (он обновлялся только в *новом* экземпляре при `loadHistory`). При вызове `dispose()` сессия закрывается, стрим прерывается с ошибкой, условие равенства выполняется (`"A" === "A"`), и старый экземпляр вызывает `this.emit()`, отправляя в Zustand-стор ошибку и историю старого диалога. Сам метод `dispose()` никак не отвязывает хендлеры `onMessages` и `onTurnState`.
- **Как чинить:** В [`LiveSessionManager`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L43) добавить флаг `disposed`, отвязывать обработчики в `dispose()` и проверять флаг в начале `emit()`:
  ```ts
  async dispose(): Promise<void> {
    this.aborted = true;
    this.handlers = { onMessages: () => {}, onTurnState: () => {} };
    await this.closeSession();
  }
  ```

#### 2. Клики по чипам прикрепленных файлов `[файл: ...]` всегда завершаются ошибкой
- **Файл и строки:** [`src/fileViewer/FileViewer.tsx:70-89`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L70-L89), [`src/chat/MyThread.tsx:45`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L45), [`src/store/appStore.ts:440-456`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L440-L456)
- **Суть:** При нажатии на скрепку файл загружается в песочницу, в текст вставляется чип `[файл: /path]`. Однако клик по этому чипу в чате всегда выбрасывает ошибку: `нет источника содержимого (sandbox недоступен)`.
- **Почему:** Метод `attachFile` создаёт `sandboxId`, но возвращает наружу только `{ path, name }`. Чип [`FileChips`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L37) при клике передает в просмотрщик только `{ path: m[1] }` без `sandboxId`. Компонент [`FileViewer`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L49) для скачивания файла строго требует `file.sandboxId`. Поскольку `sandboxId` нигде не сохраняется и не передаётся, условие `if (file.sandboxId)` не срабатывает, и немедленно бросается ошибка.
- **Как чинить:** Сохранять маппинг `fileSandboxes: Record<string, string>` в [`appStore.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts) при загрузке файла и передавать `sandboxId` при открытии пути, либо кодировать ID песочницы прямо в чипе.

#### 3. Коллизия `toolCallId` в `approval_request_message` ломает рендер React
- **Файл и строки:** [`src/chat/ChatRuntime.tsx:100`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L100)
- **Суть:** В сообщениях подтверждений действий `toolCallId` формируется как `raw?.tool_call?.name ?? m.id`.
- **Почему:** Если в диалоге есть несколько запросов на подтверждение вызова одного и того же инструмента (например, два запроса `execute_bash`), оба получат одинаковый идентификатор `toolCallId: "execute_bash"`. Библиотека `@assistant-ui/react` использует `toolCallId` в качестве ключа (`key`) элементов списка, что приводит к конфликтам ключей в React, предупреждениям в консоли и сбоям рендеринга состояния аппрувов.
- **Как чинить:** Использовать уникальный ID сообщения: `toolCallId: m.id` (или `raw?.tool_call_id ?? m.id`).

#### 4. Клик средней кнопкой мыши (`auxclick`) по внешним ссылкам ломает окно приложения
- **Файл и строки:** [`src/chat/MarkdownText.tsx:47-61`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MarkdownText.tsx#L47-L61)
- **Суть:** Если кликнуть по ссылке в сообщении ассистента колесиком мыши (средней кнопкой), WebKitGTK открывает страницу прямо внутри десктопного окна LettaDock, уничтожая весь интерфейс приложения.
- **Почему:** Обработчик `onClick` перехватывает только нажатия левой кнопки (`button === 0`). Клик колесиком мыши генерирует событие `auxclick` (`button === 1`), которое браузерный движок WebKit обрабатывает нативно и выполняет переход по URL внутри основного окна webview.
- **Как чинить:** Добавить блокировку `onAuxClick`:
  ```tsx
  onAuxClick={(e) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(href));
    }
  }}
  ```

---

### P2 — Важные исправления (стоит поправить)

#### 5. Статический импорт `FileViewer` и IIFE в модуле ломают lazy-loading Monaco Editor
- **Файл и строки:** [`src/App.tsx:5`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L5) и [`src/fileViewer/FileViewer.tsx:12-22`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L12-L22)
- **Суть:** Весь огромный бандл `monaco-editor` (~4 МБ JS + 90 языковых чанков) загружается в память сразу при запуске приложения, вопреки требованию спеки §2 и комментарию в коде.
- **Почему:** [`App.tsx`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx) статически импортирует `FileViewer`. На верхнем уровне [`FileViewer.tsx`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx) выполняется самовызывающаяся функция, делающая `import("monaco-editor")`. В итоге браузер выкачивает весь редактор до того, как пользователь открыл хотя бы один файл.
- **Как чинить:** В [`App.tsx`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx) загружать компонент лениво:
  ```tsx
  const FileViewer = lazy(() => import("./fileViewer/FileViewer").then(m => ({ default: m.FileViewer })));
  ```
  А вызов `loader.config({ monaco })` переместить внутрь `useEffect` компонента `FileViewer`.

#### 6. Сохраненный выбор агента и диалога из `localStorage` не восстанавливается при старте
- **Файл и строки:** [`src/components/Sidebar.tsx:128-134`](file:///home/itolstov/Projects/mtl/LettaDock/src/components/Sidebar.tsx#L128-L134) и [`src/store/appStore.ts:197-199`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L197-L199)
- **Суть:** При перезапуске приложения `selectedAgentId` и `selectedConversationId` вычитываются из `localStorage`, но список диалогов и история не загружаются — пользователь видит пустой экран.
- **Почему:** [`Sidebar.tsx`](file:///home/itolstov/Projects/mtl/LettaDock/src/components/Sidebar.tsx) при монтировании вызывает только `connect(selectedProfileId)`. Метод `connect` загружает профиль и агентов, но не вызывает `selectAgent` и `openConversation`. В результате список диалогов агента не запрашивается, а активный диалог не открывается.
- **Как чинить:** В конце успешного выполнения `connect` в [`appStore.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts) проверять наличие сохраненного `selectedAgentId` и подгружать диалоги, а при наличии `selectedConversationId` вызывать `openConversation`.

#### 7. Кнопка «закрыть (Esc)» в просмотрщике файлов не реагирует на клавишу Escape
- **Файл и строки:** [`src/fileViewer/FileViewer.tsx:109-112`](file:///home/itolstov/Projects/mtl/LettaDock/src/fileViewer/FileViewer.tsx#L109-L112)
- **Суть:** В шапке оверлея написано «закрыть (Esc)», но нажатие на клавишу Escape не закрывает просмотрщик.
- **Почему:** Обработчик нажатия клавиш в компоненте отсутствует.
- **Как чинить:** Добавить `useEffect` с перехватом `Escape`:
  ```tsx
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  ```

#### 8. Синхронный вызов `wl-paste` и `xclip` в Rust без таймаута и отсутствие зависимостей в Linux-пакете
- **Файл и строки:** [`src-tauri/src/clipboard.rs:16, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L16) и [`src-tauri/tauri.conf.json:24-34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json#L24-L34)
- **Суть:** Вызов `Command::new("wl-paste").output()` блокирует синхронный поток Tauri команды. Если буфер обмена Wayland зависнет (известный баг некоторых компоузеров), поток зависает. Кроме того, на машинах без пакетов `wl-clipboard` / `xclip` вставка картинок молча не работает, а в `tauri.conf.json` они не прописаны в системных зависимостях deb.
- **Как чинить:** Прописать в [`tauri.conf.json`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/tauri.conf.json) в секцию `bundle.linux.deb.depends` пакеты `wl-clipboard` и `xclip`.

#### 9. Неэффективная сериализация бинарного буфера в массив чисел при загрузке файлов (`Array.from(buf)`)
- **Файл и строки:** [`src/letta/upload.ts:31`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/upload.ts#L31)
- **Суть:** При загрузке файлов буфер `Uint8Array` превращается в JS-массив через `Array.from(buf)`.
- **Почему:** Для файлов до 20 МБ это создаёт массив из 20 миллионов JavaScript чисел, что приводит к выделению >150 МБ памяти в V8 и блокировке UI-потока на сериализации JSON IPC-моста. В Tauri 2 типизированный `Uint8Array` передается напрямую без преобразования в массив чисел.
- **Как чинить:** Передавать `bytes: buf` (или использовать бинарную передачу/base64).

#### 10. Создание нового `reqwest::Client` на каждый вызов команд прокси в Rust
- **Файл и строки:** [`src-tauri/src/proxy.rs:45, 97, 136`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L45)
- **Суть:** Каждое обращение к API создаёт новый экземпляр `reqwest::Client::new()`.
- **Почему:** Не работает пул соединений (HTTP Keep-Alive). На каждый мелкий запрос выполняется новый TCP-хэндшейк и TLS-согласование, что замедляет работу и увеличивает нагрузку на сеть.
- **Как чинить:** Сохранять разделяемый экземпляр клиента в Tauri state (`tauri::State<reqwest::Client>`).

#### 11. Смена модели (`setModel`) не обновляет активную сессию `LiveSessionManager`
- **Файл и строки:** [`src/store/appStore.ts:418-430`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L418-L430)
- **Суть:** При выборе другой модели в шапке метод `setModel` обновляет модель на сервере, но не пересоздаёт сессию в `live`.
- **Почему:** Экземпляр `LiveSessionManager` удерживает открытый инстанс SDK `session`. Новые сообщения в этом же диалоге могут продолжать отправляться со старыми параметрами до ручного перезапуска или смены диалога (в отличие от `setConversationTarget`, где сессия корректно сбрасывается в строке 502).
- **Как чинить:** Добавить сброс активной сессии `if (live && liveConversationId === conversationId) { void live.dispose(); live = null; liveConversationId = null; }` в метод `setModel`.

#### 12. Нестабильная ссылка `convertMessage` в `ChatRuntime`
- **Файл и строки:** [`src/chat/ChatRuntime.tsx:253-259`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L253-L259)
- **Суть:** Функция `convertMessage: (m) => m` объявляется инлайном внутри хука `useExternalStoreRuntime`.
- **Почему:** Новая ссылка на каждом рендере заставляет хук библиотеки `@assistant-ui/react` производить лишние внутренние реинициализации.
- **Как чинить:** Вынести в константу модуля: `const identity = (m: ThreadMessageLike) => m;`.

#### 13. Отсутствие файла `LICENSE` в репозитории
- **Файл и строки:** Корень репозитория, [`package.json:1-12`](file:///home/itolstov/Projects/mtl/LettaDock/package.json#L1-L12), [`src-tauri/Cargo.toml:1-8`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/Cargo.toml#L1-L8)
- **Суть:** В проекте нет файла лицензии, а в конфигах не указано поле `license`.
- **Почему:** При публикации на GitHub отсутствие открытой лицензии означает режим "All rights reserved" — сторонние пользователи юридически не имеют права использовать, форкать или собирать код.
- **Как чинить:** Добавить файл `LICENSE` (например, MIT или Apache-2.0) и указать `"license": "MIT"` в `package.json` и `Cargo.toml`.

---

### P3 — Мелкие шероховатости и код-стайл

#### 14. Предупреждения компилятора Clippy (`collapsible_if`)
- **Файл и строки:** [`src-tauri/src/lib.rs:35`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L35), [`src-tauri/src/clipboard.rs:17, 34`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/clipboard.rs#L17)
- Вложенные блоки `if` можно свернуть через `&&` согласно правилам Rust 2024.

#### 15. В CI отсутствуют проверки `cargo test` и `cargo clippy`
- **Файл и строки:** [`.github/workflows/ci.yml:49-52`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml#L49-L52)
- В джобе `check` запускается только `cargo check`. Тесты и линтер Rust в CI не выполняются.

#### 16. Предупреждения Vite `[INEFFECTIVE_DYNAMIC_IMPORT]` при сборке
- **Файл и строки:** [`src/letta/cloudAdapter.ts:122`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.ts#L122) и [`src/App.tsx:134`](file:///home/itolstov/Projects/mtl/LettaDock/src/App.tsx#L134)
- `proxyClient.ts` и `adapters.ts` уже статически импортируются в других частях тех же модулей. Динамический импорт не выносит их в отдельные чанки, а лишь засоряет лог сборки.

#### 17. Отсутствие `.env` в корневом `.gitignore`
- **Файл и строки:** [`.gitignore:1-32`](file:///home/itolstov/Projects/mtl/LettaDock/.gitignore#L1-L32)
- Игнорируется `*.local`, но чистый `.env` не внесен в список, что чревато случайным коммитом локальных переменных окружения.

#### 18. Жесткая привязка к переменной окружения `$HOME` в `read_local_letta_key`
- **Файл и строки:** [`src-tauri/src/lib.rs:9`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/lib.rs#L9)
- При компиляции под Windows чтение `$HOME` вернет ошибку. Стоит использовать проверку `%USERPROFILE%` или крейт `dirs`.

---

## Что упростить

1. **Удалить команду [`proxy_download_sandbox_file`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L89-L107):**
   Это обычный `GET /v1/sandboxes/{id}/files?path=...`. Универсальная команда [`proxy_letta_api`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L31) полностью покрывает этот запрос. Удаление отдельной команды уберет 25 строк дублирующегося кода в Rust и лишнюю структуру запроса.
2. **Перевести управление просмотрщиком файлов в Zustand-стор ([`src/chat/MyThread.tsx:30`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/MyThread.tsx#L30)):**
   Вместо глобальной переменной `openFileRef` и функции `registerFileOpener` сохранять состояние открытого файла в [`useAppStore`](file:///home/itolstov/Projects/mtl/LettaDock/src/store/appStore.ts#L188). Это устранит неявную связь между компонентами в обход React-дерева.
3. **Отключить пустые IPC-вызовы `append_debug_log` в production ([`src/letta/localKey.ts:10`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/localKey.ts#L10)):**
   В release-сборке команда намеренно не зарегистрирована в Rust. Достаточно проверять `import.meta.env.DEV` в `appendDebugLog`, чтобы в продакшене не совершать холостые IPC-вызовы через мост на каждый лог.
4. **Упростить сборку query-параметров в `proxy_letta_api` ([`src-tauri/src/proxy.rs:48-55`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L48-L55)):**
   Вместо ручной склейки URL через `urlencoding::encode` и строк передавать параметры прямо в builder reqwest: `.query(&req.query)`.

---

## Чего не хватает в тестах

В репозитории есть 13 тестов в двух файлах ([`modelInfo.test.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/modelInfo.test.ts) и [`cloudAdapter.test.ts`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/cloudAdapter.test.ts)), но они покрывают только чистые функции форматирования. Перед релизом критически не хватает:

1. **Тестов на гонки и отмену в [`LiveSessionManager`](file:///home/itolstov/Projects/mtl/LettaDock/src/letta/liveSession.ts#L43):**
   - Переключение диалога во время активного стрима: убедиться, что старый стрим не эмитит события в новый диалог и не сбрасывает его `turnState`.
   - Вызов `dispose()` во время стрима: проверка, что хендлеры отвязываются и никаких сообщений больше не всплывает.
2. **Тестов на парсер маркеров картинок [`sendWithMarkers`](file:///home/itolstov/Projects/mtl/LettaDock/src/chat/ChatRuntime.tsx#L161):**
   - Чередование текста и картинок `[1]`, `[2]`.
   - Граничные случаи: маркер без картинки в очереди, пустой текст, неверный индекс маркера, отсутствие маркеров при наличии картинок.
3. **Модульных тестов Rust для SSRF-фильтра в [`src-tauri/src/proxy.rs`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/src/proxy.rs#L32):**
   - Проверка блокировки путей с `..`, `@`, `//`.
   - Проверка корректной нарезки UTF-8 строк с кириллицей (чтобы `chars().take(80)` не паниковал).
4. **Шагов в CI [`.github/workflows/ci.yml`](file:///home/itolstov/Projects/mtl/LettaDock/.github/workflows/ci.yml):**
   - Добавить `cargo test` и `cargo clippy -- -D warnings`.

---

## Чек секретов и приватности

- **Секреты и токены:** Захардкоженных API-ключей, токенов или паролей в коде и git-истории **не обнаружено**.
- **Локальные пути:** Путей разработчика вида `/home/...` в исходном коде нет.
- **Папка `.letta/`:** Изолирована в `.gitignore` и не отслеживается в git.
- **Приватность и PII:**
  - В [`src-tauri/Cargo.toml:5`](file:///home/itolstov/Projects/mtl/LettaDock/src-tauri/Cargo.toml#L5) указано `authors = ["Igor Tolstov"]`.
  - В истории коммитов git зафиксирован email `attid0@gmail.com`.
  - Имя машины `ibook26` зафиксировано в типах и комментариях (`src/letta/types.ts:10`, `docs/`). Если владелец хочет полной обезличенности перед публичным релизом на GitHub, имя машины стоит заменить на нейтральное `my-computer`.

---

## Вердикт одной строкой

**Чинить и публиковать** (в репозитории найдено 4 критических дефекта P1: гонка при смене диалога в `liveSession`, сломанный просмотр прикрепленных файлов, коллизия ID подтверждений и XSS/навигация по `auxclick`; после их устранения проект полностью готов к первому публичному релизу).
