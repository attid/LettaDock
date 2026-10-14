// REST transport for the adapter via the Tauri Rust proxy.
// Rationale: api.letta.com omits Access-Control-Allow-Origin on
// /v1/environments (and some other routes), which kills browser fetch from
// the webview. The proxy (src-tauri/src/proxy.rs) forwards requests without
// browser CORS rules. Sessions/WebSockets go direct (relay endpoints set
// proper WS auth via query token; no CORS on WS handshakes enforced the same
// way — verified separately in phase3-session-notes.md follow-ups).

interface ProxyResponse {
  status: number;
  body: string;
}

export class ProxiedHttpError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.status = status;
  }
}

async function invokeProxy(
  method: string,
  path: string,
  apiKey: string,
  query?: Record<string, string | undefined>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any,
): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  const qs: Record<string, string> = {};
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) qs[k] = v;
    }
  }
  const res = (await invoke("proxy_letta_api", {
    req: {
      method,
      path,
      query: qs,
      apiKey,
      body: body ?? null,
    },
  })) as ProxyResponse;
  if (res.status >= 400) {
    throw new ProxiedHttpError(res.status, res.body);
  }
  return res.body ? JSON.parse(res.body) : null;
}

export class LettaProxyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async listAgents(
    query?: Record<string, string | undefined>,
  ): Promise<unknown[]> {
    const res = await invokeProxy("GET", "/v1/agents/", this.apiKey, query);
    // /v1/agents/ returns a bare array (verified via curl + SDK ArrayPage).
    return Array.isArray(res) ? res : ((res as { items?: unknown[] }).items ?? []);
  }

  async listConversations(
    agentId: string,
    query?: Record<string, string | undefined>,
  ): Promise<unknown[]> {
    // Verified: GET /v1/conversations?agent_id=... -> bare array
    // (agent-scoped subpath /v1/agents/{id}/conversations is 404).
    const res = await invokeProxy(
      "GET",
      "/v1/conversations",
      this.apiKey,
      { agent_id: agentId, ...query },
    );
    if (Array.isArray(res)) return res;
    const r = res as { conversations?: unknown[]; items?: unknown[] };
    return r.conversations ?? r.items ?? [];
  }

  async listMessages(
    conversationId: string,
    query?: Record<string, string | undefined>,
  ): Promise<unknown[]> {
    // Verified: GET /v1/conversations/{id}/messages -> bare array
    // (the {messages:[...]} envelope is the SDK transport, not the API).
    const res = await invokeProxy(
      "GET",
      `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
      this.apiKey,
      query,
    );
    if (Array.isArray(res)) return res;
    const r = res as { messages?: unknown[]; items?: unknown[] };
    return r.messages ?? r.items ?? [];
  }

  async listEnvironments(
    query?: Record<string, string | undefined>,
  ): Promise<unknown[]> {
    const res = await invokeProxy(
      "GET",
      "/v1/environments",
      this.apiKey,
      query,
    );
    const r = res as { connections?: unknown[] } | unknown[];
    return Array.isArray(r) ? r : (r.connections ?? []);
  }
}
