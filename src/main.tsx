// Global error net: nothing in the app may die silently.
// - window.onerror / unhandledrejection → console + /tmp/lettadock-ui.log
// - ErrorBoundary catches render-phase crashes and shows a recoverable
//   screen with the stack (copy button) instead of a frozen/blank window.

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

function reportError(where: string, message: string, stack?: string) {
  const line = `[crash ${new Date().toISOString().slice(11, 23)}] ${where}: ${message}`;
  // console always — visible in dev terminal
  console.error(line, stack ?? "");
  void import("./letta/localKey")
    .then(({ appendDebugLog }) =>
      appendDebugLog(line + (stack ? `\n${stack.slice(0, 2000)}` : "")),
    )
    .catch(() => {});
}

window.addEventListener("error", (e) => {
  reportError("window.error", e.message, e.error?.stack);
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
  const stack = e.reason instanceof Error ? e.reason.stack : undefined;
  reportError("unhandledrejection", reason, stack);
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Maximum update depth: include the full componentStack + error stack —
    // without it the loop source is unfindable.
    reportError(
      "react.render",
      error.message,
      `componentStack:\n${info.componentStack ?? "-"}\n\nerrorStack:\n${error.stack ?? "-"}`,
    );
  }

  render() {
    if (this.state.error) {
      const report = `${this.state.error.message}\n\n${this.state.error.stack ?? ""}`;
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
          <div className="text-lg font-semibold">Интерфейс упал с ошибкой</div>
          <pre className="max-h-[50vh] max-w-[90vw] overflow-auto rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
            {report}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => void navigator.clipboard.writeText(report)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Скопировать отчёт
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Продолжить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
