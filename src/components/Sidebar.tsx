import { Server, Bot, MessageSquare, Cloud, HardDrive } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { cn } from "../lib/utils";

export function Sidebar() {
  const {
    servers,
    agents,
    conversations,
    selectedServerId,
    selectedAgentId,
    selectedConversationId,
    selectServer,
    selectAgent,
    selectConversation,
  } = useAppStore();

  const visibleAgents = agents.filter((a) => a.serverId === selectedServerId);
  const visibleConversations = conversations.filter(
    (c) => c.agentId === selectedAgentId,
  );

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-card/50">
      {/* Servers */}
      <div className="border-b p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Server className="h-3.5 w-3.5" /> Серверы (мок)
        </div>
        <div className="space-y-1">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => selectServer(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                selectedServerId === s.id
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {s.kind === "cloud" ? (
                <Cloud className="h-4 w-4 shrink-0" />
              ) : (
                <HardDrive className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1 truncate">{s.name}</span>
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  s.status === "connected" ? "bg-emerald-500" : "bg-zinc-600",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Agents */}
      <div className="border-b p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Агенты (мок)
        </div>
        <div className="space-y-1">
          {visibleAgents.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              Выбери сервер
            </div>
          )}
          {visibleAgents.map((a) => (
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
          <MessageSquare className="h-3.5 w-3.5" /> Диалоги (мок)
        </div>
        <div className="space-y-1">
          {visibleConversations.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              Выбери агента
            </div>
          )}
          {visibleConversations.map((c) => (
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
              <span className="flex-1 truncate">{c.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.lastActivity}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t p-3 text-xs text-muted-foreground">
        Phase 1 · мок-данные, Letta не подключён
      </div>
    </aside>
  );
}
