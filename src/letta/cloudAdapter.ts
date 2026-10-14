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

/**
 * user_message content may arrive as a string, or as a list of content parts
 * ({type:'text', text}) — CLI messages embed <system-reminder> blocks plus
 * the human text as separate parts. Show only the human text: drop parts
 * that are entirely <system-reminder>…</system-reminder>, and strip any
 * reminder tags from mixed parts. Images kept as [image] placeholder.
 */
export function stripRemindersFromText(s: string): string {
  return s
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<\/?system-reminder>/g, "")
    .trim();
}

/**
 * Preserve part order for display: text parts (reminder-stripped) and
 * images as ordered entries, so history renders "текст [image] текст".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function contentToParts(content: any): Array<{ type: "text" | "image"; text?: string }> {
  const collect = (
    parts: Array<{ type?: string; text?: string }>,
  ): Array<{ type: "text" | "image"; text?: string }> => {
    const out: Array<{ type: "text" | "image"; text?: string }> = [];
    for (const p of parts) {
      if (p?.type === "text" && typeof p.text === "string") {
        const clean = stripRemindersFromText(p.text);
        if (clean) out.push({ type: "text", text: clean });
      } else if (p?.type === "image") {
        out.push({ type: "image" });
      }
    }
    return out;
  };
  if (typeof content === "string") {
    if (content.startsWith("[")) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return collect(parsed);
      } catch {
        /* plain string that starts with [ */
      }
    }
    const clean = stripRemindersFromText(content);
    return clean ? [{ type: "text", text: clean }] : [];
  }
  if (Array.isArray(content)) {
    return collect(content as Array<{ type?: string; text?: string }>);
  }
  return [];
}

function normalizeContent(content: unknown): string | undefined {
  const parts = contentToParts(content);
  if (parts.length === 0) return undefined;
  return parts
    .map((p) => (p.type === "image" ? "[image]" : (p.text ?? "")))
    .join("\n");
}

