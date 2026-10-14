// Minimal local-only HTTP proxy for the Letta Cloud API (Tauri command).
//
// Why: api.letta.com sends Access-Control-Allow-Origin for /v1/agents but
// NOT for /v1/environments (computers.list). Browser fetch from the webview
// therefore fails with a CORS error, which the SDK surfaces as
// "Connection error". Per spec §4 a minimal, local-only, justified proxy is
// allowed; this is that case, documented in docs/phase3-session-notes.md.
//
// Scope: forwards GET/POST/PATCH/DELETE to https://api.letta.com with the
// caller's Authorization header. Binds nothing; each call is one reqwest
// request from the Rust side (no server process).

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: std::collections::HashMap<String, String>,
    pub api_key: String,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
pub async fn proxy_letta_api(req: ProxyRequest) -> Result<ProxyResponse, String> {
    let client = reqwest::Client::new();
    let mut url = format!("https://api.letta.com{}", req.path);
    if !req.query.is_empty() {
        let qs: Vec<String> = req
            .query
            .iter()
            .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
            .collect();
        url.push('?');
        url.push_str(&qs.join("&"));
    }

    let method = reqwest::Method::from_bytes(req.method.as_bytes())
        .map_err(|e| format!("bad method: {e}"))?;

    let mut builder = client
        .request(method, &url)
        .header("Authorization", format!("Bearer {}", req.api_key))
        .header("Accept", "application/json");

    builder = match req.body {
        Some(ref b) if !b.is_null() => builder.json(b),
        _ => builder,
    };

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("proxy request failed: {e}"))?;

    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(ProxyResponse { status, body })
}
