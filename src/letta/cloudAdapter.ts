// Cloud adapter over @letta-ai/letta-agent-sdk — portable client entry.
// Phase 3: switched from Node entry to /client (no node:child_process),
// webSocketAuth: "query" (browser WS cannot set Authorization headers).
// Verified shapes (see docs/phase2-api-notes.md + docs/phase3-session-notes.md):
//   client.agents.list()                          -> Array (APIPromise unwraps ArrayPage)
//   client.conversations.list({ agentId })        -> Array
//   client.conversations.listMessages(convId,{})  -> { messages: [...] }
//   client.computers.list()                       -> Array
//   client.resumeSession(convId) -> session (send/stream/abort/close)
import type {
  AgentSummary,
  ConversationSummary,
  LettaAdapter,
  LettaMessage,
  ServerProfile,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkClient = any;

export class CloudLettaAdapter implements LettaAdapter {
  private apiKey: string;
  private profile: ServerProfile;
  private client: SdkClient | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdkPromise: Promise<any> | null = null;

  constructor(profile: ServerProfile, apiKey: string) {
    this.profile = profile;
    this.apiKey = apiKey;
  }

  private async sdk(): Promise<SdkClient> {
    if (!this.client) {
      this.sdkPromise ??= import("@letta-ai/letta-agent-sdk/client").then(
        (mod) => {
          this.client = new mod.LettaAgentClient({
            backend: "cloud",
            apiKey: this.apiKey,
            webSocketAuth: "query" as const,
          });
          return this.client;
        },
      );
      return this.sdkPromise;
    }
    return this.client;
  }

  async listAgents(): Promise<AgentSummary[]> {
    const client = await this.sdk();
    const items = await client.agents.list();
    const arr = Array.isArray(items) ? items : (items.items ?? []);
    return arr.map((a: { id: string; name?: string }) => ({
      id: a.id,
      name: a.name ?? a.id,
    }));
  }

  async listConversations(agentId: string): Promise<ConversationSummary[]> {
    const client = await this.sdk();
    const items = await client.conversations.list({ agentId });
    const arr = Array.isArray(items) ? items : (items.items ?? []);
    return arr.map(
      (c: {
        id: string;
        name?: string;
        created_at?: string;
        last_modification_date?: string;
      }) => ({
        id: c.id,
        agentId,
        name: c.name ?? "",
        createdAt: c.created_at ?? "",
        lastMessageAt: c.last_modification_date,
      }),
    );
  }

  async getHistory(conversationId: string, limit = 50): Promise<LettaMessage[]> {
    const client = await this.sdk();
    const res = await client.conversations.listMessages(conversationId, {
      limit,
    });
    const arr = res.messages ?? res.items ?? res;
    return (Array.isArray(arr) ? arr : []).map(
      (m: {
        id: string;
        date: string;
        message_type?: string;
        content?: string;
      }) => ({
        id: m.id,
        date: m.date,
        messageType: m.message_type ?? "unknown",
        content: typeof m.content === "string" ? m.content : undefined,
        raw: m,
      }),
    );
  }

  async findOnlineComputer(): Promise<string | null> {
    try {
      const client = await this.sdk();
      const items = await client.computers.list();
      const arr = Array.isArray(items) ? items : (items.items ?? []);
      const online = arr.find(
        (c: { connectionId?: string | null }) => c.connectionId,
      );
      return online ? (online.name ?? online.deviceId ?? null) : null;
    } catch {
      return null;
    }
  }

  /** Open a live session for sending/streaming. Tools run on the profile's computer when set. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async openSession(conversationId: string, computerName?: string): Promise<any> {
    const client = await this.sdk();
    const options: Record<string, unknown> = {};
    const computer = computerName ?? this.profile.computerName;
    if (computer) options.computer = { name: computer };
    const session = client.resumeSession(conversationId, options);
    await session.ready();
    return session;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.sdkPromise = null;
    }
  }
}
