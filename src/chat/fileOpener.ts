// Module-level file opener ref (registered by App, called from chat parts).
// Lives in its own module so MyThread.tsx stays fast-refresh-compatible
// (non-component exports from a component file invalidate the whole file
// on HMR and break the preview state).

export interface OpenFilePayload {
  path: string;
  newContent?: string;
  oldContent?: string;
  /** From a [файл: …] chip: sandbox is likely terminated → viewer explains. */
  fromChip?: boolean;
}

export const openFileRef: {
  current: ((ref: OpenFilePayload) => void) | null;
} = { current: null };

export function registerFileOpener(fn: (ref: OpenFilePayload) => void) {
  openFileRef.current = fn;
}
