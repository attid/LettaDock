import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useAppStore } from "../store/appStore";
import type { LettaMessage } from "../letta/types";
import type { ReactNode } from "react";

// Convert live message view (history + optimistic + streaming) into
// assistant-ui ThreadMessageLike. Tool calls from both history and live
// turns render as tool-call parts.
function toThreadMessages(history: LettaMessage[]): ThreadMessageLike[] {
  const out: ThreadMessageLike[] = [];
  for (const m of history) {
    switch (m.messageType) {
      case "user_message":
        out.push({
          role: "user",
          id: m.id,
          createdAt: new Date(m.date),
          content: [{ type: "text", text: m.content ?? "" }],
        });
        break;
      case "assistant_message":
        out.push({
          role: "assistant",
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
              args: {},
              result: truncate(raw?.content ?? ""),
            },
          ],
        });
        break;
      }
      case "tool_call_message": {
        const raw = m.raw as {
          tool_call_id?: string;
          name?: string;
          arguments?: string;
          result?: string;
          done?: boolean;
        };
        out.push({
          role: "assistant",
          id: m.id,
          createdAt: new Date(m.date),
          content: [
            {
              type: "tool-call",
              toolCallId: raw?.tool_call_id ?? m.id,
              toolName: raw?.name ?? "tool",
              argsText: "",
              args: safeParseObj(raw?.arguments),
              result: raw?.done
                ? (raw.result ?? "(готово)")
                : "(выполняется…)",
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
              args: safeParseObj(raw?.tool_call?.arguments),
              result: "(запрос аппрува — одобри в CLI/Telegram)",
            },
          ],
        });
        break;
      }
      default:
        // reasoning/system/tool-unknown: skip in chat view
        break;
    }
  }
  return out;
}

function safeParseObj(s?: string): { [k: string]: string } {
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
    content: [{ type: "text", text: "Нет сообщений. Напиши что-нибудь." }],
  },
];

export function ChatRuntime({ children }: { children: ReactNode }) {
  const liveMessages = useAppStore((s) => s.liveMessages);
  const loading = useAppStore((s) => s.historyLoading);
  const turnState = useAppStore((s) => s.turnState);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const abortTurn = useAppStore((s) => s.abortTurn);

  const messages = useMemo<ThreadMessageLike[]>(() => {
    if (loading) return LOADING_PLACEHOLDER;
    if (!liveMessages || liveMessages.length === 0) return EMPTY_PLACEHOLDER;
    return toThreadMessages(liveMessages);
  }, [liveMessages, loading]);

  const running = turnState.phase === "sending" || turnState.phase === "streaming";

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: running,
    isDisabled: !liveMessages || liveMessages.length === 0 ? false : false,
    convertMessage: (m) => m,
    onCancel: running
      ? async () => {
          await abortTurn();
        }
      : undefined,
    onNew: async (message) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      await sendMessage(text);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
