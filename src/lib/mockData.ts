// MOCK DATA — Phase 1 only. No real Letta server connectivity yet (Phase 2).
export interface MockServer {
  id: string;
  name: string;
  kind: "local" | "cloud";
  status: "connected" | "disconnected";
}

export interface MockAgent {
  id: string;
  serverId: string;
  name: string;
}

export interface MockConversation {
  id: string;
  agentId: string;
  title: string;
  lastActivity: string;
}

export const MOCK_SERVERS: MockServer[] = [
  { id: "srv-local", name: "Local Letta", kind: "local", status: "connected" },
  { id: "srv-cloud", name: "Letta Cloud", kind: "cloud", status: "disconnected" },
];

export const MOCK_AGENTS: MockAgent[] = [
  { id: "agt-1", serverId: "srv-local", name: "kuzya" },
  { id: "agt-2", serverId: "srv-local", name: "worker-bot" },
  { id: "agt-3", serverId: "srv-local", name: "researcher" },
  { id: "agt-4", serverId: "srv-cloud", name: "cloud-agent" },
];

export const MOCK_CONVERSATIONS: MockConversation[] = [
  { id: "conv-1", agentId: "agt-1", title: "Onboarding & memory setup", lastActivity: "now" },
  { id: "conv-2", agentId: "agt-1", title: "LettaDock phase 1", lastActivity: "12m" },
  { id: "conv-3", agentId: "agt-2", title: "Fix FSM guard in mmwb", lastActivity: "2h" },
  { id: "conv-4", agentId: "agt-3", title: "Research Tauri 2 Wayland scaling", lastActivity: "1d" },
  { id: "conv-5", agentId: "agt-4", title: "Cloud test thread", lastActivity: "3d" },
];
