// Cloud adapter implementation over @letta-ai/letta-agent-sdk.
// Verified against SDK 0.8.42:
//   new LettaAgentClient({ backend: "cloud", apiKey })
//   client.agents.list()                    -> { agents: [...] }
//   client.conversations.list({ agentId })  -> { conversations: [...] }
//   client.conversations.listMessages(conversationId, { limit })
// Close the client when done — it holds a local server handle in some backends.
import type {
  AgentSummary,
  ConversationSummary,
  LettaAdapter,
  LettaMessage,
  ServerProfile,
} from "./types";

// Lazy import: the SDK pulls in heavy Node deps; keep it out of the initial
// bundle path until a profile actually connects. (Tauri webview runs Node-
// compatible code only in a Node context; in-browser we will need the /client
// entry — verified as an SDK export " PORT". Tracked in docs/phase2-api-notes.md.)
export class CloudLettaAdapter implements LettaAdapter {
  private apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  constructor(_profile: ServerProfile, apiKey: string) {
    this.apiKey = apiKey;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sdk(): Promise<any> {
    if (!this.client) {
      const mod = await import("@letta-ai/letta-agent-sdk");
      this.client = new mod.LettaAgentClient({
        backend: "cloud",
        apiKey: this.apiKey,
      });
    }
    return this.client;
  }

  async listAgents(): Promise<AgentSummary[]> {
    const client = await this.sdk();
    const res = await client.agents.list();
    const items = res.agents ?? res.items ?? res;
    return items.map((a: { id: string; name?: string }) => ({
      id: a.id,
      name: a.name ?? a.id,
    }));
  }

  async listConversations(agentId: string): Promise<ConversationSummary[]> {
    const client = await this.sdk();
    const res = await client.conversations.list({ agentId });
    const items = res.conversations ?? res.items ?? res;
    return items.map(
      (c: {
        id: string;
        name?: string;
        created_at?: string;
        last_message_at?: string;
      }) => ({
        id: c.id,
        agentId,
        name: c.name ?? c.id,
        createdAt: c.created_at ?? "",
        lastMessageAt: c.last_message_at,
      }),
    );
  }

  async getHistory(conversationId: string, limit = 50): Promise<LettaMessage[]> {
    const client = await this.sdk();
    const res = await client.conversations.listMessages(conversationId, {
      limit,
    });
    const items = res.messages ?? res.items ?? res;
    return items.map(
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

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
