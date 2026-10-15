import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useAppStore } from "../store/appStore";
import { usePendingImages } from "./pendingImages";
import type { LettaMessage } from "../letta/types";
import type { ReactNode } from "react";

// Convert live message view (history + optimistic + streaming) into
// assistant-ui ThreadMessageLike. Tool calls from both history and live
// turns render as tool-call parts.
function toThreadMessages(history: LettaMessage[]): ThreadMessageLike[] {
  const out: ThreadMessageLike[] = [];
  for (const m of history) {
    switch (m.messageType) {
      case "user_message": {
        // UX-7: render real image previews interleaved with text — history
        // content parts carry source.data (base64) for image parts.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawParts = (m.raw as any)?.content;
        type SimplePart = { type: string; text?: string; image?: string };
        let parts: SimplePart[] | undefined;
        if (Array.isArray(rawParts)) {
          const rendered: SimplePart[] = [];
          for (const p of rawParts) {
            if (p?.type === "image" && p?.source?.data) {
              rendered.push({
                type: "image",
                image: `data:${p.source.media_type ?? "image/png"};base64,${p.source.data}`,
              });
            } else if (p?.type === "text" && typeof p.text === "string") {
              // Reuse already-normalized text (reminders stripped).
              rendered.push({ type: "text", text: p.text });
            }
          }
          if (rendered.length > 0) parts = rendered;
        }
        if (!parts) {
          parts = [{ type: "text", text: m.content ?? "" }];
        }
        out.push({
          role: "user",
          id: m.id,
          createdAt: new Date(m.date),
          content: parts as ThreadMessageLike["content"],
        });
        break;
      }
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
              // Round-2 agy fix: pass real args text — ToolCall parses it
              // for the diff button; empty string made canDiff always false.
              argsText:
                typeof raw?.arguments === "string"
                  ? raw.arguments
                  : JSON.stringify(safeParseObj(raw?.arguments) ?? {}),
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
              // Round-5 agy P1: name collides across multiple approvals —
              // use the message id (unique per approval request).
              toolCallId: m.id,
              toolName: raw?.tool_call?.name ?? "approval",
              argsText: raw?.tool_call?.arguments ?? "",
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

const NO_CONVERSATION_PLACEHOLDER: ThreadMessageLike[] = [
  {
    role: "assistant",
    id: "no-conversation",
    content: [
      {
        type: "text",
        text: "Выбери диалог слева — или создай новый кнопкой «+» рядом с агентом.",
      },
    ],
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
  const selectedConversationId = useAppStore((s) => s.selectedConversationId);
  const turnPhase = useAppStore((s) => s.turnState.phase);
  const turnError = useAppStore((s) => s.turnState.error);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const sendMessageWithParts = useAppStore((s) => s.sendMessageWithParts);
  const abortTurn = useAppStore((s) => s.abortTurn);

  const sendWithMarkers = useMemo(
    () => async (text: string) => {
      const images = usePendingImages.getState().pending;
      if (images.length === 0) {
        await sendMessage(text);
        return;
      }
      // Split on [N] markers → interleaved text/image parts.
      const chunks = text.split(/\[(\d+)\]/g);
      const parts: Array<
        | { type: "text"; text: string }
        | {
            type: "image";
            source: { type: "base64"; media_type: string; data: string };
          }
      > = [];
      let usedAny = false;
      for (let i = 0; i < chunks.length; i++) {
        if (i % 2 === 1) {
          const img = images[parseInt(chunks[i], 10) - 1];
          if (img) {
            parts.push({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mediaType,
                data: img.base64,
              },
            });
            usedAny = true;
          } else {
            parts.push({ type: "text", text: `[${chunks[i]}]` });
          }
        } else if (chunks[i]) {
          parts.push({ type: "text", text: chunks[i] });
        }
      }
      if (!usedAny) {
        for (const img of images) {
          parts.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType,
              data: img.base64,
            },
          });
        }
      }
      usePendingImages.getState().clear();
      if (parts.length === 1 && parts[0].type === "text") {
        await sendMessage(parts[0].text);
      } else {
        await sendMessageWithParts(parts);
      }
    },
    [sendMessage, sendMessageWithParts],
  );

  const messages = useMemo<ThreadMessageLike[]>(() => {
    // UI-STATE-1: no conversation selected → neutral hint, no "напиши что-
    // нибудь" (sending would fail anyway).
    if (!selectedConversationId && !loading) return NO_CONVERSATION_PLACEHOLDER;
    if (loading) return LOADING_PLACEHOLDER;
    if (!liveMessages || liveMessages.length === 0) return EMPTY_PLACEHOLDER;
    return toThreadMessages(liveMessages);
  }, [liveMessages, loading, selectedConversationId]);

  // Disable composer when no conversation is selected (UI-STATE-1).
  const noConversation = !selectedConversationId;

  // Primitives: only the phase string (stable identity), not a new object —
  // useExternalStoreRuntime resubscribes/updates when its config object
  // changes identity, and a fresh `turnState` object per store update was
  // causing an update loop (Maximum update depth exceeded).
  const running = turnPhase === "sending" || turnPhase === "streaming";
  const onCancel = useMemo(
    () =>
      running
        ? async () => {
            await abortTurn();
          }
        : undefined,
    [running, abortTurn],
  );
  // Single send path: Enter, Send button, everything goes through here.
  // The composer text carries [N] image markers inserted by Ctrl+V; we split
  // them into interleaved text/image parts against the pendingImages queue.
  const onNew = useMemo(
    () => async (message: { content: ReadonlyArray<{ type: string; text?: string }> }) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? (textPart.text ?? "") : "";
      await sendWithMarkers(text);
    },
    [sendWithMarkers],
  );
  void turnError;

  // Stabilize every option passed to useExternalStoreRuntime: an inline
  // arrow (convertMessage) or fresh object re-creates the runtime internals
  // on each render — with a streaming session this becomes an update loop
  // (Maximum update depth exceeded).
  const convertMessage = useMemo(() => (m: ThreadMessageLike) => m, []);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: running,
    isDisabled: noConversation,
    convertMessage,
    onCancel,
    onNew,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
