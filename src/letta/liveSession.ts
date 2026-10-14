// Live session manager: one active session per conversation.
// SDK facts (docs/phase3-session-notes.md):
// - closed session is NOT reusable → reopen on demand
// - stream() yields until the turn's `result`, then terminates
// - assistant/tool_call/reasoning/error/retry/queue_update/loop_status events
import type { LettaMessage } from "./types";
import type { CloudLettaAdapter } from "./cloudAdapter";

export type TurnPhase = "idle" | "sending" | "streaming" | "error";

export interface TurnState {
  phase: TurnPhase;
  error?: string;
  /** Streaming assistant text accumulated so far. */
  streamText: string;
  /** Tool calls observed this turn (by toolCallId). */
  toolCalls: Record<
    string,
    { name: string; input: string; done: boolean; result?: string }
  >;
  stopReason?: string;
}

export interface ChatEventHandlers {
  /** Called with the full updated message list after every change. */
  onMessages: (messages: LettaMessage[]) => void;
  onTurnState: (state: TurnState) => void;
}

const idleState: TurnState = {
  phase: "idle",
  streamText: "",
  toolCalls: {},
};

export type ContentPart =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export class LiveSessionManager {
  private adapter: CloudLettaAdapter;
  private handlers: ChatEventHandlers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private sessionConversationId: string | null = null;
  private aborted = false;
  /** TARGET-1: "cloud" forces managed sandbox; {deviceId} forces computer;
   *  null keeps the profile default. */
  private targetOverride: "cloud" | { deviceId: string; name: string } | null =
    null;

  // Working state for the current conversation view
  private history: LettaMessage[] = [];
  private turn: TurnState = { ...idleState };

  constructor(adapter: CloudLettaAdapter, handlers: ChatEventHandlers) {
    this.adapter = adapter;
    this.handlers = handlers;
  }

  setTarget(target: "cloud" | { deviceId: string; name: string } | undefined) {
    this.targetOverride = target ?? null;
  }

  /** Load (or reload) base history for a conversation, e.g. on open or refresh. */
  async loadHistory(conversationId: string, limit = 50): Promise<void> {
    if (this.sessionConversationId !== conversationId) {
      await this.closeSession();
    }
    const history = await this.adapter.getHistory(conversationId, limit);
    this.history = history;
    this.emit();
  }

  private emit() {
    const combined: LettaMessage[] = [...this.history];
    // Optimistic user message is already appended to history by send().
    if (this.turn.phase === "streaming" || this.turn.streamText) {
      combined.push({
        id: "streaming-assistant",
        date: new Date().toISOString(),
        messageType: "assistant_message",
        content: this.turn.streamText,
        raw: { streaming: true },
      });
    }
    for (const [toolCallId, tc] of Object.entries(this.turn.toolCalls)) {
      combined.push({
        id: `turn-tool-${toolCallId}`,
        date: new Date().toISOString(),
        messageType: "tool_call_message",
        raw: {
          tool_call_id: toolCallId,
          name: tc.name,
          arguments: tc.input,
          result: tc.result,
          done: tc.done,
        },
      });
    }
    this.handlers.onMessages(combined);
    this.handlers.onTurnState(this.turn);
  }

  /**
   * Send a user message and consume the turn stream.
   * Appends the optimistic user message immediately.
   */
  async send(conversationId: string, text: string): Promise<void> {
    await this.sendInternal(conversationId, [{ type: "text", text }]);
  }

  /** Send text + base64 images (raw base64, no data: prefix). */
  async sendWithImages(
    conversationId: string,
    text: string,
    images: string[],
  ): Promise<void> {
    const parts: ContentPart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const img of images) {
      const mediaType = sniffMediaType(img);
      parts.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: img },
      });
    }
    await this.sendInternal(conversationId, parts);
  }

  /** Send pre-built content parts (marker-interleaved text/images). */
  async sendParts(
    conversationId: string,
    parts: ContentPart[],
  ): Promise<void> {
    await this.sendInternal(conversationId, parts);
  }

  private async sendInternal(
    conversationId: string,
    contentParts: ContentPart[],
  ): Promise<void> {
    if (this.turn.phase === "sending" || this.turn.phase === "streaming") {
      return; // one turn at a time in the UI
    }
    this.aborted = false;
    this.turn = { ...idleState, phase: "sending" };
    this.emit();

    try {
      // Reuse session only for same conversation; otherwise open a fresh one.
      if (
        !this.session ||
        this.sessionConversationId !== conversationId
      ) {
        await this.closeSession();
        this.session = await this.adapter.openSession(
          conversationId,
          undefined,
          this.targetOverride,
        );
        this.sessionConversationId = conversationId;
      }

      const textParts = contentParts.filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const imageCount = contentParts.filter(
        (p): p is { type: "image"; source: { type: "base64"; media_type: string; data: string } } =>
          p.type === "image",
      ).length;
      const displayText =
        textParts.map((p) => p.text).join("\n") +
        (imageCount > 0 ? ` [изображений: ${imageCount}]` : "");
      this.history = [
        ...this.history,
        {
          id: `local-${Date.now()}`,
          date: new Date().toISOString(),
          messageType: "user_message",
          content: displayText,
          raw: { optimistic: true },
        },
      ];
      this.turn = { ...this.turn, phase: "streaming" };
      this.emit();

      await this.session.send(
        contentParts.length === 1 && contentParts[0].type === "text"
          ? contentParts[0].text
          : contentParts,
      );
      for await (const msg of this.session.stream()) {
        if (this.aborted) break;
        this.applyStreamEvent(msg);
        this.emit();
        if (msg.type === "result") break;
      }
      this.turn = {
        ...this.turn,
        phase: "idle",
        streamText: "",
        toolCalls: {},
      };
      // Refetch authoritative history to reconcile (dedup, ordering).
      this.history = await this.adapter.getHistory(conversationId, 50);
      this.emit();
    } catch (e) {
      this.turn = {
        ...idleState,
        phase: "error",
        error: e instanceof Error ? e.message : String(e),
      };
      this.emit();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyStreamEvent(msg: any): void {
    switch (msg.type) {
      case "assistant":
        // Full assistant message (non-delta path) — replace accumulated text.
        this.turn = {
          ...this.turn,
          streamText:
            typeof msg.content === "string" ? msg.content : this.turn.streamText,
        };
        break;
      case "stream_event": {
        const ev = msg.event ?? {};
        if (ev.delta?.text) {
          this.turn = {
            ...this.turn,
            streamText: this.turn.streamText + ev.delta.text,
          };
        }
        break;
      }
      case "tool_call": {
        const calls = { ...this.turn.toolCalls };
        calls[msg.toolCallId] = {
          name: msg.toolName ?? "tool",
          input:
            msg.rawArguments ?? JSON.stringify(msg.toolInput ?? {}) ?? "",
          done: false,
        };
        this.turn = { ...this.turn, toolCalls: calls };
        break;
      }
      case "tool_result": {
        const calls = { ...this.turn.toolCalls };
        const id = msg.toolCallId;
        if (calls[id]) {
          calls[id] = {
            ...calls[id],
            done: true,
            result: truncateStr(
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content ?? msg.result ?? ""),
              500,
            ),
          };
          this.turn = { ...this.turn, toolCalls: calls };
        }
        break;
      }
      case "error":
        this.turn = {
          ...this.turn,
          phase: "error",
          error: msg.errorDetail ?? msg.message ?? "stream error",
        };
        break;
      case "retry":
        // Transient; surface via phase text but keep streaming.
        break;
      default:
        break;
    }
  }

  /** Abort current turn. The session becomes unusable only on close; abort keeps it. */
  async abort(): Promise<void> {
    this.aborted = true;
    try {
      await this.session?.abort();
    } catch {
      /* session may already be gone */
    }
    this.turn = { ...idleState };
    this.emit();
  }

  async closeSession(): Promise<void> {
    try {
      this.session?.close();
    } catch {
      /* ignore */
    }
    this.session = null;
    this.sessionConversationId = null;
  }

  async dispose(): Promise<void> {
    await this.closeSession();
  }
}

function truncateStr(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Sniff media type from a base64 data-URI prefix or magic bytes. */
function sniffMediaType(b64: string): string {
  // data:image/png;base64,.... → image/png
  const m = /^data:(image\/[a-z+]+);base64,/.exec(b64);
  if (m) return m[1];
  const head = b64.slice(0, 20);
  if (head.startsWith("iVBOR")) return "image/png";
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("R0lGOD")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
