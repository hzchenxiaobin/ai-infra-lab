import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// ---------------------------------------------------------------------------
// 轻量 Markdown 渲染器：支持 #/##/### 标题、- 列表、数字列表、> 引用、
// ``` 代码块、**加粗**、`行内代码`、$行内公式$ / $$块级公式$$（KaTeX）、段落。
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

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "p"; text: string };

const RE_HEADING = /^(#{1,4})\s+(.*)$/;
const RE_UL = /^\s*[-*]\s+/;
const RE_OL = /^\s*\d+\.\s+/;
const RE_QUOTE = /^>\s?/;
const RE_FENCE = /^\s*```/;

function isBlockStart(line: string): boolean {
  return (
    RE_HEADING.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line) ||
    RE_QUOTE.test(line) ||
    RE_FENCE.test(line)
  );
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (RE_FENCE.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过收尾 ```
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const h = RE_HEADING.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (RE_UL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE_UL.test(lines[i])) {
        items.push(lines[i].replace(RE_UL, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (RE_OL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE_OL.test(lines[i])) {
        items.push(lines[i].replace(RE_OL, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (RE_QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(lines[i].replace(RE_QUOTE, ""));
        i++;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }
    // 段落：连续的非空、非块起始行
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }
  return blocks;
}

const HEADING_STYLES: Record<number, string> = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed text-ink"}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <div key={i} className={`${HEADING_STYLES[b.level] ?? HEADING_STYLES[4]} mt-2 first:mt-0`}>
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
                className="overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs text-page/90"
              >
                {b.text}
              </pre>
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
