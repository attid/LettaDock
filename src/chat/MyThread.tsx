import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import type { TextMessagePartProps, ToolCallMessagePartProps } from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { SendHorizontal, Square, Wrench } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { usePendingImages } from "./pendingImages";
import { prepareImage } from "./images";

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
  // Shared queue: send path lives in ChatRuntime (single onNew entry point).
  const pendingImages = usePendingImages((s) => s.pending);
  const addPending = usePendingImages((s) => s.add);
  const removePending = usePendingImages((s) => s.remove);

  // WebKitGTK/Wayland delivers paste events with EMPTY clipboardData
  // (log-verified: kinds=[] even with image/png in the system clipboard).
  // So Ctrl+V here reads the clipboard directly via Rust and we intercept
  // the keydown before the (useless) paste event fires.
  //
  // Images insert a [N] marker at the cursor, TUI-style: user writes
  // "кнопка [] а тут буква []" interleaved with markers; ChatRuntime splits
  // the text on markers into alternating text/image content parts on send.
  const onCtrlV = (e: React.KeyboardEvent) => {
    // Layout-independent: e.key follows the active layout (ru: 'ъ'),
    // e.code is the physical key (KeyV) — use code, per owner feedback.
    const isPasteCombo =
      (e.ctrlKey || e.metaKey) &&
      (e.code === "KeyV" || e.key.toLowerCase() === "v");
    if (!isPasteCombo) return;
    // Let text-only pastes work natively? No — clipboardData is broken here
    // anyway; we own paste entirely: read image, else re-insert text.
    e.preventDefault();
    void (async () => {
      try {
        const { readClipboardImage } = await import("../letta/clipboard");
        const b64 = await readClipboardImage();
        if (b64) {
          const prepared = await prepareImage(`data:image/png;base64,${b64}`);
          const markerIndex = pendingImages.length + 1;
          addPending(prepared);
          insertAtCursor(`[${markerIndex}]`);
          void import("../letta/localKey").then(({ appendDebugLog }) =>
            appendDebugLog(
              `[paste] rust clipboard → image ${prepared.width}x${prepared.height} b64len=${prepared.base64.length} marker=[${markerIndex}]`,
            ).catch(() => {}),
          );
          return;
        }
        // No image in clipboard: fall back to text paste at cursor.
        const { invoke } = await import("@tauri-apps/api/core");
        const text = await invoke<string | null>("read_clipboard_text");
        if (text) {
          insertAtCursor(text);
        }
      } catch (err) {
        void import("../letta/localKey").then(({ appendDebugLog }) =>
          appendDebugLog(`[paste] rust clipboard error: ${String(err).slice(0, 120)}`).catch(() => {}),
        );
      }
    })();
  };

  /** Insert text at the caret of the focused textarea and notify React. */
  const insertAtCursor = (text: string) => {
    const el = document.querySelector<HTMLTextAreaElement>(
      "[data-lettadock-composer]",
    );
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const addFromClipboard = (e: React.ClipboardEvent) => {
    // Diagnostics only now: the real paste path is onCtrlV above.
    const dt = e.clipboardData;
    void import("../letta/localKey").then(({ appendDebugLog }) =>
      appendDebugLog(
        `[paste-event] files=${dt?.files?.length ?? 0} kinds=[${Array.from(dt?.items ?? []).map((i) => `${i.kind}:${i.type}`).join(",")}] textLen=${dt?.getData("text/plain")?.length ?? 0}`,
      ).catch(() => {}),
    );
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
                onClick={() => removePending(i)}
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
          data-lettadock-composer
          placeholder="Написать сообщение… (Ctrl+V вставит картинку маркером [N])"
          onKeyDown={onCtrlV}
          onPaste={addFromClipboard}
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
