// Multipart file upload — FormData cannot go through the JSON proxy command,
// so this runs via a Rust command (reqwest multipart) on the same proxy
// principle: everything leaves the frontend through the backend.

export interface UploadedFile {
  path: string;
  name: string;
}

export async function uploadFileMultipart(
  apiKey: string,
  sandboxId: string,
  file: File,
): Promise<UploadedFile> {
  // Round-2 agy P2: guard huge files — IPC serializes bytes as a JSON array,
  // tens of MB would hang the bridge.
  const MAX_BYTES = 20 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(
      `файл ${(file.size / 1048576).toFixed(1)} МБ больше лимита ${MAX_BYTES / 1048576} МБ`,
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const buf = new Uint8Array(await file.arrayBuffer());
  const res = (await invoke("proxy_upload_file", {
    req: {
      sandboxId,
      apiKey,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: Array.from(buf),
    },
  })) as { status: number; body: string };
  if (res.status >= 400) {
    throw new Error(`upload HTTP ${res.status}: ${res.body.slice(0, 150)}`);
  }
  const parsed = JSON.parse(res.body) as { files?: UploadedFile[] };
  const first = parsed.files?.[0];
  if (!first) {
    throw new Error("upload: пустой ответ сервера (files[])");
  }
  return first;
}
