// Lazy file viewer with Monaco DiffEditor (Phase 4 tail).
// Opens on demand — Monaco chunk is dynamic-imported, never in the main bundle.
// Content sources (spec: "supported APIs or authorized workspace access"):
//  1. Files uploaded/attached in-session → sandbox download API
//  2. Local workspace paths (ibook26 execution target) → local read via Rust
import { lazy, Suspense, useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));
const DiffEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.DiffEditor })),
);

export interface FileRef {
  path: string;
  /** Old content for diff mode. */
  oldContent?: string;
  newContent?: string;
  sandboxId?: string;
  language?: string;
}

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", json: "json", md: "markdown",
    sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml", toml: "ini",
    sql: "sql", html: "html", css: "css", txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

export function FileViewer({
  file,
  onClose,
}: {
  file: FileRef;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        if (file.newContent != null) {
          if (!cancelled) setContent(file.newContent);
          return;
        }
        if (file.sandboxId) {
          const { invoke } = await import("@tauri-apps/api/core");
          // Download goes via Rust (proxy principle) — key passed like other
          // proxy calls (P1 fix: was missing, serde rejected the request).
          const apiKey =
            useAppStore.getState().getProfileKey() ??
            ((): string => {
              throw new Error("нет ключа профиля");
            })();
          const res = await invoke<{ status: number; body: string }>(
            "proxy_download_sandbox_file",
            { req: { sandboxId: file.sandboxId, path: file.path, apiKey } },
          );
          if (res.status >= 400) {
            throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 120)}`);
          }
          if (!cancelled) setContent(res.body);
          return;
        }
        throw new Error("нет источника содержимого (sandbox недоступен)");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const language = file.language ?? languageFromPath(file.path);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="truncate text-sm font-medium">{file.path}</div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          закрыть (Esc)
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {loading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        )}
        {error && (
          <div className="p-8 text-center text-sm text-red-400">{error}</div>
        )}
        {!loading && !error && (
          <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Monaco загружается…</div>}>
            {file.oldContent != null ? (
              <DiffEditor
                original={file.oldContent}
                modified={content ?? ""}
                language={language}
                theme="vs-dark"
                options={{ readOnly: true, renderSideBySide: true }}
              />
            ) : (
              <MonacoEditor
                height="100%"
                language={language}
                theme="vs-dark"
                value={content ?? ""}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
}
