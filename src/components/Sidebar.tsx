import { useEffect, useState } from "react";
import {
  Cloud,
  HardDrive,
  MessageSquare,
  Plus,
  Server,
  Bot,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { cn } from "../lib/utils";

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const addProfile = useAppStore((s) => s.addProfile);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "Letta Cloud").trim();
    // User should never think about whitespace: strip ALL whitespace anywhere
    // in the pasted key (copied keys sometimes carry wrapped newlines).
    const apiKey = String(fd.get("apiKey") || "").replace(/\s+/g, "");
    if (!apiKey) return;
    addProfile(name, "cloud", apiKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="w-96 rounded-lg border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 text-lg font-semibold">Добавить профиль</div>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-muted-foreground">Название</span>
          <input
            name="name"
            defaultValue="Letta Cloud"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-muted-foreground">API-ключ</span>
          <input
            name="apiKey"
            type="password"
            required
            placeholder="LETTER… ключ хранится только в памяти сессии"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <p className="mb-4 text-xs text-muted-foreground">
          Phase 2: ключ не сохраняется на диск (ни localStorage, ни файлы) —
          живёт в памяти, пока запущено приложение. Постоянное хранение — в
          Phase 5 через secure storage.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            Отмена
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Добавить
          </button>
        </div>
      </form>
    </div>
  );
}

export function Sidebar() {
  const {
    profiles,
    agentsByProfile,
    conversationsByAgent,
    connectionStatus,
    selectedProfileId,
    selectedAgentId,
    selectedConversationId,
    selectProfile,
    selectAgent,
    selectConversation,
    removeProfile,
    disconnect,
  } = useAppStore();

  const [dialogOpen, setDialogOpen] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // DELETE-1: two-step delete — first click arms, second (within 3s) removes.
  const requestDelete = (id: string) => {
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      void disconnect(id);
      removeProfile(id);
      return;
    }
    setConfirmDeleteId(id);
    window.setTimeout(() => {
      setConfirmDeleteId((cur) => (cur === id ? null : cur));
    }, 3000);
  };

  const agents = selectedProfileId
    ? (agentsByProfile[selectedProfileId] ?? [])
    : [];
  const conversations = selectedAgentId
    ? (conversationsByAgent[selectedAgentId] ?? [])
    : [];

  useEffect(() => {
    // Auto-connect the last-selected profile on startup.
    if (selectedProfileId && profiles.some((p) => p.id === selectedProfileId)) {
      const status = connectionStatus[selectedProfileId]?.state;
      if (!status || status === "disconnected") {
        // Key is gone after restart (session-only by design); profile exists
        // but cannot auto-connect — needs re-entry. Nothing to do silently.
      }
    }
  }, [selectedProfileId, profiles, connectionStatus]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-card/50">
      {/* Servers / profiles */}
      <div className="border-b p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Server className="h-3.5 w-3.5" /> Серверы
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            title="Добавить профиль"
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1">
          {profiles.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              Нет профилей — добавь облачный
            </div>
          )}
          {profiles.map((p) => {
            const st = connectionStatus[p.id]?.state ?? "disconnected";
            const err = connectionStatus[p.id]?.error;
            return (
              <div key={p.id} className="group relative">
                <button
                  onClick={() => selectProfile(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-sm text-left",
                    selectedProfileId === p.id
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  )}
                >
                  {p.kind === "cloud" ? (
                    <Cloud className="h-4 w-4 shrink-0" />
                  ) : (
                    <HardDrive className="h-4 w-4 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{p.name}</span>
                  {st === "connecting" && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  {st === "connected" && (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                  {st === "error" && (
                    <span
                      className="shrink-0"
                      title={err}
                    >
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    </span>
                  )}
                  {st === "disconnected" && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
                  )}
                </button>
                {confirmDeleteId === p.id ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestDelete(p.id);
                    }}
                    title="Нажми ещё раз для удаления"
                    className="absolute right-2 top-1.5 z-10 flex items-center gap-1 rounded bg-red-950 px-1.5 py-0.5 text-[10px] text-red-300 ring-1 ring-red-800 hover:bg-red-900"
                  >
                    удалить?
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestDelete(p.id);
                    }}
                    title="Удалить профиль"
                    className="absolute right-2 top-1.5 hidden rounded p-1 text-muted-foreground hover:text-red-400 group-hover:block"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {selectedProfileId && connectionStatus[selectedProfileId]?.error && (
          <div className="mt-2 rounded-md bg-red-950/40 px-2 py-1.5 text-xs text-red-300">
            {connectionStatus[selectedProfileId].error}
          </div>
        )}
      </div>

      {/* Agents */}
      <div className="border-b p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Агенты
        </div>
        <div className="space-y-1">
          {agents.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              {selectedProfileId ? "Загрузка…" : "Выбери сервер"}
            </div>
          )}
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => selectAgent(a.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                selectedAgentId === a.id
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              <span className="flex-1 truncate">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" /> Диалоги
        </div>
        <div className="space-y-1">
          {conversations.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              {selectedAgentId ? "Загрузка…" : "Выбери агента"}
            </div>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                selectedConversationId === c.id
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              <span className="flex-1 truncate">{c.name || c.id}</span>
              {c.lastMessageAt && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(c.lastMessageAt).toLocaleDateString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t p-3 text-xs text-muted-foreground leading-relaxed">
        <div>
          данные: <span className="text-foreground">api.letta.com</span> (через
          локальный прокси)
        </div>
        <div>
          исполнение:{" "}
          <span className="text-foreground">
            {profiles.find((p) => p.id === selectedProfileId)?.computerName ??
              "—"}
          </span>
        </div>
      </div>

      {dialogOpen && <ConnectDialog onClose={() => setDialogOpen(false)} />}
    </aside>
  );
}
