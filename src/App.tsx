import { Sidebar } from "./components/Sidebar";
import { ChatRuntime } from "./chat/ChatRuntime";
import { MyThread } from "./chat/MyThread";
import { useAppStore } from "./store/appStore";

function App() {
  const selectedConversation = useAppStore((s) =>
    s.conversations.find((c) => c.id === s.selectedConversationId),
  );

  return (
    <ChatRuntime>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b px-4">
          <div className="text-sm font-medium">
            {selectedConversation ? selectedConversation.title : "LettaDock"}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            mock mode
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
