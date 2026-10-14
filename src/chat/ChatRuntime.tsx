import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useAppStore } from "../store/appStore";
import type { LettaMessage } from "../letta/types";
import type { ReactNode } from "react";

// Convert stored Letta history into assistant-ui ThreadMessageLike.
// Read-only: no onNew — composer is disabled via isDisabled.
function toThreadMessages(history: LettaMessage[]): ThreadMessageLike[] {
  const out: ThreadMessageLike[] = [];
  for (const m of history) {
    switch (m.messageType) {
      case "user_message":
      case "assistant_message":
        out.push({
          role: m.messageType === "user_message" ? "user" : "assistant",
          id: m.id,
          createdAt: new Date(m.date),
          content: [{ type: "text", text: m.content ?? "" }],
        });
        break;
      case "tool_return_message": {
        const raw = m.raw as {
          tool_call_id?: string;
          content?: unknown;
        };
        out.push({
          role: "assistant",
          id: m.id,
          createdAt: new Date(m.date),
          content: [
            {
              type: "tool-call",
              toolCallId: raw?.tool_call_id ?? m.id,
              toolName: "tool result",
              argsText: "",
              result: truncate(raw?.content ?? ""),
            },
          ],
        });
        break;
      }
      case "approval_request_message": {
        const raw = m.raw as {
          tool_call?: { name?: string; arguments?: string };
        };
        out.push({
          role: "assistant",
          id: m.id,
          createdAt: new Date(m.date),
          content: [
            {
              type: "tool-call",
              toolCallId: raw?.tool_call?.name ?? m.id,
              toolName: raw?.tool_call?.name ?? "approval",
              argsText: "",
              args: safeParse(raw?.tool_call?.arguments),
              result: "(запрос аппрува)",
            },
          ],
        });
        break;
      }
      case "reasoning_message":
        // Skip reasoning in the chat view for now (later: collapsible).
        break;
      case "system_message":
        break;
      default:
        break;
    }
  }
  return out;
}

function safeParse(s?: string): { [k: string]: string } {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null
      ? (v as { [k: string]: string })
      : { raw: String(v) };
  } catch {
    return { raw: s };
  }
}

function truncate(v: unknown, max = 600): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const LOADING_PLACEHOLDER: ThreadMessageLike[] = [
  {
    role: "assistant",
    id: "loading",
    content: [{ type: "text", text: "Загрузка истории…" }],
  },
];

const EMPTY_PLACEHOLDER: ThreadMessageLike[] = [
  {
    role: "assistant",
    id: "empty",
    content: [{ type: "text", text: "Нет сообщений в этом диалоге." }],
  },
];

export function ChatRuntime({ children }: { children: ReactNode }) {
  const history = useAppStore((s) =>
    s.selectedConversationId
      ? s.historyByConversation[s.selectedConversationId]
      : undefined,
  );
  const loading = useAppStore((s) => s.historyLoading);

  const messages = useMemo<ThreadMessageLike[]>(() => {
    if (loading) return LOADING_PLACEHOLDER;
    if (!history || history.length === 0) return EMPTY_PLACEHOLDER;
    return toThreadMessages(history);
  }, [history, loading]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    // Read-only: block composer entirely (Phase 3 will enable sending).
    isDisabled: true,
    convertMessage: (m) => m,
    onNew: async () => {
      // Unreachable while isDisabled, but the adapter contract requires onNew.
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
