import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import type { TextMessagePartProps, ToolCallMessagePartProps } from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { SendHorizontal, Square, Wrench } from "lucide-react";
import { useAppStore } from "../store/appStore";

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

const ToolCall = ({ toolName, argsText, result }: ToolCallMessagePartProps) => (
  <div className="mb-2 rounded-md border bg-secondary/40 px-3 py-2 font-mono text-xs">
    <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
      <Wrench className="h-3 w-3" />
      {toolName}
    </div>
    {argsText && (
      <div className="mt-1 whitespace-pre-wrap break-all text-muted-foreground">
        {argsText}
      </div>
    )}
    {result != null && (
      <div className="mt-1 whitespace-pre-wrap break-all">{String(result)}</div>
    )}
  </div>
);

const AssistantMessage = () => (
  <MessagePrimitive.Root className="px-4 py-2">
    <div className="max-w-[90%] rounded-lg rounded-bl-sm bg-card px-4 py-2 text-foreground">
      <MessagePrimitive.Parts
        components={{ Text: MarkdownText, tools: { Fallback: ToolCall } }}
      />
    </div>
  </MessagePrimitive.Root>
);

const Composer = () => {
  const turnState = useAppStore((s) => s.turnState);
  const running = turnState.phase === "sending" || turnState.phase === "streaming";
  const error = turnState.phase === "error" ? turnState.error : undefined;

  return (
    <div className="border-t bg-background/80 p-4">
      {error && (
        <div className="mb-2 rounded-md bg-red-950/40 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
        <ComposerPrimitive.Input
          rows={1}
          placeholder="Написать сообщение…"
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {running ? (
          <ComposerPrimitive.Cancel className="rounded-md bg-destructive p-2 text-destructive-foreground">
            <Square className="h-4 w-4" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50">
            <SendHorizontal className="h-4 w-4" />
          </ComposerPrimitive.Send>
        )}
      </ComposerPrimitive.Root>
    </div>
  );
};

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
            Выбери диалог слева или напиши сообщение.
          </div>
        </div>
      </ThreadPrimitive.Empty>
      <ThreadPrimitive.Messages
        components={{ UserMessage, AssistantMessage }}
      />
      <div className="h-4" />
    </ThreadPrimitive.Viewport>

    <Composer />
  </ThreadPrimitive.Root>
);
