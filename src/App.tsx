import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatRuntime } from "./chat/ChatRuntime";
import { MyThread, registerFileOpener, type OpenFilePayload } from "./chat/MyThread";
import { FileViewer, type FileRef } from "./fileViewer/FileViewer";
import { useAppStore } from "./store/appStore";
import { cn } from "./lib/utils";

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
  // Routing explanation: API всегда облако; исполнение (tools) — на computer.
  const route =
    status?.state === "connected"
      ? profile.computerName
        ? `облако · исполняет ${profile.computerName}`
        : "облако · нет компьютера для исполнения"
      : (status?.state ?? "offline");
  return (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span>
        {profile.name} · {route}
      </span>
    </>
  );
}

// TARGET-1: per-conversation execution target selector (cloud | computer).
// Session-scoped: applies when the conversation's session reopens.
function TargetSelector() {
  const conversationId = useAppStore((s) => s.selectedConversationId);
  const targets = useAppStore((s) => s.targetsByConversation);
  const setTarget = useAppStore((s) => s.setConversationTarget);
  const profiles = useAppStore((s) => s.profiles);
  const profileId = useAppStore((s) => s.selectedProfileId);
  const [open, setOpen] = useState(false);

  const target = conversationId ? targets[conversationId] : undefined;
  // Default = the profile's auto-discovered computer (back-compat).
  const profile = profiles.find((p) => p.id === profileId);
  const effective: string =
    target === "cloud"
      ? "cloud"
      : target
        ? target.name
        : (profile?.computerName ?? "—");

  if (!conversationId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        title="Где исполняются инструменты этого диалога"
      >
        <span>исполнение: {effective}</span>
        <span className="text-[10px]">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-5 z-40 w-56 rounded-md border bg-popover p-1 shadow-xl">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            исполнение диалога
          </div>
          <button
            onClick={() => {
              setTarget(conversationId, "cloud");
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-secondary",
              target === "cloud" && "font-semibold text-foreground",
            )}
          >
            ☁️ облако (managed sandbox)
          </button>
          {profile?.computerName && (
            <button
              onClick={() => {
                // deviceId resolution lives in the adapter; by name works.
                setTarget(conversationId, {
                  deviceId: profile.computerName ?? "",
                  name: profile.computerName ?? "",
                });
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-secondary",
                target !== "cloud" && "font-semibold text-foreground",
              )}
            >
              🖥 {profile.computerName}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ModelBadge() {
  const modelInfo = useAppStore((s) => s.modelInfo);
  const setModel = useAppStore((s) => s.setModel);
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  if (!modelInfo) return null;
  const pct = Math.min(100, Math.max(0, modelInfo.usage.percent));
  const color =
    pct > 80 ? "text-red-400" : pct > 50 ? "text-amber-400" : "text-muted-foreground";

  const openList = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const conversationId = useAppStore.getState().selectedConversationId;
      const profileId = useAppStore.getState().selectedProfileId;
      const { adapters } = await import("./store/adapters");
      const adapter = profileId ? adapters.get(profileId) : undefined;
      if (!adapter || !conversationId) {
        setModels([]);
        return;
      }
      const { entries, availableHandles } = await adapter.listSessionModels(
        conversationId,
      );
      const handles = availableHandles ?? [];
      const names = entries
        .filter((e) => handles.length === 0 || handles.includes(e.handle))
        .map((e) => e.handle as string)
        .slice(0, 60);
      setModels(names);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => void openList()}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        title="Сменить модель"
      >
        <span className="max-w-[220px] truncate">{modelInfo.model}</span>
        <span className={color}>
          {modelInfo.usage.percent}%
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-40 max-h-80 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
            <span>Модель диалога</span>
            <button onClick={() => setOpen(false)} className="hover:text-foreground">
              ✕
            </button>
          </div>
          {loading && <div className="px-2 py-2 text-xs">Загрузка…</div>}
          {models.map((m) => (
            <button
              key={m}
              onClick={async () => {
                await setModel(m);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-secondary",
                m === modelInfo.model && "font-semibold text-foreground",
              )}
            >
              <span className="truncate">{m}</span>
            </button>
          ))}
          {!loading && models.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Список недоступен
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const [viewerFile, setViewerFile] = useState<FileRef | null>(null);
  const selectedConversationId = useAppStore((s) => s.selectedConversationId);
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const conversation = useAppStore((s) =>
    selectedAgentId
      ? s.conversationsByAgent[selectedAgentId]?.find(
          (c) => c.id === selectedConversationId,
        )
      : undefined,
  );

  // Phase 4: file chips and diff buttons open the Monaco viewer.
  // Round-3 agy P1: handler carries inline diff content — Edit/Write tool
  // calls open immediately with old/new sides; bare chips (no sandboxId,
  // no content) show the viewer's explicit "no source" error.
  const handleOpenFile = (ref: OpenFilePayload) => {
    setViewerFile(ref);
  };
  // P3 (agy): register in an effect, not in the render body.
  useEffect(() => {
    registerFileOpener(handleOpenFile);
    return () => registerFileOpener(() => {});
  }, []);

  return (
    <>
    {viewerFile && (
      <FileViewer file={viewerFile} onClose={() => setViewerFile(null)} />
    )}
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
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <TargetSelector />
            <ModelBadge />
            <ConnBadge />
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <MyThread />
        </div>
      </main>
    </div>
    </ChatRuntime>
    </>
  );
}

export default App;
