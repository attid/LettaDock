### Отчёт ревью фиксов (последние 3 коммита: `HEAD~3..HEAD`)

---

### P1 (критические баги в самих фиксах)

#### 1. `src/store/appStore.ts` — Сломанный флоу восстановления сессии при автоподключении (`P1-6`, коммит `d629977`)
В `connect()` добавлено восстановление сохранённого диалога, но фикс не работает сразу по трём причинам:
1. **Затирание `localStorage`**: вызов `get().selectAgent(restoredAgentId)` синхронно вызывает `saveSelection({ profileId, agentId: id, conversationId: null })`, безвозвратно удаляя сохранённый `conversationId` из `localStorage`.
2. **Асинхронность `listConversations`**: `selectAgent` запускает загрузку диалогов асинхронно (`void adapter.listConversations(id).then(...)`). На следующей строке `get().conversationsByAgent[restoredAgentId]` ещё пуст (`undefined` / `[]`), проверка `conversations.some((c) => c.id === savedConversationId)` всегда возвращает `false`, и `openConversation` никогда не вызывается.
3. **Ложное срабатывание race guard**: даже если бы диалоги были в кэше, вызывается `openConversation(savedConversationId)` вместо `selectConversation`. В `openConversation` стоит проверка:
   ```ts
   if (get().selectedConversationId !== id) return;
   ```
   А `selectedConversationId` был сброшен в `null` вызовом `selectAgent`. В результате загруженная история отбрасывается как устаревшая (`stale load`).

#### 2. `src/fileViewer/FileViewer.tsx` — Гонка инициализации локального Monaco и откат на заблокированный CSP CDN (коммиты `5549ab8`, `d629977`)
Конфигурация лоадера вынесена в плавающий `void (async () => { ... })()` на уровне модуля, а сам `FileViewer` сделан lazy:
1. Промис импорта `monaco-editor` нигде не ожидается перед монтированием компонентов редактора.
2. При открытии diff (`file.newContent != null`) состояние `loading` становится `false` в первом же микротаске эффекта.
3. Монтируется `<DiffEditor>`, чей внутренний хук вызывает `loader.init()`.
4. В этот момент загрузка тяжёлого чанка `monaco-editor` (~2.7 МБ) ещё не завершена, `state.monaco` в лоадере равен `undefined`.
5. `loader.init()` выставляет флаг `isInitialized = true` и пытается загрузить Monaco с CDN `https://cdn.jsdelivr.net/...`, что блокируется директивой CSP `script-src 'self'`.
6. Последующий вызов `loader.config({ monaco })` из фонового промиса уже не может переинициализировать залоченный лоадер — просмотрщик зависает на плашке «Monaco загружается…» с CSP-ошибкой в консоли.

---

### P2 (недочёты фиксов)

#### 1. `src/letta/liveSession.ts` — Отсутствие guard-проверки после async `getHistory` в `sendInternal` (коммит `fd08b87`)
В `loadHistory` после сетевого вызова `await this.adapter.getHistory(...)` добавлена проверка:
```ts
if (this.currentViewConversationId !== conversationId) return;
```
Однако в `sendInternal` (строки 246–248) после окончания стрима:
```ts
if (this.currentViewConversationId === conversationId) {
  this.history = await this.adapter.getHistory(conversationId, 50);
  this.emit();
}
```
После завершения `await this.adapter.getHistory(...)` повторной проверки `currentViewConversationId !== conversationId` нет. Если во время сетевого запроса пользователь переключил диалог без вызова `dispose()`, в состояние попадает устаревшая история.

#### 2. `src/letta/liveSession.ts` — `dispose()` не прерывает активный цикл стрима (коммит `d629977`)
В методе `dispose()` выставляется флаг `this.disposed = true`, но не взводится `this.aborted = true`. В цикле `for await (const msg of this.session.stream())` проверка `this.disposed` отсутствует. До тех пор, пока сокет/сессия не закроется на сетевом уровне, генератор продолжает крутиться в фоне (хотя `emit()` уже отсекает события).

---

### Статус по остальным компонентам
- **`proxy.rs`**: всё чисто (асинхронный multipart без blocking-вызовов, SSRF-гвард на `/v1/`, UTF-8 char boundary через `take(80)`).
- **`ChatRuntime.tsx`**: всё чисто (`argsText` пробрасывает аргументы, `toolCallId = m.id` исключает коллизии аппрувов).
- **`MyThread.tsx`**: всё чисто (парсинг `old_string`/`old_content`, флаг `fromChip: true`).
- **`ci.yml`**: всё чисто (`libfuse2` установлен, `GITHUB_TOKEN` передан в релизный шаг, `pnpm install --frozen-lockfile`).
