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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_local_letta_key])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
