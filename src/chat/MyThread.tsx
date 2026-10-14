import { useState } from "react";
import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import type { TextMessagePartProps, ToolCallMessagePartProps } from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { SendHorizontal, Square, Wrench } from "lucide-react";
import { useAppStore } from "../store/appStore";
import {
  fileToDataUrl,
  prepareImage,
  type PreparedImage,
} from "./images";

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
  const sendMessage = useAppStore((s) => s.sendMessage);
  const sendMessageWithImages = useAppStore((s) => s.sendMessageWithImages);
  const running = turnState.phase === "sending" || turnState.phase === "streaming";
  const error = turnState.phase === "error" ? turnState.error : undefined;
  const [pendingImages, setPendingImages] = useState<PreparedImage[]>([]);

  const addFromClipboard = async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return; // normal text paste proceeds untouched
    e.preventDefault();
    for (const f of files) {
      try {
        const dataUrl = await fileToDataUrl(f);
        const prepared = await prepareImage(dataUrl);
        setPendingImages((prev) => [...prev, prepared]);
      } catch {
        /* skip broken image */
      }
    }
  };

  const handleSend = async (text: string) => {
    if (pendingImages.length > 0) {
      const imgs = pendingImages.map((p) => p.base64);
      setPendingImages([]);
      await sendMessageWithImages(text, imgs);
    } else {
      await sendMessage(text);
    }
  };

  return (
    <div className="border-t bg-background/80 p-4">
      {error && (
        <div className="mb-2 rounded-md bg-red-950/40 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}
      {pendingImages.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {pendingImages.map((p, i) => (
            <div
              key={i}
              className="group relative h-14 w-14 overflow-hidden rounded-md border"
            >
              <img
                src={`data:${p.mediaType};base64,${p.base64}`}
                alt={`#${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                onClick={() =>
                  setPendingImages((prev) => prev.filter((_, j) => j !== i))
                }
                className="absolute inset-0 hidden items-center justify-center bg-black/60 text-xs text-white group-hover:flex"
              >
                убрать
              </button>
            </div>
          ))}
          <span className="text-xs text-muted-foreground">
            {pendingImages.length} изображени(й) — Ctrl+V ещё, клик по миниатюре
            — убрать
          </span>
        </div>
      )}
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
        <ComposerPrimitive.Input
          rows={1}
          placeholder="Написать сообщение… (Ctrl+V вставит картинку)"
          onPaste={addFromClipboard}
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {running ? (
          <ComposerPrimitive.Cancel className="rounded-md bg-destructive p-2 text-destructive-foreground">
            <Square className="h-4 w-4" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send
            className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
            onClick={async () => {
              const input = document.querySelector<HTMLTextAreaElement>(
                "[data-composer-input] textarea, textarea",
              );
              const text = input?.value ?? "";
              await handleSend(text);
            }}
          >
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
