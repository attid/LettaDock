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
  abortTurn: () => Promise<void>;
  refreshConversation: () => Promise<void>;
}

// In-memory session keys, NOT persisted.
const sessionKeys = new Map<string, string>();
const adapters = new Map<string, CloudLettaAdapter>();
// One live manager for the currently open conversation.
let live: LiveSessionManager | null = null;
let liveConversationId: string | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  profiles: loadProfiles(),
  agentsByProfile: {},
  conversationsByAgent: {},
  liveMessages: [],
  historyLoading: false,
  turnState: { phase: "idle", streamText: "", toolCalls: {} },
  connectionStatus: {},
  selectedProfileId: loadSelection().profileId,
  selectedAgentId: loadSelection().agentId,
  selectedConversationId: loadSelection().conversationId,

  addProfile: (name, kind, apiKey, computerName) => {
    const id = `profile-${Date.now()}`;
    const profile: ServerProfile = { id, name, kind, computerName };
    const profiles = [...get().profiles, profile];
    sessionKeys.set(id, apiKey);
    saveProfiles(profiles);
    set({ profiles });
    // Auto-connect immediately so the user sees connect status right away.
    void get().connect(id);
  },

  removeProfile: (id) => {
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
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const apiKey = sessionKeys.get(profileId);
    if (!apiKey) {
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "error",
            error: "Ключ сессии потерян (перезапуск) — добавь профиль заново",
          },
        },
      }));
      return;
    }
    set((s) => ({
      connectionStatus: {
        ...s.connectionStatus,
        [profileId]: { state: "connecting" },
      },
    }));
    try {
      const adapter = new CloudLettaAdapter(profile, apiKey);
      // Discover online computer once, use it for sessions.
      const computer = await adapter.findOnlineComputer();
      if (computer && !profile.computerName) {
        const updated = {
          ...profile,
          computerName: computer,
        };
        saveProfiles(get().profiles.map((p) => (p.id === profileId ? updated : p)));
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === profileId ? updated : p)),
        }));
      }
      const agents = await adapter.listAgents();
      adapters.set(profileId, adapter);
      set((s) => ({
        agentsByProfile: { ...s.agentsByProfile, [profileId]: agents },
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "connected",
            error: computer ? undefined : "Нет онлайн-computer — сессии не открыть",
          },
        },
      }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // SDK errors carry .status for HTTP failures; add a hint for 401.
      const hint =
        (err as { status?: number }).status === 401
          ? " (401: ключ не принят — проверь, что скопирован целиком, без пробелов и переносов)"
          : "";
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "error",
            error: (err.message || String(e)).slice(0, 300) + hint,
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
    set({ selectedConversationId: id, liveMessages: [], historyLoading: true });
    saveSelection({
      profileId: get().selectedProfileId,
      agentId: get().selectedAgentId,
      conversationId: id,
    });
    void get().openConversation(id);
  },

  openConversation: async (id: string) => {
    const profileId = get().selectedProfileId;
    const adapter = profileId ? adapters.get(profileId) : undefined;
    if (!adapter) {
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
    } finally {
      set({ historyLoading: false });
    }
  },

  sendMessage: async (text) => {
    const conversationId = get().selectedConversationId;
    if (!conversationId || !live) return;
    await live.send(conversationId, text);
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
}));
