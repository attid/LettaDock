import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type { TextMessagePartProps } from "@assistant-ui/react";
import remarkGfm from "remark-gfm";
import { memo } from "react";
import { cn } from "../lib/utils";

const TextComponent = (_props: TextMessagePartProps) => (
  <MarkdownTextPrimitive
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1 className={cn("mb-2 text-xl font-semibold", className)} {...props} />
      ),
      h2: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2 className={cn("mb-2 text-lg font-semibold", className)} {...props} />
      ),
      p: ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p className={cn("mb-2 last:mb-0", className)} {...props} />
      ),
      ul: ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul className={cn("mb-2 list-disc pl-5 last:mb-0", className)} {...props} />
      ),
      li: ({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
        <li className={cn("mb-1 last:mb-0", className)} {...props} />
      ),
      // UX-6: inline `code` is handled below (path detection).
      pre: ({ className, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
        <pre
          className={cn(
            "mb-2 overflow-x-auto rounded-md bg-secondary p-3 text-sm last:mb-0",
            className,
          )}
          {...props}
        />
      ),
      a: ({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
          className={cn("text-primary underline", className)}
          onClick={(e) => {
            // Open external links in the system browser, never in the
            // webview; block non-http(s) schemes (javascript: etc).
            const href = e.currentTarget.getAttribute("href") ?? "";
            if (!/^https?:\/\//i.test(href)) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            void import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
              openUrl(href),
            );
          }}
          // Round-5 agy P1: middle-click auxclick bypasses onClick and
          // navigates the webview — block it too.
          onAuxClick={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          {...props}
        />
      ),
      blockquote: ({ className, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
          className={cn("mb-2 border-l-2 border-border pl-3 text-muted-foreground", className)}
          {...props}
        />
      ),
      // UX-6: bare file paths in assistant text become clickable chips —
      // code spans that look like paths (contain '/' and a known extension)
      // open the Monaco viewer.
      code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) => {
        const text = String(children ?? "");
        const looksLikePath =
          text.includes("/") &&
          /\.(ts|tsx|js|jsx|py|rs|go|json|md|sh|bash|ya?ml|toml|sql|html|css|conf|service)$/i.test(
            text,
          );
        if (looksLikePath && !text.includes(" ")) {
          return (
            <button
              onClick={() =>
                void import("./fileOpener").then(({ openFileRef }) =>
                  openFileRef.current?.({ path: text }),
                )
              }
              title="Открыть файл в просмотрщике"
              className="cursor-pointer rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em] text-primary hover:underline"
              {...props}
            >
              {text}
            </button>
          );
        }
        return (
          <code
            className={cn(
              "rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]",
              className,
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
    }}
  />
);

export const MarkdownText = memo(TextComponent);
