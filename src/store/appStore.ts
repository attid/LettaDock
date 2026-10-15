import { create } from "zustand";
import type {
  AgentSummary,
  ConnectionStatus,
  ConversationSummary,
  LettaMessage,
  ServerProfile,
} from "../letta/types";
import { CloudLettaAdapter } from "../letta/cloudAdapter";
import { LiveSessionManager, type TurnState } from "../letta/liveSession";

// Profile persistence: localStorage for non-secret profile metadata only.
// API keys are NEVER persisted here (spec: no plaintext secrets); in the dev
// shell the key lives in memory for the session, entered via the connect dialog.
const PROFILES_KEY = "lettadock.profiles.v1";
const LAST_SELECTION_KEY = "lettadock.selection.v1";

interface StoredSelection {
  profileId: string | null;
  agentId: string | null;
  conversationId: string | null;
}

function loadProfiles(): ServerProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ServerProfile[];
  } catch {
    return [];
  }
}

function saveProfiles(profiles: ServerProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function saveSelection(sel: StoredSelection) {
  localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(sel));
}

function loadSelection(): StoredSelection {
  try {
    const raw = localStorage.getItem(LAST_SELECTION_KEY);
    if (raw) return JSON.parse(raw) as StoredSelection;
  } catch {
    /* ignore */
  }
  return { profileId: null, agentId: null, conversationId: null };
}

interface AppState {
  // Profiles
  profiles: ServerProfile[];
  addProfile: (name: string, kind: "cloud", apiKey: string, computerName?: string) => void;
  removeProfile: (id: string) => void;

  // Connection
  connectionStatus: Record<string, ConnectionStatus>;
  connect: (profileId: string) => Promise<void>;
  disconnect: (profileId: string) => Promise<void>;

  // Data
  agentsByProfile: Record<string, AgentSummary[]>;
  conversationsByAgent: Record<string, ConversationSummary[]>;
  /** Live view messages (history + optimistic + streaming), per conversation. */
  liveMessages: LettaMessage[];
  historyLoading: boolean;
  turnState: TurnState;

  // TARGET-1: execution target per conversation (cloud | computer)
  targetsByConversation: Record<string, ConversationTarget>;
  setConversationTarget: (
    conversationId: string,
    target: ConversationTarget,
  ) => void;

  // UX-5: create a new conversation for the selected agent and open it.
  createConversation: (name?: string) => Promise<void>;

  // CWD-1: per-conversation working directory (real path on the computer).
  cwdByConversation: Record<string, string>;
  setConversationCwd: (conversationId: string, cwd: string) => void;

  // PERM-1: per-conversation permission mode (PWA parity).
  permByConversation: Record<string, "standard" | "acceptEdits" | "unrestricted" | "strict">;
  setConversationPerm: (
    conversationId: string,
    mode: "standard" | "acceptEdits" | "unrestricted" | "strict" | undefined,
  ) => void;

  // UX-3: fork a conversation (whole or from a specific message).
  forkConversation: (conversationId: string, messageId?: string) => Promise<void>;

  // Re-create the live manager when dropped (target/cwd/perm switches).
  ensureLive: () => Promise<LiveSessionManager | null>;

  // UX-8: rename a conversation (server-side name, PATCH).
  renameConversation: (conversationId: string, name: string) => Promise<void>;

  // Model + context (PWA parity, owner request 2026-10-14)
  modelInfo: import("../letta/modelInfo").ConversationModelInfo | null;
  setModel: (model: string) => Promise<void>;

  // ATTACH-2: attach a non-image file to the current conversation.
  // Uploads to the conversation sandbox and returns the path for the
  // composer to insert as text (agent reads files from its filesystem).
  attachFile: (
    conversationId: string,
    file: File,
  ) => Promise<{ path: string; name: string }>;
  /** Session API key of the active profile (for upload commands). */
  getProfileKey: () => string | null;
  /** Agent id of the selected agent (sandbox is agent-scoped). */
  getSelectedAgentId: () => string | null;

