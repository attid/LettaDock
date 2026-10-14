// Shared pending-image queue: the composer (Ctrl+V inserts [N] markers)
// and the runtime (send splits text on markers) meet here.
import { create } from "zustand";
import type { PreparedImage } from "../chat/images";

interface PendingImagesState {
  pending: PreparedImage[];
  add: (img: PreparedImage) => void;
  remove: (index: number) => void;
  clear: () => void;
}

export const usePendingImages = create<PendingImagesState>((set) => ({
  pending: [],
  add: (img) => set((s) => ({ pending: [...s.pending, img] })),
  remove: (index) =>
    set((s) => ({ pending: s.pending.filter((_, i) => i !== index) })),
  clear: () => set({ pending: [] }),
}));
