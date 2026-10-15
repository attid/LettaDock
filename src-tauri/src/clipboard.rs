// Clipboard access: WebKitGTK on Wayland delivers paste events with an EMPTY
// clipboardData (verified 2026-10-14 via debug log: kinds=[] textLen=0), even
// though the system clipboard holds image/png (wl-paste sees it fine).
// Workaround: read the clipboard from the Rust/GTK side on demand.
// Encoding happens in memory (base64 crate) — no temp files, no subprocess.
//
// ALL commands are async + spawn_blocking with a hard timeout:
// a sync blocking subprocess call here freezes the whole UI (paste-freeze
// incident 2026-10-15: wl-paste waited on a clipboard manager forever).

use base64::Engine;
use std::time::Duration;

fn run_with_timeout(
    mut cmd: std::process::Command,
    secs: u64,
) -> Option<std::process::Output> {
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let deadline = std::time::Instant::now() + Duration::from_secs(secs);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Reap with full output: after exit, wait_with_output is fast.
                let _ = status;
                return child.wait_with_output().ok();
            }
            Ok(None) => {
                if std::time::Instant::now() > deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => return None,
        }
    }
}

#[tauri::command]
pub async fn read_clipboard_image() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Try wl-paste first (Wayland session), then xclip (XWayland fallback).
        for (bin, args) in [
            ("wl-paste", vec!["--type", "image/png", "--no-newline"]),
            ("xclip", vec!["-selection", "clipboard", "-t", "image/png", "-o"]),
        ] {
            let mut cmd = std::process::Command::new(bin);
            cmd.args(&args);
            if let Some(out) = run_with_timeout(cmd, 2) {
                if out.status.success() && !out.stdout.is_empty() {
                    let b64 =
                        base64::engine::general_purpose::STANDARD.encode(&out.stdout);
                    return Ok(Some(b64));
                }
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| format!("clipboard task failed: {e}"))?
}

/// Plain text clipboard (paste-as-text fallback).
#[tauri::command]
pub async fn read_clipboard_text() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        for (bin, args) in [
            ("wl-paste", vec!["--no-newline"]),
            ("xclip", vec!["-selection", "clipboard", "-o"]),
        ] {
            let mut cmd = std::process::Command::new(bin);
            cmd.args(&args);
            if let Some(out) = run_with_timeout(cmd, 2) {
                if out.status.success() && !out.stdout.is_empty() {
                    return Ok(Some(
                        String::from_utf8_lossy(&out.stdout).to_string(),
                    ));
                }
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| format!("clipboard task failed: {e}"))?
}
