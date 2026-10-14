// Frontend bridge to Tauri commands: local letta key + debug log file.
// Keys stay in memory; log lines go to /tmp/lettadock-ui.log (truncated at 1MB).

export async function readLocalLettaKey(): Promise<string | undefined> {
  const { invoke } = await import("@tauri-apps/api/core");
  const key = await invoke<string | null>("read_local_letta_key");
  return key ? key.replace(/\s+/g, "") : undefined;
}

export async function appendDebugLog(line: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("append_debug_log", { line });
}