export class CloudLettaAdapter implements LettaAdapter {
  private apiKey: string;
  private profile: ServerProfile;
  private proxy: LettaProxyClient;
  private client: SdkClient | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdkPromise: Promise<any> | null = null;
  /** Stable device id of the online computer (connectionId rotates). */
  private lastOnlineDeviceId: string | null = null;

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
        const { createProxiedFetch } = await import("./proxyClient");
        // ALL SDK HTTP goes through the Rust proxy (owner decision: nothing
        // leaves the frontend directly — api.letta.com lacks CORS headers on
        // most endpoints). WebSocket relays stay direct (no CORS on WS).
        const proxiedFetch = createProxiedFetch(this.apiKey);
        await log("sdk: module imported, constructing client with proxied fetch…");
        this.client = new mod.LettaAgentClient({
          backend: "cloud",
          apiKey: this.apiKey,
          webSocketAuth: "query" as const,
          fetch: proxiedFetch as unknown as typeof fetch,
        });
        await log("sdk: client constructed (proxied)");
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
        summary?: string;
        created_at?: string;
        updated_at?: string;
      }>;
      await log(`listConversations: OK, ${arr.length} conversations`);
      // Cloud conversations have name=None; API-derived title from summary.
      // API order is arbitrary — sort by updated_at DESC (recent on top),
      // owner expectation: conversations you just wrote in come first.
      const mapped = arr.map((c) => ({
        id: c.id,
        agentId,
        name: c.name || c.summary?.slice(0, 60) || c.id,
        createdAt: c.created_at ?? "",
        lastMessageAt: c.updated_at,
      }));
      mapped.sort((a, b) =>
        (b.lastMessageAt ?? b.createdAt).localeCompare(
          a.lastMessageAt ?? a.createdAt,
        ),
      );
      return mapped;
    } catch (e) {
      await log(`listConversations: ERROR ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  async getHistory(conversationId: string, limit = 50): Promise<LettaMessage[]> {
    await log(`getHistory: conv=${conversationId} limit=${limit} via proxy…`);
    try {
      // API default order is DESC (newest first). Fetch last N, then reverse
      // to ASC for chat rendering (oldest on top).
      const arr = (await this.proxy.listMessages(conversationId, {
        limit: String(limit),
        order: "desc",
      })) as Array<{
        id: string;
        date: string;
        seq_id?: number;
        message_type?: string;
        content?: string;
      }>;
      arr.reverse();
      await log(
        `getHistory: OK, ${arr.length} messages (asc, seq ${arr[0]?.seq_id ?? "?"}..${arr[arr.length - 1]?.seq_id ?? "?"})`,
      );
      return arr.map((m) => ({
        id: m.id,
        date: m.date,
        messageType: m.message_type ?? "unknown",
        content: normalizeContent(m.content),
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
        connectionName?: string;
      }>;
      await log(`findOnlineComputer: ${arr.length} connections`);
      for (const c of arr) {
        await log(
          `findOnlineComputer: - ${c.connectionName ?? c.name ?? "?"} deviceId=${c.deviceId ?? "?"} connectionId=${c.connectionId ?? "NULL"}`,
        );
      }
      const online = arr.find((c) => c.connectionId);
      if (!online) {
        await log("findOnlineComputer: result=null (no online)");
        return null;
      }
      // Prefer connectionName ("ibook26"); fall back to deviceId which the
      // session layer can resolve back to a fresh connection.
      const name =
        online.connectionName ?? online.name ?? online.deviceId ?? null;
      this.lastOnlineDeviceId = online.deviceId ?? null;
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
    // connectionId ROTATES on device reconnect (log-verified: session ready()
    // died with 'Connection error' on a stale conn-… id; the fresh one from a
    // new /v1/environments fetch works). Resolve by deviceId immediately
    // before opening; deviceId is stable.
    if (computer && this.lastOnlineDeviceId) {
      const fresh = await this.proxy.getDeviceConnection(
        this.lastOnlineDeviceId,
      );
      if (fresh?.connectionId) {
        options.computer = { connectionId: fresh.connectionId };
        await log(
          `openSession: using fresh connectionId=${fresh.connectionId} (device=${this.lastOnlineDeviceId})`,
        );
      } else {
        options.computer = { name: computer };
        await log(`openSession: no fresh connection — falling back to name=${computer}`);
      }
    } else if (computer) {
      options.computer = { name: computer };
    }
    await log(
      `openSession: conv=${conversationId} computer=${JSON.stringify(options.computer ?? null)}…`,
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

  /** Conversation record: model, context_window_limit, in_context ids. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async retrieveConversationRaw(conversationId: string): Promise<any> {
    return this.proxy.retrieveConversation(conversationId);
  }

  /** Create an ephemeral sandbox for file uploads. */
  async createSandbox(
    agentId: string,
    conversationId?: string,
  ): Promise<{ sandboxId: string }> {
    return this.proxy.createSandbox(agentId, conversationId);
  }

  async terminateSandbox(sandboxId: string): Promise<void> {
    return this.proxy.terminateSandbox(sandboxId);
  }

  /** List available models via the session (503 entries, live-verified). */
  async listSessionModels(
    conversationId: string,
  ): Promise<{ entries: any[]; availableHandles: string[] | null }> {
    const client = await this.sdk();
    const session = client.resumeSession(conversationId);
    try {
      await session.ready();
      const res = await session.listModels();
      return { entries: res.entries ?? [], availableHandles: res.availableHandles ?? null };
    } finally {
      session.close();
    }
  }

  /** Change conversation model. Named conversations → conversation scope. */
  async updateSessionModel(conversationId: string, model: string): Promise<void> {
    const client = await this.sdk();
    const session = client.resumeSession(conversationId);
    try {
      await session.ready();
      const res = await session.updateModel({ model });
      await log(`updateSessionModel: ${model} appliedTo=${res.appliedTo ?? "?"}`);
    } finally {
      session.close();
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
