// 共用分頁切塊:H1/H2 開新頁、--- 強制分頁。
// 黃金樣本慣例:`<!-- skip -->` 等 slide 級 directive 常寫在下一頁標題「前」,
// 因此 chunk 結尾的 slide 級 directive(skip/fit/layout)歸屬下一頁。

import type { ParsedNode } from "./parse";

const SLIDE_SCOPED = new Set(["skip", "fit", "layout"]);

function isSlideScopedDirective(n: ParsedNode): boolean {
  return n.type === "directive" && SLIDE_SCOPED.has(n.directive.keyword);
}

export function chunkSlides(nodes: ParsedNode[]): ParsedNode[][] {
  const chunks: ParsedNode[][] = [];
  let current: ParsedNode[] = [];

  const flush = (): ParsedNode[] => {
    // 尾端的 slide 級 directive 讓渡給下一頁
    const carry: ParsedNode[] = [];
    while (current.length && isSlideScopedDirective(current[current.length - 1])) {
      carry.unshift(current.pop()!);
    }
    if (current.length) chunks.push(current);
    current = [];
    return carry;
  };

  for (const pn of nodes) {
    if (pn.type === "md" && pn.node.type === "thematicBreak") {
      current = flush();
      continue;
    }
    if (pn.type === "md" && pn.node.type === "heading" && pn.node.depth <= 2) {
      current = flush();
    }
    current.push(pn);
  }
  flush();
  return chunks;
}

export function chunkStartLine(chunk: ParsedNode[]): number | undefined {
  const first = chunk[0];
  if (!first) return undefined;
  return first.type === "md"
    ? first.node.position?.start.line
    : (first as { line?: number }).line;
}
