// Adapter registry accessor (avoids circular import App → store internals).
import type { CloudLettaAdapter } from "../letta/cloudAdapter";

export const adapters = new Map<string, CloudLettaAdapter>();
