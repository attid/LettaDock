// Cloud adapter.
//
// Phase 3.1: REST calls go through the Tauri Rust proxy (proxyClient.ts) —
// api.letta.com omits CORS headers on /v1/environments, so browser fetch
// dies with "Connection error" (log-verified 2026-10-14). Live sessions
// still use the SDK client entry for WebSocket relay streaming.
//
// Endpoint shapes (verified via curl):
//   GET /v1/agents/                                      -> bare array
//   GET /v1/agents/{id}/conversations                    -> array | {conversations}
//   GET /v1/conversations/{id}/messages                  -> {messages: [...]}
//   GET /v1/environments                                 -> {connections: [...]}
import type {
  AgentSummary,
  ConversationSummary,
  LettaAdapter,
  LettaMessage,
  ServerProfile,
} from "./types";
import { LettaProxyClient } from "./proxyClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkClient = any;

async function log(msg: string): Promise<void> {
  const line = `[sdk ${new Date().toISOString().slice(11, 23)}] ${msg}`;
  console.log(line);
  try {
    const { appendDebugLog } = await import("./localKey");
    await appendDebugLog(line);
  } catch {
    /* best-effort */
  }
}

export class CloudLettaAdapter implements LettaAdapter {
  private apiKey: string;
  private profile: ServerProfile;
  private proxy: LettaProxyClient;
  private client: SdkClient | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdkPromise: Promise<any> | null = null;

  constructor(profile: ServerProfile, apiKey: string) {
    this.profile = profile;
    this.apiKey = apiKey;
    this.proxy = new LettaProxyClient(apiKey);
    void log(
      `adapter ctor: profile=${profile.id} computer=${profile.computerName ?? "auto"} keyLen=${apiKey.length}`,
    );
  }

  /** SDK client only for WebSocket sessions (streaming). REST goes via proxy. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sdk(): Promise<any> {
    if (!this.client) {
      this.sdkPromise ??= (async () => {
        await log("sdk: importing @letta-ai/letta-agent-sdk/client…");
        const mod = await import("@letta-ai/letta-agent-sdk/client");
        await log("sdk: module imported, constructing client…");
        this.client = new mod.LettaAgentClient({
          backend: "cloud",
          apiKey: this.apiKey,
          webSocketAuth: "query" as const,
        });
        await log("sdk: client constructed");
        return this.client;
      })();
      return this.sdkPromise;
    }
    return this.client;
  }

  async listAgents(): Promise<AgentSummary[]> {
    await log("listAgents: via proxy…");
    try {
      const arr = (await this.proxy.listAgents({ limit: "100" })) as Array<{
        id: string;
        name?: string;
      }>;
      await log(`listAgents: OK, ${arr.length} agents`);
      return arr.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
      }));
    } catch (e) {
      await log(`listAgents: ERROR ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  async listConversations(agentId: string): Promise<ConversationSummary[]> {
    await log(`listConversations: agentId=${agentId} via proxy…`);
    try {
      const arr = (await this.proxy.listConversations(agentId, {
        limit: "50",
      })) as Array<{
        id: string;
        name?: string;
        created_at?: string;
        updated_at?: string;
      }>;
      await log(`listConversations: OK, ${arr.length} conversations`);
      return arr.map((c) => ({
        id: c.id,
        agentId,
        name: c.name ?? "",
        createdAt: c.created_at ?? "",
        lastMessageAt: c.updated_at,
      }));
    } catch (e) {
      await log(`listConversations: ERROR ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  async getHistory(conversationId: string, limit = 50): Promise<LettaMessage[]> {
    await log(`getHistory: conv=${conversationId} limit=${limit} via proxy…`);
    try {
      const arr = (await this.proxy.listMessages(conversationId, {
        limit: String(limit),
      })) as Array<{
        id: string;
        date: string;
        message_type?: string;
        content?: string;
      }>;
      await log(`getHistory: OK, ${arr.length} messages`);
      return arr.map((m) => ({
        id: m.id,
        date: m.date,
        messageType: m.message_type ?? "unknown",
        content: typeof m.content === "string" ? m.content : undefined,
        raw: m,
      }));
    } catch (e) {
      await log(`getHistory: ERROR ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  async findOnlineComputer(): Promise<string | null> {
    try {
      await log("findOnlineComputer: via proxy…");
      const arr = (await this.proxy.listEnvironments({
        onlineOnly: "true",
      })) as Array<{
        name?: string;
        deviceId?: string;
        connectionId?: string | null;
      }>;
      await log(`findOnlineComputer: ${arr.length} connections`);
      for (const c of arr) {
        await log(
          `findOnlineComputer: - ${c.name ?? "?"} connectionId=${c.connectionId ?? "NULL"}`,
        );
      }
      const online = arr.find((c) => c.connectionId);
      const name = online ? (online.name ?? online.deviceId ?? null) : null;
      await log(`findOnlineComputer: result=${name ?? "null"}`);
      return name;
    } catch (e) {
      await log(`findOnlineComputer: ERROR ${e instanceof Error ? e.message : String(e)}`);
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
    await log(
      `openSession: conv=${conversationId} computer=${computer ?? "none/managed-sandbox"}…`,
    );
    const session = client.resumeSession(conversationId, options);
    try {
      await session.ready();
      await log("openSession: ready() OK");
      return session;
    } catch (e) {
      await log(`openSession: ready() FAILED ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await log("adapter close()");
      await this.client.close();
      this.client = null;
      this.sdkPromise = null;
    }
  }
}
