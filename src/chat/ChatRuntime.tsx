import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useState, type ReactNode } from "react";

// MOCK conversation — clearly fake messages for Phase 1 shell only.
const INITIAL_MESSAGES: ThreadMessageLike[] = [
  {
    role: "user",
    content: [{ type: "text", text: "покажи статус задачи" }],
  },
  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Это **мок-чат** LettaDock (Phase 1). Реального подключения к Letta-серверу нет.\n\n- скелет Tauri 2 работает\n- assistant-ui отрисован\n- сайдбар — тоже мок",
      },
    ],
  },
  {
    role: "user",
    content: [{ type: "text", text: "ок, а файлы можно смотреть?" }],
  },
  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Просмотр файлов и диффы — позже (Phase 4, Monaco). Сейчас только шелл.",
      },
    ],
  },
];

export function ChatRuntime({ children }: { children: ReactNode }) {
  const [messages, setMessages] =
    useState<ThreadMessageLike[]>(INITIAL_MESSAGES);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    convertMessage: (m) => m,
    onNew: async (message) => {
      const textPart = message.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text : "";
      setMessages((prev) => [
        ...prev,
        { role: "user", content: [{ type: "text", text }] },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "(mock) Сообщение получено, но Letta-транспорта ещё нет — Phase 2.",
            },
          ],
        },
      ]);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
