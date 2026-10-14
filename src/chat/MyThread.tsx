import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { SendHorizontal } from "lucide-react";

const UserMessage = () => (
  <MessagePrimitive.Root className="flex justify-end px-4 py-2">
    <div className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
      <MessagePrimitive.Parts
        components={{ Text: UserText }}
      />
    </div>
  </MessagePrimitive.Root>
);

const UserText = ({ text }: TextMessagePartProps) => (
  <span className="whitespace-pre-wrap">{text}</span>
);

const AssistantMessage = () => (
  <MessagePrimitive.Root className="px-4 py-2">
    <div className="max-w-[90%] rounded-lg rounded-bl-sm bg-card px-4 py-2 text-foreground">
      <MessagePrimitive.Parts
        components={{ Text: MarkdownText }}
      />
    </div>
  </MessagePrimitive.Root>
);

export const MyThread = () => (
  <ThreadPrimitive.Root className="flex h-full flex-col">
    <ThreadPrimitive.Viewport
      autoScroll
      className="flex-1 overflow-y-auto scroll-smooth"
    >
      <ThreadPrimitive.Empty>
        <div className="mx-auto mt-16 max-w-md text-center text-muted-foreground">
          <div className="text-2xl font-semibold text-foreground">LettaDock</div>
          <div className="mt-2 text-sm">
            Выбери диалог слева или напиши сообщение. Всё содержимое — мок.
          </div>
        </div>
      </ThreadPrimitive.Empty>
      <ThreadPrimitive.Messages
        components={{ UserMessage, AssistantMessage }}
      />
      <div className="h-4" />
    </ThreadPrimitive.Viewport>

    <div className="border-t bg-background/80 p-4">
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
        <ComposerPrimitive.Input
          rows={1}
          placeholder="Read-only: отправка сообщений появится в Phase 3"
          disabled
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        <ComposerPrimitive.Send
          disabled
          className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
        >
          <SendHorizontal className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  </ThreadPrimitive.Root>
);
