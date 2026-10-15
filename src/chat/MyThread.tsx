import { useRef, useState } from "react";
import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import type { TextMessagePartProps, ToolCallMessagePartProps } from "@assistant-ui/react";
import { MarkdownText } from "./MarkdownText";
import { SendHorizontal, Square, Wrench, Paperclip, FileText } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { cn } from "../lib/utils";
import {
  openFileRef,
} from "./fileOpener";
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

// Phase 4: [файл: path] chips in user messages → open in viewer.
// App registers its handler here (module-level, avoids prop drilling
// through assistant-ui part components which can't take custom props).
// Ref moved to ./fileOpener (fast-refresh compatibility).

function FileChips({ text }: { text: string }) {
  const matches = [...text.matchAll(/\[файл: ([^\]]+)\]/g)];
  if (matches.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {matches.map((m, i) => (
        <button
          key={i}
          onClick={() => openFileRef.current?.({ path: m[1], fromChip: true })}
          className="flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary hover:text-foreground"
          title="Открыть в просмотрщике"
        >
          <FileText className="h-3 w-3" />
          <span className="max-w-[220px] truncate">{m[1]}</span>
        </button>
      ))}
    </div>
  );
}

const UserText = ({ text }: TextMessagePartProps) => {
  // UX-2: hover copy button (PWA parity).
  const [copied, setCopied] = useState(false);
  return (
    <span className="group relative inline-block whitespace-pre-wrap">
      {text}
      <button
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        title="Копировать сообщение"
        className={cn(
          "absolute -left-6 top-0 rounded p-0.5 text-[10px] transition-opacity",
          copied
            ? "text-emerald-400 opacity-100"
            : "opacity-0 group-hover:opacity-60 hover:!opacity-100",
        )}
      >
        {copied ? "✓" : "⧉"}
      </button>
      <FileChips text={text} />
    </span>
  );
};

const ToolCall = ({ toolName, argsText, result }: ToolCallMessagePartProps) => {
  // UX-4: collapsed by default (PWA parity) — one line: icon + name +
  // expand toggle. Click reveals args/result.
  const [open, setOpen] = useState(false);
  // Edit/Write tool calls: args usually carry file_path + old/new content →
  // offer a diff view. Read-only tools keep the plain fallback.
  let filePath: string | undefined;
  let newContent: string | undefined;
  let oldContent: string | undefined;
  try {
    const args = JSON.parse(argsText || "{}") as Record<string, unknown>;
    if (typeof args.file_path === "string") filePath = args.file_path;
    if (typeof args.path === "string") filePath = args.path;
    if (typeof args.new_string === "string") newContent = args.new_string;
    if (typeof args.content === "string") newContent = args.content;
    if (typeof args.old_string === "string") oldContent = args.old_string;
    if (typeof args.old_content === "string") oldContent = args.old_content;
  } catch {
    /* non-JSON args */
  }
  const canDiff = Boolean(filePath && newContent != null);

  return (
    <div className="mb-2 rounded-md border bg-secondary/40 px-3 py-2 font-mono text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 text-left hover:text-foreground"
        >
          <Wrench className="h-3 w-3 shrink-0" />
          <span className="truncate">{toolName}</span>
          <span className="ml-auto shrink-0 text-[10px] font-normal">
            {open ? "▲" : "▼"}
          </span>
        </button>
        {canDiff && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openFileRef.current?.({
                path: filePath!,
                newContent,
                oldContent,
              });
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-normal text-primary hover:bg-primary/10"
          >
            diff: {filePath?.split("/").pop()}
          </button>
        )}
      </div>
      {open && (
        <>
          {argsText && (
            <div className="mt-1 whitespace-pre-wrap break-all text-muted-foreground">
              {argsText}
            </div>
          )}
          {result != null && (
            <div className="mt-1 whitespace-pre-wrap break-all">
              {String(result)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AssistantMessage = () => (
  <MessagePrimitive.Root className="px-4 py-2">
    <div className="max-w-[90%] rounded-lg rounded-bl-sm bg-card px-4 py-2 text-foreground">
      <ApprovalCard />
      <MessagePrimitive.Parts
        components={{ Text: MarkdownText, tools: { Fallback: ToolCall } }}
      />
    </div>
  </MessagePrimitive.Root>
);

// APPROVE-1: inline approval card — [Одобрить] [Отклонить] in the doc.
const ApprovalCard = () => {
  const pending = useAppStore((s) => s.pendingApproval);
  const respondApproval = useAppStore((s) => s.respondApproval);
  if (!pending) return null;
  return (
    <div className="mb-2 rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2.5">
      <div className="mb-1 text-xs font-semibold text-amber-300">
        Тул требует подтверждения
      </div>
      <div className="font-mono text-xs text-foreground">{pending.toolName}</div>
      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-secondary/50 p-2 text-[10px] text-muted-foreground">
        {JSON.stringify(pending.toolInput, null, 2)}
      </pre>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => respondApproval(pending.requestId, true)}
          className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600"
        >
          Одобрить
        </button>
        <button
          onClick={() => respondApproval(pending.requestId, false)}
          className="rounded-md border border-red-800 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-950/50"
        >
          Отклонить
        </button>
      </div>
    </div>
  );
};

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
  // ATTACH-2: paperclip — upload non-image file to the conversation sandbox,
  // insert its path as text so the agent can read it from the filesystem.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attaching, setAttaching] = useState(false);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAttaching(true);
    try {
      const conversationId = useAppStore.getState().selectedConversationId;
      if (!conversationId) return;
      const uploaded = await useAppStore
        .getState()
        .attachFile(conversationId, file);
      insertAtCursor(`\n[файл: ${uploaded.path}]\n`);
    } catch (err) {
      void import("../letta/localKey").then(({ appendDebugLog }) =>
        appendDebugLog(`[attach] FAILED ${String(err).slice(0, 150)}`).catch(() => {}),
      );
    } finally {
      setAttaching(false);
    }
  };

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
    // React's value tracker dedups direct .value writes — bypass it via the
    // native setter so onChange (composer state) actually fires.
    const proto = Object.getPrototypeOf(el);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(
        el,
        el.value.slice(0, start) + text + el.value.slice(end),
      );
    } else {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
    }
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
        {attaching && (
          <span className="p-2 text-xs text-muted-foreground">загрузка…</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onPickFile}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={running || attaching}
          title="Прикрепить файл (загрузится в песочницу агента)"
          className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" />
        </button>
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
