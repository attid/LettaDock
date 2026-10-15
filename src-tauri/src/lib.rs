// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

/// Read LETTA_API_KEY from the local letta-code settings (~/.letta/settings.json).
/// Dev-phase convenience: same credential the user's letta CLI already uses.
/// Key never leaves the machine — returned to the webview in memory only.
/// TODO(Phase 5): replace with OS keychain storage.
#[tauri::command]
fn read_local_letta_key() -> Result<Option<String>, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&home)
        .join(".letta")
        .join("settings.json");
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("no local letta settings: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let key = value
        .get("env")
        .and_then(|env| env.get("LETTA_API_KEY"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Ok(key)
}

/// Append a debug line to /tmp/lettadock-ui.log (capped at ~1MB).
/// Phase-3 debugging aid: lets the agent read UI-side errors itself.
/// Debug builds only (agy P2: /tmp log file in release is a leak surface —
/// the frontend L() helper falls back to console-only).
#[cfg(debug_assertions)]
#[tauri::command]
fn append_debug_log(line: String) -> Result<(), String> {
    use std::io::Write;
    let path = std::path::Path::new("/tmp/lettadock-ui.log");
    // Rotate when over 1MB.
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > 1_000_000 {
            let _ = std::fs::rename(path, std::path::Path::new("/tmp/lettadock-ui.log.1"));
        }
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())
}

pub mod clipboard;
pub mod proxy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Debug builds register the /tmp debug-log command too (agy P2: no
    // release-side /tmp log file).
    #[cfg(debug_assertions)]
    let builder = tauri::Builder::default().invoke_handler(tauri::generate_handler![
        read_local_letta_key,
        append_debug_log,
        proxy::proxy_letta_api,
        proxy::proxy_upload_file,
        proxy::proxy_download_sandbox_file,
        proxy::list_project_dirs,
        clipboard::read_clipboard_image,
        clipboard::read_clipboard_text
    ]);
    #[cfg(not(debug_assertions))]
    let builder = tauri::Builder::default().invoke_handler(tauri::generate_handler![
        read_local_letta_key,
        proxy::proxy_letta_api,
        proxy::proxy_upload_file,
        proxy::proxy_download_sandbox_file,
        proxy::list_project_dirs,
        clipboard::read_clipboard_image,
        clipboard::read_clipboard_text
    ]);
    builder
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
