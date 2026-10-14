import { create } from "zustand";
import type {
  AgentSummary,
  ConnectionStatus,
  ConversationSummary,
  LettaMessage,
  ServerProfile,
} from "../letta/types";
import { CloudLettaAdapter } from "../letta/cloudAdapter";

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
  addProfile: (name: string, kind: "cloud", apiKey: string) => void;
  removeProfile: (id: string) => void;

  // Connection (one adapter at a time in the UI)
  connectionStatus: Record<string, ConnectionStatus>;
  connect: (profileId: string) => Promise<void>;
  disconnect: (profileId: string) => Promise<void>;

  // Data (keyed by profileId)
  agentsByProfile: Record<string, AgentSummary[]>;
  conversationsByAgent: Record<string, ConversationSummary[]>;
  historyByConversation: Record<string, LettaMessage[]>;
  historyLoading: boolean;

  // Selection
  selectedProfileId: string | null;
  selectedAgentId: string | null;
  selectedConversationId: string | null;
  selectProfile: (id: string) => void;
  selectAgent: (id: string) => void;
  selectConversation: (id: string) => void;

  loadHistory: (conversationId: string) => Promise<void>;
}

// In-memory session keys, NOT persisted. Map profileId -> apiKey.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sessionKeys = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapters = new Map<string, CloudLettaAdapter>();

export const useAppStore = create<AppState>((set, get) => ({
  profiles: loadProfiles(),
  agentsByProfile: {},
  conversationsByAgent: {},
  historyByConversation: {},
  historyLoading: false,
  connectionStatus: {},
  selectedProfileId: loadSelection().profileId,
  selectedAgentId: loadSelection().agentId,
  selectedConversationId: loadSelection().conversationId,

  addProfile: (name, kind, apiKey) => {
    const id = `profile-${Date.now()}`;
    const profile: ServerProfile = { id, name, kind };
    const profiles = [...get().profiles, profile];
    sessionKeys.set(id, apiKey);
    saveProfiles(profiles);
    set({ profiles });
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
            error: "Нет ключа сессии — добавь профиль заново",
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
      const agents = await adapter.listAgents();
      adapters.set(profileId, adapter);
      set((s) => ({
        agentsByProfile: { ...s.agentsByProfile, [profileId]: agents },
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: { state: "connected" },
        },
      }));
    } catch (e) {
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [profileId]: {
            state: "error",
            error: e instanceof Error ? e.message : String(e),
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
    set((s) => ({
      connectionStatus: {
        ...s.connectionStatus,
        [profileId]: { state: "disconnected" },
      },
      agentsByProfile: { ...s.agentsByProfile, [profileId]: [] },
    }));
  },

  selectProfile: (id) => {
    set({
      selectedProfileId: id,
      selectedAgentId: null,
      selectedConversationId: null,
    });
    localStorage.setItem(
      LAST_SELECTION_KEY,
      JSON.stringify({
        profileId: id,
        agentId: null,
        conversationId: null,
      } satisfies StoredSelection),
    );
    void get().connect(id);
  },

  selectAgent: (id) => {
    set({ selectedAgentId: id, selectedConversationId: null });
    const profileId = get().selectedProfileId;
    localStorage.setItem(
      LAST_SELECTION_KEY,
      JSON.stringify({
        profileId,
        agentId: id,
        conversationId: null,
      } satisfies StoredSelection),
    );
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
    set({ selectedConversationId: id });
    localStorage.setItem(
      LAST_SELECTION_KEY,
      JSON.stringify({
        profileId: get().selectedProfileId,
        agentId: get().selectedAgentId,
        conversationId: id,
      } satisfies StoredSelection),
    );
    void get().loadHistory(id);
  },

  loadHistory: async (conversationId) => {
    const profileId = get().selectedProfileId;
    if (!profileId) return;
    const adapter = adapters.get(profileId);
    if (!adapter) return;
    set({ historyLoading: true });
    try {
      const history = await adapter.getHistory(conversationId, 50);
      set((s) => ({
        historyByConversation: {
          ...s.historyByConversation,
          [conversationId]: history,
        },
        historyLoading: false,
      }));
    } catch {
      set({ historyLoading: false });
    }
  },
}));
