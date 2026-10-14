import { create } from "zustand";
import {
  MOCK_AGENTS,
  MOCK_CONVERSATIONS,
  MOCK_SERVERS,
  type MockAgent,
  type MockConversation,
  type MockServer,
} from "../lib/mockData";

interface AppState {
  servers: MockServer[];
  agents: MockAgent[];
  conversations: MockConversation[];
  selectedServerId: string | null;
  selectedAgentId: string | null;
  selectedConversationId: string | null;
  selectServer: (id: string) => void;
  selectAgent: (id: string) => void;
  selectConversation: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  servers: MOCK_SERVERS,
  agents: MOCK_AGENTS,
  conversations: MOCK_CONVERSATIONS,
  selectedServerId: "srv-local",
  selectedAgentId: "agt-1",
  selectedConversationId: "conv-2",
  selectServer: (id) =>
    set({
      selectedServerId: id,
      selectedAgentId: null,
      selectedConversationId: null,
    }),
  selectAgent: (id) => set({ selectedAgentId: id, selectedConversationId: null }),
  selectConversation: (id) => set({ selectedConversationId: id }),
}));
