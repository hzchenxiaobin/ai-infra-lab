import { useMemo } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Element, Root } from "hast";
import "katex/dist/katex.min.css";

// ---------------------------------------------------------------------------
// Markdown 渲染器：react-markdown（CommonMark 全语法）+ remark-gfm（表格 /
// 任务列表 / 删除线 / 自动链接 / 脚注）+ remark-math & rehype-katex（$ 与
// $$ 公式）。原始 HTML 按纯文本展示（react-markdown 默认转义，不执行）。
// headingIdPrefix：提供时按标题出现顺序编号锚点 id（`${prefix}-${序号}`），
// 与 lib/markdown-blocks 的 extractHeadings 对应，供右侧大纲目录跳转。
// ---------------------------------------------------------------------------

const REMARK_PLUGINS = [remarkGfm, remarkMath];

type RehypePlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>;

/** 给标题元素按出现顺序写 id；跳过已有 id 的标题（如脚注区的隐藏标签） */
function rehypeHeadingIds({ prefix }: { prefix: string }) {
  return (tree: Root): undefined => {
    let counter = 0;
    const walk = (node: Root | Element): void => {
      for (const child of node.children) {
        if (child.type === "element") {
          if (/^h[1-6]$/.test(child.tagName) && child.properties.id === undefined) {
            child.properties.id = `${prefix}-${counter++}`;
          }
          walk(child);
        }
      }
    };
    walk(tree);
  };
}

/** 提取 React 子树的纯文本（代码块内容用） */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in node) {
    return nodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

const HEADING_STYLES: Record<number, string> = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold text-muted",
};

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function renderHeading(level: number, { id, className, children }: { id?: string; className?: string; children?: ReactNode }) {
  const Tag = HEADING_TAGS[level - 1];
  return (
    <Tag id={id} className={`${className ?? ""} ${HEADING_STYLES[level] ?? HEADING_STYLES[4]} mt-2 scroll-mt-24 first:mt-0`.trim()}>
      {children}
    </Tag>
  );
}

const components: Components = {
  h1: ({ id, className, children }) => renderHeading(1, { id, className, children }),
  h2: ({ id, className, children }) => renderHeading(2, { id, className, children }),
  h3: ({ id, className, children }) => renderHeading(3, { id, className, children }),
  h4: ({ id, className, children }) => renderHeading(4, { id, className, children }),
  h5: ({ id, className, children }) => renderHeading(5, { id, className, children }),
  h6: ({ id, className, children }) => renderHeading(6, { id, className, children }),
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  a: ({ href, children }) => {
    const external = typeof href === "string" && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className="text-accent-600 underline decoration-accent-300 underline-offset-2 transition-colors duration-150 hover:text-accent-700"
      >
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  del: ({ children }) => <del className="text-muted">{children}</del>,
  ul: ({ className, children }) => (
    <ul
      className={
        className?.includes("contains-task-list")
          ? "list-none space-y-1 pl-0.5"
          : "list-disc space-y-1 pl-5 [&>li>ol]:mt-1 [&>li>ul]:mt-1"
      }
    >
      {children}
    </ul>
  ),
  ol: ({ className, children }) => (
    <ol
      className={
        className?.includes("contains-task-list")
          ? "list-none space-y-1 pl-0.5"
          : "list-decimal space-y-1 pl-5 [&>li>ol]:mt-1 [&>li>ul]:mt-1"
      }
    >
      {children}
    </ol>
  ),
  input: ({ checked }) => (
    <input type="checkbox" readOnly checked={Boolean(checked)} className="mr-1.5 h-3.5 w-3.5 accent-accent-600" />
  ),
  blockquote: ({ children }) => (
    <blockquote className="space-y-1.5 border-l-2 border-line pl-3 text-muted">{children}</blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg border border-line bg-page p-3 font-mono text-xs text-ink">
      {nodeText(children)}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded-md bg-divider px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  tr: ({ children }) => <tr className="border-b border-line last:border-b-0">{children}</tr>,
  th: ({ style, children }) => (
    <th style={style} className="border-b border-line bg-page px-3 py-2 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ style, children }) => (
    <td style={style} className="px-3 py-2 align-top">
      {children}
    </td>
  ),
  img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg border border-line" />,
  hr: () => <hr className="my-4 border-line" />,
  section: ({ children }) => (
    <section className="mt-4 space-y-2 border-t border-line pt-2 text-xs text-muted">{children}</section>
  ),
};

export function Markdown({
  text,
  className,
  headingIdPrefix,
}: {
  text: string;
  className?: string;
  /** 提供时标题渲染 id={`${prefix}-${出现顺序}`} 锚点，供大纲跳转 */
  headingIdPrefix?: string;
}) {
  const rehypePlugins = useMemo(() => {
    const list: RehypePlugins = [rehypeKatex];
    if (headingIdPrefix) list.push([rehypeHeadingIds, { prefix: headingIdPrefix }]);
    return list;
  }, [headingIdPrefix]);
  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed text-ink"}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
