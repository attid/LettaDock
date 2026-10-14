// Model + context window display/select (TARGET: PWA parity).
// Verified live against api.letta.com:
// - conversation: model, model_settings, context_window_limit,
//   in_context_message_ids
// - session.listModels() → { entries: [{id, handle, label, ...}],
//   availableHandles }, session.updateModel({model}) applies to
//   conversation (named) or agent (default)
// - /v1/steps (token usage) is BROKEN server-side (400 on any query) —
//   context % is estimated from in-context message chars/4 (honest approx,
//   documented as such).

export interface ContextUsage {
  /** Estimated tokens currently in context. */
  usedEstimate: number;
  /** Server-provided context window limit. */
  limit: number;
  percent: number;
  /** Number of in-context messages (informational). */
  inContextMessages: number;
}

export interface ConversationModelInfo {
  model: string;
  contextWindowLimit: number;
  usage: ContextUsage;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractModelInfo(conversation: any, messages: any[]): ConversationModelInfo | null {
  if (!conversation) return null;
  const model: string = conversation.model ?? "unknown";
  const limit: number = conversation.context_window_limit ?? 0;
  const inCtx = new Set<string>(conversation.in_context_message_ids ?? []);
  const inMsgs = messages.filter((m) => inCtx.has(m.id));
  const chars = inMsgs.reduce(
    (s, m) => s + (typeof m.content === "string" ? m.content.length : 0),
    0,
  );
  const usedEstimate = Math.ceil(chars / 4);
  const percent = limit > 0 ? (usedEstimate / limit) * 100 : 0;
  return {
    model,
    contextWindowLimit: limit,
    usage: {
      usedEstimate,
      limit,
      percent: Math.round(percent * 10) / 10,
      inContextMessages: inMsgs.length,
    },
  };
}
