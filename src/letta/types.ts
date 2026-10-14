// LettaAdapter — narrow, capability-based interface (Phase 2: read-only).
// Method names here are application-level, verified against the installed
// @letta-ai/letta-agent-sdk 0.8.42 (see docs/phase2-api-notes.md).

export interface ServerProfile {
  id: string;
  name: string;
  kind: "cloud" | "remote";
  /** Cloud: no url needed (api.letta.com). Remote: user-configured base URL. */
  url?: string;
}

export interface AgentSummary {
  id: string;
  name: string;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  name: string;
  createdAt: string;
  lastMessageAt?: string;
}

export type LettaMessage = {
  id: string;
  date: string;
  messageType: string;
  content?: string;
  /** Raw payload for types we render specially later (tool calls etc). */
  raw: unknown;
};

export interface ConnectionStatus {
  state: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
}

/** Read-only surface. Mutating operations are intentionally absent (Phase 3+). */
export interface LettaAdapter {
  listAgents(): Promise<AgentSummary[]>;
  listConversations(agentId: string): Promise<ConversationSummary[]>;
  getHistory(conversationId: string, limit?: number): Promise<LettaMessage[]>;
}
