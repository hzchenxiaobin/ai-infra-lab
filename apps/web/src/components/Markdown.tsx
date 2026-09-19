import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { parseBlocks } from "../lib/markdown-blocks";

// ---------------------------------------------------------------------------
// 轻量 Markdown 渲染器：支持 #/##/### 标题、GFM 表格、- 列表、数字列表、
// > 引用、``` 代码块、**加粗**、`行内代码`、$行内公式$ / $$块级公式$$（KaTeX）、段落。
// 不引入 react-markdown。
// ---------------------------------------------------------------------------

function renderMath(tex: string, displayMode: boolean, key: number): ReactNode {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode });
  return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // [text](url) 链接、**加粗**、`行内代码`、$公式$（KaTeX）
  const regex =
    /(\$\$[\s\S]+?\$\$|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\$[^$\n]+?\$)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(regex)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("$$")) {
      nodes.push(renderMath(tok.slice(2, -2), true, key++));
    } else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (lm) {
        const [, label, url] = lm;
        const external = /^https?:\/\//.test(url);
        nodes.push(
          <a
            key={key++}
            href={url}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="text-accent-600 underline decoration-accent-300 underline-offset-2 transition-colors duration-150 hover:text-accent-700"
          >
            {renderInline(label)}
          </a>,
        );
      } else {
        nodes.push(tok);
      }
    } else if (tok.startsWith("$")) {
      nodes.push(renderMath(tok.slice(1, -1), false, key++));
    } else if (tok.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded-md bg-divider px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_STYLES: Record<number, string> = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
};

export function Markdown({
  text,
  className,
  headingIdPrefix,
}: {
  text: string;
  className?: string;
  /** 提供时标题块渲染 id={`${prefix}-${blockIndex}`} 锚点，供大纲跳转 */
  headingIdPrefix?: string;
}) {
  const blocks = parseBlocks(text);
  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed text-ink"}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <div
                key={i}
                id={headingIdPrefix ? `${headingIdPrefix}-${i}` : undefined}
                className={`${HEADING_STYLES[b.level] ?? HEADING_STYLES[4]} mt-2 scroll-mt-24 first:mt-0`}
              >
                {renderInline(b.text)}
              </div>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-line pl-3 text-muted">
                {renderInline(b.text)}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg border border-line bg-page p-3 font-mono text-xs text-ink"
              >
                {b.text}
              </pre>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {b.header.map((cell, j) => (
                        <th
                          key={j}
                          className="border-b border-line bg-page px-3 py-2 text-left font-semibold whitespace-nowrap"
                        >
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-line last:border-b-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 align-top">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "p":
            return (
              <p key={i} className="whitespace-pre-line">
                {renderInline(b.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
