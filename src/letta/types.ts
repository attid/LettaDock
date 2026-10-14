// LettaAdapter — narrow, capability-based interface.
// Phase 3: adds live session messaging on top of Phase 2 read-only.
// All method names verified against @letta-ai/letta-agent-sdk 0.8.42 —
// see docs/phase2-api-notes.md and docs/phase3-session-notes.md.

export interface ServerProfile {
  id: string;
  name: string;
  kind: "cloud";
  /** Remote computer (e.g. "ibook26") where tools run. Empty = SDK managed sandbox (avoid for tool-using agents). */
  computerName?: string;
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

/** Read-only data surface (history, lists). Mutations go through SessionManager. */
export interface LettaAdapter {
  listAgents(): Promise<AgentSummary[]>;
  listConversations(agentId: string): Promise<ConversationSummary[]>;
  getHistory(conversationId: string, limit?: number): Promise<LettaMessage[]>;
  /** Non-empty name of the single online computer, if any. */
  findOnlineComputer(): Promise<string | null>;
}
