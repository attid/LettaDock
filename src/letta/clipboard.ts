// Clipboard bridge: WebKitGTK/Wayland gives empty clipboardData on paste,
// so images are read from the system clipboard via Tauri commands.

export async function readClipboardImage(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const b64 = await invoke<string | null>("read_clipboard_image");
  return b64 && b64.length > 0 ? b64 : null;
}
