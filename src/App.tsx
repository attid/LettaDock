import { Sidebar } from "./components/Sidebar";
import { ChatRuntime } from "./chat/ChatRuntime";
import { MyThread } from "./chat/MyThread";
import { useAppStore } from "./store/appStore";

function ConnBadge() {
  const profileId = useAppStore((s) => s.selectedProfileId);
  const status = useAppStore((s) =>
    profileId ? s.connectionStatus[profileId] : undefined,
  );
  const profile = useAppStore((s) =>
    profileId ? s.profiles.find((p) => p.id === profileId) : undefined,
  );
  if (!profile) return <span>read-only</span>;
  const color =
    status?.state === "connected"
      ? "bg-emerald-500"
      : status?.state === "error"
        ? "bg-red-500"
        : status?.state === "connecting"
          ? "bg-amber-500 animate-pulse"
          : "bg-zinc-600";
  return (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span>
        {profile.name} · {status?.state ?? "disconnected"}
      </span>
    </>
  );
}

function App() {
  const selectedConversationId = useAppStore((s) => s.selectedConversationId);
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const conversation = useAppStore((s) =>
    selectedAgentId
      ? s.conversationsByAgent[selectedAgentId]?.find(
          (c) => c.id === selectedConversationId,
        )
      : undefined,
  );

  return (
    <ChatRuntime>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b px-4">
          <div className="text-sm font-medium truncate max-w-[50%]">
            {conversation
              ? (conversation.name || conversation.id)
              : "LettaDock"}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <ConnBadge />
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <MyThread />
        </div>
      </main>
    </div>
    </ChatRuntime>
  );
}

export default App;
