// Clipboard access: WebKitGTK on Wayland delivers paste events with an EMPTY
// clipboardData (verified 2026-10-14 via debug log: kinds=[] textLen=0), even
// though the system clipboard holds image/png (wl-paste sees it fine).
// Workaround: read the clipboard from the Rust/GTK side on demand.
// Encoding happens in memory (base64 crate) — no temp files, no subprocess.

use base64::Engine;

#[tauri::command]
pub fn read_clipboard_image() -> Result<Option<String>, String> {
    // Try wl-paste first (Wayland session), then xclip (XWayland fallback).
    for cmd in [
        ("wl-paste", vec!["--type", "image/png", "--no-newline"]),
        ("xclip", vec!["-selection", "clipboard", "-t", "image/png", "-o"]),
    ] {
        let output = std::process::Command::new(cmd.0).args(&cmd.1).output();
        if let Ok(out) = output {
            if out.status.success() && !out.stdout.is_empty() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&out.stdout);
                return Ok(Some(b64));
            }
        }
    }
    Ok(None)
}

/// Plain text clipboard (for future paste-as-text fallback).
#[tauri::command]
pub fn read_clipboard_text() -> Result<Option<String>, String> {
    for cmd in [
        ("wl-paste", vec!["--no-newline"]),
        ("xclip", vec!["-selection", "clipboard", "-o"]),
    ] {
        if let Ok(out) = std::process::Command::new(cmd.0).args(&cmd.1).output() {
            if out.status.success() && !out.stdout.is_empty() {
                return Ok(Some(String::from_utf8_lossy(&out.stdout).to_string()));
            }
        }
    }
    Ok(None)
}
