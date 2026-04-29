import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

/**
 * Render Markdown safely inside a chat bubble:
 *
 * - GFM enabled (tables, task lists, strikethrough, autolinks).
 * - Raw HTML is dropped — react-markdown disallows it by default and we don't
 *   add `rehype-raw`. User-supplied content can never inject `<script>` etc.
 * - Anchor tags open in a new tab with `rel="noreferrer noopener"`.
 * - Code blocks use the design system's monospace token; inline code gets a
 *   sunken background so it stands out without breaking the bubble palette.
 *
 * The wrapper is a `<div>` with class `bb-md` — see `src/ui/styles.css` for
 * the prose-in-bubble overrides (margins, list indent, etc.).
 */
const components: Components = {
  a({ href, children, ...rest }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  },
  code({ className, children, ...rest }) {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className="bb-md__inline-code" {...rest}>
        {children}
      </code>
    );
  },
};

export function MarkdownContent({ content }: Props): JSX.Element {
  return (
    <div className="bb-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
