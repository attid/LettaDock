// Clipboard access: WebKitGTK on Wayland delivers paste events with an EMPTY
// clipboardData (verified 2026-10-14 via debug log: kinds=[] textLen=0), even
// though the system clipboard holds image/png (wl-paste sees it fine).
// Workaround: read the clipboard from the Rust/GTK side on demand.

#[tauri::command]
pub fn read_clipboard_image() -> Result<Option<String>, String> {
    // Try wl-paste first (Wayland session), then xclip (XWayland fallback).
    for cmd in [
        ("wl-paste", vec!["--type", "image/png", "--no-newline"]),
        ("xclip", vec!["-selection", "clipboard", "-t", "image/png", "-o"]),
    ] {
        let output = std::process::Command::new(cmd.0)
            .args(&cmd.1)
            .output();
        if let Ok(out) = output {
            if out.status.success() && !out.stdout.is_empty() {
                use std::io::Write;
                // Write raw bytes to a temp file and base64 it via base64 cmd
                // (avoids pulling a base64 crate for one use).
                let tmp = std::env::temp_dir().join("lettadock-clip.png");
                let mut f = std::fs::File::create(&tmp)
                    .map_err(|e| e.to_string())?;
                f.write_all(&out.stdout).map_err(|e| e.to_string())?;
                drop(f);
                let b64 = std::process::Command::new("base64")
                    .arg("-w0")
                    .arg(&tmp)
                    .output()
                    .map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(&tmp);
                if b64.status.success() {
                    let s = String::from_utf8_lossy(&b64.stdout)
                        .trim()
                        .to_string();
                    if !s.is_empty() {
                        return Ok(Some(s));
                    }
                }
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
