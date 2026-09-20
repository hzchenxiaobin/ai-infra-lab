import { unified } from "unified";
import remarkParse from "remark-parse";

// ---------------------------------------------------------------------------
// 大纲目录提取：与 Markdown 渲染组件共用同一套标题编号（按出现顺序 0 起，
// 锚点 id = `${headingIdPrefix}-${序号}`）。用与渲染一致的 remark 解析器
// 解析，保证 ATX / setext / 引用内标题等写法的序号与锚点严格对齐。
// 纯函数模块，不含 React 组件。
// ---------------------------------------------------------------------------

export interface HeadingItem {
  level: number;
  text: string;
  /** 文档内第几个标题（0 起），与 Markdown 的 headingIdPrefix 锚点 id 对应 */
  index: number;
}

const parser = unified().use(remarkParse);

type MdNode = { type?: string; depth?: number; value?: unknown; children?: MdNode[] };

function nodeText(node: MdNode): string {
  return (typeof node.value === "string" ? node.value : "") + (node.children ?? []).map(nodeText).join("");
}

/** 提取 markdown 中的标题（用于右侧大纲目录） */
export function extractHeadings(text: string): HeadingItem[] {
  const items: HeadingItem[] = [];
  walk(parser.parse(text));
  return items;

  function walk(node: MdNode): void {
    if (node.type === "heading") {
      items.push({ level: node.depth ?? 1, text: nodeText(node), index: items.length });
    }
    for (const child of node.children ?? []) walk(child);
  }
}