  // Selection
  selectedProfileId: string | null;
  selectedAgentId: string | null;
  selectedConversationId: string | null;
  selectProfile: (id: string) => void;
  selectAgent: (id: string) => void;
  selectConversation: (id: string) => void;
  openConversation: (id: string) => Promise<void>;

  // Phase 3 actions
  sendMessage: (text: string) => Promise<void>;
  sendMessageWithImages: (text: string, images: string[]) => Promise<void>;
  sendMessageWithParts: (
    parts: Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: { type: "base64"; media_type: string; data: string };
        }
    >,
  ) => Promise<void>;
  abortTurn: () => Promise<void>;
  refreshConversation: () => Promise<void>;
}

// Per-conversation execution target (session-scoped, SDK-verified:
// resumeSession(computer) overrides client default for that session only).
// Persisted per conversation id.
const TARGETS_KEY = "lettadock.targets.v1";

type ConversationTarget = "cloud" | { deviceId: string; name: string };

function loadTargets(): Record<string, ConversationTarget> {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function saveTargets(targets: Record<string, ConversationTarget>) {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
}

// CWD-1: per-conversation working directory (real path). Persisted like targets.
const CWDS_KEY = "lettadock.cwds.v1";

function loadCwds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CWDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function saveCwds(cwds: Record<string, string>) {
  localStorage.setItem(CWDS_KEY, JSON.stringify(cwds));
}

// PERM-1: per-conversation permission mode. Persisted like cwds.
const PERMS_KEY = "lettadock.perms.v1";
type PermMode = "standard" | "acceptEdits" | "unrestricted" | "strict";

function loadPerms(): Record<string, PermMode> {
  try {
    const raw = localStorage.getItem(PERMS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function savePerms(perms: Record<string, PermMode>) {
  localStorage.setItem(PERMS_KEY, JSON.stringify(perms));
}

// In-memory session keys, NOT persisted. BUT: to avoid re-entering the key
// after every restart in the dev phase, the app resolves the key in this order:
//   1. a key entered this session (sessionKeys map)
//   2. the local letta-code settings.json env LETTA_API_KEY (same file the
//      user's letta CLI uses; read via Tauri fs scope in Phase 5, direct
//      fetch through the dev server proxy is not available in webview, so we
//      read it through a tiny Tauri command in src-tauri)
// Secure storage migration is still Phase 5 (spec).
const sessionKeys = new Map<string, string>();
import { adapters as adaptersRegistry } from "./adapters";
const adapters = adaptersRegistry;
// One live manager for the currently open conversation.
let live: LiveSessionManager | null = null;
let liveConversationId: string | null = null;

// Debug logging: every significant step goes to console AND to
// /tmp/lettadock-ui.log (via Tauri command) so the agent can read it
// without asking the user what's on screen.
function L(msg: string) {
  const line = `[ui ${new Date().toISOString().slice(11, 23)}] ${msg}`;
  console.log(line);
  void import("../letta/localKey").then(({ appendDebugLog }) =>
    appendDebugLog(line).catch(() => {}),
  );
}

async function resolveKey(profileId: string): Promise<string | undefined> {
  L(`resolveKey: profile=${profileId} sessionKey=${sessionKeys.has(profileId)}`);
  const local = sessionKeys.get(profileId);
  if (local) {
    // "__system__" marker (KEY-1): don't cache — always re-resolve fresh.
    if (local === "__system__") {
      try {
        const { readLocalLettaKey } = await import("../letta/localKey");
        const key = await readLocalLettaKey();
        if (key) return key;
      } catch {
        /* fall through */
      }
      return undefined;
    }
    L("resolveKey: using session key");
    return local;
  }
  try {
    L("resolveKey: invoking read_local_letta_key…");
    const { readLocalLettaKey } = await import("../letta/localKey");
    const key = await readLocalLettaKey();
    L(`resolveKey: tauri returned ${key ? `key len=${key.length}` : "null/undefined"}`);
    if (key) {
      sessionKeys.set(profileId, key);
      return key;
    }
  } catch (e) {
    L(`resolveKey: tauri invoke FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
  return undefined;
}

export const useAppStore = create<AppState>((set, get) => ({
  profiles: loadProfiles(),
  agentsByProfile: {},
  conversationsByAgent: {},
  liveMessages: [],
  modelInfo: null,
  targetsByConversation: loadTargets(),
  cwdByConversation: loadCwds(),
  permByConversation: loadPerms(),
  historyLoading: false,
  turnState: { phase: "idle", streamText: "", toolCalls: {} },
  connectionStatus: {},
  selectedProfileId: loadSelection().profileId,
  selectedAgentId: loadSelection().agentId,
  selectedConversationId: loadSelection().conversationId,

  addProfile: (name, kind, apiKey, computerName) => {
    const id = `profile-${Date.now()}`;
    L(`addProfile: name=${name} keyLen=${apiKey.length}`);
    const profile: ServerProfile = { id, name, kind, computerName };
    const profiles = [...get().profiles, profile];
    sessionKeys.set(id, apiKey);
    saveProfiles(profiles);
    set({ profiles });
    // Auto-connect immediately so the user sees connect status right away.
    void get().connect(id);
  },

  removeProfile: (id) => {
    L(`removeProfile: ${id}`);
    const profiles = get().profiles.filter((p) => p.id !== id);
    sessionKeys.delete(id);
    saveProfiles(profiles);
    const status = { ...get().connectionStatus };
    delete status[id];
    set({
      profiles,
      connectionStatus: status,
      selectedProfileId:
        get().selectedProfileId === id ? null : get().selectedProfileId,
    });
  },

  connect: async (profileId) => {
    L(`connect: start profile=${profileId}`);
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) {
      L(`connect: profile ${profileId} NOT FOUND in store`);
      return;
    }
    const apiKey = await resolveKey(profileId);
    if (!apiKey) {
      L("connect: no key resolved → error state");
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "error",
            error:
              "Ключ не найден: вставь его через «+» (или пусть в ~/.letta/settings.json будет env.LETTA_API_KEY)",
          },
        },
      }));
      return;
    }
    L(`connect: key resolved (len=${apiKey.length}), setting connecting…`);
    set((s) => ({
      connectionStatus: {
        ...s.connectionStatus,
        [profileId]: { state: "connecting" },
      },
    }));
    try {
      const adapter = new CloudLettaAdapter(profile, apiKey);
      L("connect: adapter created, discovering computers…");
      // Discover online computer once, use it for sessions.
      const computer = await adapter.findOnlineComputer();
      L(`connect: online computer = ${computer ?? "NONE"}`);
      if (computer && profile.computerName !== computer) {
        // Always refresh: old profiles may hold a stale deviceId instead of
        // the human name, and the online computer can legitimately change.
        const updated = {
          ...profile,
          computerName: computer,
        };
        saveProfiles(get().profiles.map((p) => (p.id === profileId ? updated : p)));
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === profileId ? updated : p)),
        }));
      }
      L("connect: listing agents…");
      const agents = await adapter.listAgents();
      L(`connect: agents listed = ${agents.length}`);
      adapters.set(profileId, adapter);
      set((s) => ({
        agentsByProfile: { ...s.agentsByProfile, [profileId]: agents },
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "connected",
            // Not fatal: browsing works; only sessions need a computer.
            error: computer
              ? undefined
              : "Нет онлайн-computer — просмотр работает, сессии (отправка) нет",
          },
        },
      }));
      L(`connect: SUCCESS (connected, computer=${computer ?? "none"})`);
      // Round-5/6 agy P1: restore the saved agent/conversation. Note:
      // selectAgent() wipes savedConversationId from localStorage, so read
      // BOTH ids BEFORE touching selection state, load conversations
      // explicitly, then open the conversation (which re-saves selection).
      const saved = loadSelection();
      const restoredAgentId = saved.profileId === profileId ? saved.agentId : null;
      const restoredConversationId = saved.conversationId;
      if (restoredAgentId && agents.some((a) => a.id === restoredAgentId)) {
        const adapter2 = adapters.get(profileId);
        if (!adapter2) return;
        // Load conversations WITHOUT clearing saved selection.
        const conversations = await adapter2.listConversations(restoredAgentId);
        set((s) => ({
          conversationsByAgent: {
            ...s.conversationsByAgent,
            [restoredAgentId]: conversations,
          },
        }));
        if (
          restoredConversationId &&
          conversations.some((c) => c.id === restoredConversationId)
        ) {
          set({
            selectedAgentId: restoredAgentId,
            selectedConversationId: restoredConversationId,
          });
          await get().openConversation(restoredConversationId);
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      L(`connect: FAILED: ${err.message || String(e)} | stack: ${err.stack?.slice(0, 300)}`);
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "error",
            error: (err.message || String(e)).slice(0, 300),
          },
        },
      }));
    }
  },

  disconnect: async (profileId) => {
    const adapter = adapters.get(profileId);
    if (adapter) {
      await adapter.close();
      adapters.delete(profileId);
    }
    if (live) {
      await live.dispose();
      live = null;
      liveConversationId = null;
    }
    set((s) => ({
      connectionStatus: {
        ...s.connectionStatus,
        [profileId]: { state: "disconnected" },
      },
      agentsByProfile: { ...s.agentsByProfile, [profileId]: [] },
      liveMessages: [],
    }));
  },

  selectProfile: (id) => {
    set({
      selectedProfileId: id,
      selectedAgentId: null,
      selectedConversationId: null,
      liveMessages: [],
    });
    saveSelection({ profileId: id, agentId: null, conversationId: null });
    void get().connect(id);
  },

  selectAgent: (id) => {
    set({ selectedAgentId: id, selectedConversationId: null, liveMessages: [] });
    const profileId = get().selectedProfileId;
    saveSelection({
      profileId,
      agentId: id,
      conversationId: null,
    });
    if (!profileId) return;
    const adapter = adapters.get(profileId);
    if (!adapter) return;
    void adapter.listConversations(id).then((conversations) => {
      set((s) => ({
        conversationsByAgent: { ...s.conversationsByAgent, [id]: conversations },
      }));
    });
  },

  selectConversation: (id) => {
    L(`selectConversation: ${id}`);
    set({ selectedConversationId: id, liveMessages: [], historyLoading: true });
    saveSelection({
      profileId: get().selectedProfileId,
      agentId: get().selectedAgentId,
      conversationId: id,
    });
    void get().openConversation(id);
  },

  openConversation: async (id: string) => {
    L(`openConversation: ${id}`);
    const profileId = get().selectedProfileId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!adapter) {
      L(`openConversation: NO ADAPTER for profile=${profileId}`);
      set({ historyLoading: false });
      return;
    }
    if (live && liveConversationId !== id) {
      await live.dispose();
      live = null;
      liveConversationId = null;
    }
    if (!live) {
      live = new LiveSessionManager(adapter, {
        onMessages: (messages) => set({ liveMessages: messages }),
        onTurnState: (turnState) => set({ turnState }),
      });
      liveConversationId = id;
    }
    // TARGET-1: pass the conversation's execution target to the session
    // ("cloud" overrides the computer; undefined keeps profile default).
    const convTarget = get().targetsByConversation[id];
    live.setTarget(convTarget);
    // CWD-1: per-conversation working directory (session-scoped via SDK).
    const convCwd = get().cwdByConversation[id];
    live.setCwd(convCwd);
    // PERM-1: per-conversation permission mode (session-scoped via SDK).
    const convPerm = get().permByConversation[id];
    live.setPerm(convPerm);
    try {
      await live.loadHistory(id);
      // P1 race guard: user may have clicked another conversation while we
      // were loading — don't overwrite the newer view with older data.
      if (get().selectedConversationId !== id) {
        L(`openConversation: stale load for ${id}, current is ${get().selectedConversationId}`);
        return;
      }
      // Model + context usage (PWA parity). Non-fatal on failure.
      try {
        const conv = await adapter.retrieveConversationRaw(id);
        const messages = get().liveMessages;
        const { extractModelInfo } = await import("../letta/modelInfo");
        set({ modelInfo: extractModelInfo(conv, messages) });
      } catch (e) {
        L(`model info load failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      if (get().selectedConversationId === id) {
        set({ historyLoading: false });
      }
    }
  },

  setConversationCwd: (conversationId, cwd) => {
    const cwds = loadCwds();
    cwds[conversationId] = cwd;
    saveCwds(cwds);
    set({ cwdByConversation: { ...cwds } });
    // Drop the live session — next send reopens with the new cwd.
    if (live && liveConversationId === conversationId) {
      void live.dispose();
      live = null;
      liveConversationId = null;
    }
    L(`setConversationCwd: ${conversationId} → ${cwd}`);
  },

  setConversationPerm: (conversationId, mode) => {
    const perms = loadPerms();
    if (mode === undefined) {
      delete perms[conversationId];
    } else {
      perms[conversationId] = mode;
    }
    savePerms(perms);
    set({ permByConversation: { ...perms } });
    // Drop the live session — next send reopens with the new mode.
    if (live && liveConversationId === conversationId) {
      void live.dispose();
      live = null;
      liveConversationId = null;
    }
    L(`setConversationPerm: ${conversationId} → ${mode ?? "default"}`);
  },

  renameConversation: async (conversationId, name) => {
    const profileId = get().selectedProfileId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!adapter) {
      L("renameConversation: no adapter");
      return;
    }
    try {
      await adapter.renameConversation(conversationId, name);
      // Update the local list: set name (server wins over summary-derived).
      const agentId = get().selectedAgentId;
      if (agentId) {
        const conversations = get().conversationsByAgent[agentId] ?? [];
        set((s) => ({
          conversationsByAgent: {
            ...s.conversationsByAgent,
            [agentId]: conversations.map((c) =>
              c.id === conversationId ? { ...c, name } : c,
            ),
          },
        }));
      }
      L(`renameConversation: OK ${conversationId} → ${name}`);
    } catch (e) {
      L(`renameConversation FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  forkConversation: async (conversationId, messageId) => {
    const profileId = get().selectedProfileId;
    const agentId = get().selectedAgentId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!adapter || !agentId) {
      L("forkConversation: no adapter/agent");
      return;
    }
    try {
      const created = await adapter.forkConversation(
        conversationId,
        agentId,
        messageId,
      );
      const conversations = await adapter.listConversations(agentId);
      set((s) => ({
        conversationsByAgent: {
          ...s.conversationsByAgent,
          [agentId]: conversations,
        },
      }));
      get().selectConversation(created.id);
      L(`forkConversation: opened ${created.id}`);
    } catch (e) {
      L(`forkConversation FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  createConversation: async (name) => {
    const profileId = get().selectedProfileId;
    const agentId = get().selectedAgentId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!adapter || !agentId) {
      L("createConversation: no adapter/agent");
      return;
    }
    try {
      const created = await adapter.createConversation(agentId, name);
      // Refresh the list, then open the new conversation.
      const conversations = await adapter.listConversations(agentId);
      set((s) => ({
        conversationsByAgent: {
          ...s.conversationsByAgent,
          [agentId]: conversations,
        },
      }));
      get().selectConversation(created.id);
      L(`createConversation: opened ${created.id}`);
    } catch (e) {
      L(`createConversation FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  setModel: async (model) => {
    const conversationId = get().selectedConversationId;
    const profileId = get().selectedProfileId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!conversationId || !adapter) return;
    L(`setModel: ${model} on ${conversationId}`);
    await adapter.updateSessionModel(conversationId, model);
    // Refresh info after change.
    const conv = await adapter.retrieveConversationRaw(conversationId);
    const messages = get().liveMessages;
    const { extractModelInfo } = await import("../letta/modelInfo");
    set({ modelInfo: extractModelInfo(conv, messages) });
  },

  attachFile: async (conversationId, file) => {
    const profileId = get().selectedProfileId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    const agentId = get().selectedAgentId;
    if (!adapter || !agentId) {
      throw new Error("Нет подключения или агента");
    }
    L(`attachFile: ${file.name} (${file.size}b) → sandbox`);
    const { sandboxId } = await adapter.createSandbox(agentId, conversationId);
    const { uploadFileMultipart } = await import("../letta/upload");
    const apiKey = (await resolveKey(profileId ?? "")) ?? "";
    try {
      const uploaded = await uploadFileMultipart(apiKey, sandboxId, file);
      L(`attachFile: uploaded → ${uploaded.path}`);
      // Round-2 agy P2: keep the sandbox alive briefly so the file viewer
      // (chip click) can fetch content; auto-terminate after a grace period.
      setTimeout(() => {
        void adapter.terminateSandbox(sandboxId).catch(() => {});
      }, 10 * 60 * 1000); // 10 min
      return uploaded;
    } catch (e) {
      void adapter.terminateSandbox(sandboxId).catch(() => {});
      throw e;
    }
  },

  getProfileKey: () => {
    const profileId = get().selectedProfileId;
    return profileId ? (sessionKeys.get(profileId) ?? null) : null;
  },

  getSelectedAgentId: () => get().selectedAgentId,

  // Re-create the live manager for the current conversation if it was
  // dropped (target/cwd/perm switch disposes it on purpose). Returns the
  // ready manager or null (no adapter).
  async ensureLive(): Promise<LiveSessionManager | null> {
    const conversationId = get().selectedConversationId;
    const profileId = get().selectedProfileId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!conversationId || !adapter) return null;
    if (live && liveConversationId === conversationId) return live;
    if (live) {
      await live.dispose();
      live = null;
      liveConversationId = null;
    }
    live = new LiveSessionManager(adapter, {
      onMessages: (messages) => set({ liveMessages: messages }),
      onTurnState: (turnState) => set({ turnState }),
    });
    liveConversationId = conversationId;
    // Re-apply per-conversation overrides (target/cwd/perm).
    live.setTarget(get().targetsByConversation[conversationId]);
    live.setCwd(get().cwdByConversation[conversationId]);
    live.setPerm(get().permByConversation[conversationId]);
    return live;
  },

  sendMessage: async (text) => {
    const conversationId = get().selectedConversationId;
    const liveManager = await get().ensureLive();
    if (!conversationId || !liveManager) return;
    await liveManager.send(conversationId, text);
  },

  sendMessageWithImages: async (text, images) => {
    const conversationId = get().selectedConversationId;
    const liveManager = await get().ensureLive();
    if (!conversationId || !liveManager) return;
    await liveManager.sendWithImages(conversationId, text, images);
  },

  sendMessageWithParts: async (parts) => {
    const conversationId = get().selectedConversationId;
    const liveManager = await get().ensureLive();
    if (!conversationId || !liveManager) return;
    await liveManager.sendParts(conversationId, parts);
  },

  abortTurn: async () => {
    if (!live) return;
    await live.abort();
  },

  refreshConversation: async () => {
    const conversationId = get().selectedConversationId;
    if (!conversationId || !live) return;
    await live.loadHistory(conversationId);
  },

  // TARGET-1: set where THIS conversation's tools run. Takes effect on the
  // next session open (current live session keeps running).
  setConversationTarget: (conversationId, target) => {
    const targets = loadTargets();
    targets[conversationId] = target;
    saveTargets(targets);
    // Drop the live session so the next send reopens with the new target.
    if (live && liveConversationId === conversationId) {
      void live.dispose();
      live = null;
      liveConversationId = null;
    }
    set({ targetsByConversation: { ...targets } });
    L(`setConversationTarget: ${conversationId} → ${target === "cloud" ? "cloud" : target.name}`);
  },
}));
