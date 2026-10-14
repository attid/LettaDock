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

  // Model + context (PWA parity, owner request 2026-10-14)
  modelInfo: import("../letta/modelInfo").ConversationModelInfo | null;
  setModel: (model: string) => Promise<void>;

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
  targetsByConversation: loadTargets(),  historyLoading: false,
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
    try {
      await live.loadHistory(id);
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
      set({ historyLoading: false });
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

  sendMessage: async (text) => {
    const conversationId = get().selectedConversationId;
    if (!conversationId || !live) return;
    await live.send(conversationId, text);
  },

  sendMessageWithImages: async (text, images) => {
    const conversationId = get().selectedConversationId;
    if (!conversationId || !live) return;
    await live.sendWithImages(conversationId, text, images);
  },

  sendMessageWithParts: async (parts) => {
    const conversationId = get().selectedConversationId;
    if (!conversationId || !live) return;
    await live.sendParts(conversationId, parts);
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
