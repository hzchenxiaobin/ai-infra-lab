// ---------------------------------------------------------------------------
// 轻量 markdown 块解析：供 Markdown 渲染组件与大纲目录（extractHeadings）共用。
// 纯函数模块，不含 React 组件。
// ---------------------------------------------------------------------------

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "p"; text: string };

const RE_HEADING = /^(#{1,4})\s+(.*)$/;
const RE_UL = /^\s*[-*]\s+/;
const RE_OL = /^\s*\d+\.\s+/;
const RE_QUOTE = /^>\s?/;
const RE_FENCE = /^\s*```/;

/** 切分表格行：去掉首尾 |，按 | 拆单元格 */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** 表格分隔行（|---|---| / |:--|--:| 等） */
function isTableSepRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/** 表格起点：当前行含 | 且下一行是分隔行 */
function isTableStart(lines: string[], i: number): boolean {
  return i + 1 < lines.length && lines[i].includes("|") && isTableSepRow(lines[i + 1]);
}

function isBlockStart(line: string): boolean {
  return (
    RE_HEADING.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line) ||
    RE_QUOTE.test(line) ||
    RE_FENCE.test(line)
  );
}

export function parseBlocks(text: string): Block[] {
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
    if (isTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      i += 2; // 跳过表头行与分隔行
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
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
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isBlockStart(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }
  return blocks;
}

export interface HeadingItem {
  level: number;
  text: string;
  /** 在 parseBlocks 结果中的下标，与 Markdown 的 headingIdPrefix 锚点 id 对应 */
  index: number;
}

/** 提取 markdown 中的标题（用于右侧大纲目录） */
export function extractHeadings(text: string): HeadingItem[] {
  const items: HeadingItem[] = [];
  parseBlocks(text).forEach((b, index) => {
    if (b.type === "heading") items.push({ level: b.level, text: b.text, index });
  });
  return items;
}
