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
      code: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <code
          className={cn(
            "rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]",
            className,
          )}
          {...props}
        />
      ),
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
        <a className={cn("text-primary underline", className)} {...props} />
      ),
      blockquote: ({ className, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
          className={cn("mb-2 border-l-2 border-border pl-3 text-muted-foreground", className)}
          {...props}
        />
      ),
    }}
  />
);

export const MarkdownText = memo(TextComponent);
