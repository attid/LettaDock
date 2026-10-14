// Frontend bridge to the Tauri command that reads the local letta key.
// The key stays in memory; see appStore.resolveKey() for the order.
export async function readLocalLettaKey(): Promise<string | undefined> {
  const { invoke } = await import("@tauri-apps/api/core");
  const key = await invoke<string | null>("read_local_letta_key");
  return key ? key.replace(/\s+/g, "") : undefined;
}
