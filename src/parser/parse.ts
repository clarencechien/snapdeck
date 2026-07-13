// remark pipeline:MD 字串 → mdast + frontmatter + directive 註解。
// directive 從 HTML 註解 node 解析(PROFILE.md §4,詞彙表凍結 6 個)。

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { parse as parseYaml } from "yaml";
import type { Root, RootContent } from "mdast";

export const DIRECTIVE_KEYWORDS = [
  "layout",
  "split",
  "notes",
  "emphasis",
  "fit",
  "skip",
] as const;

export type DirectiveKeyword = (typeof DIRECTIVE_KEYWORDS)[number];

export const LAYOUT_VALUES = [
  "title",
  "section",
  "content",
  "two-col",
  "big-stat",
  "quote",
  "cards",
  "diagram",
] as const;

export type Directive = {
  keyword: DirectiveKeyword;
  value?: string;
  raw: string;
  line?: number;
};

export type ParsedDoc = {
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
  /** frontmatter 之外的 top-level mdast nodes;HTML 註解已轉為 directive 標記 */
  nodes: ParsedNode[];
};

export type ParsedNode =
  | { type: "directive"; directive: Directive }
  | { type: "unknown-directive"; raw: string; keyword: string; line?: number }
  | { type: "html"; raw: string; line?: number }
  | { type: "md"; node: RootContent };

const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkGfm);

const COMMENT_RE = /^<!--\s*([\s\S]*?)\s*-->$/;

export function parseDirectiveComment(raw: string, line?: number):
  | { kind: "directive"; directive: Directive }
  | { kind: "unknown"; keyword: string }
  | { kind: "not-comment" } {
  const m = COMMENT_RE.exec(raw.trim());
  if (!m) return { kind: "not-comment" };
  const body = m[1].trim();
  // `<!-- 關鍵字: 值 -->` 或 `<!-- 關鍵字 -->`;大小寫不敏感
  const kv = /^([A-Za-z][A-Za-z-]*)\s*(?::\s*([\s\S]*))?$/.exec(body);
  if (!kv) return { kind: "unknown", keyword: body.split(/\s/)[0] ?? body };
  const keyword = kv[1].toLowerCase();
  const value = kv[2]?.trim();
  if ((DIRECTIVE_KEYWORDS as readonly string[]).includes(keyword)) {
    return {
      kind: "directive",
      directive: { keyword: keyword as DirectiveKeyword, value, raw, line },
    };
  }
  return { kind: "unknown", keyword };
}

export function parseMarkdown(md: string): ParsedDoc {
  const tree = processor.parse(md) as Root;

  let frontmatter: Record<string, unknown> = {};
  let frontmatterError: string | undefined;
  const nodes: ParsedNode[] = [];

  for (const node of tree.children) {
    if (node.type === "yaml") {
      try {
        const parsed = parseYaml(node.value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        } else if (parsed != null) {
          frontmatterError = "frontmatter 必須是 YAML 物件";
        }
      } catch (e) {
        frontmatterError = `frontmatter YAML 解析失敗:${(e as Error).message}`;
      }
      continue;
    }
    if (node.type === "html") {
      const raw = node.value.trim();
      const line = node.position?.start.line;
      // 一個 html node 可能含多個註解(連續兩行註解會被 remark 併為一個 node)
      const comments = raw.match(/<!--[\s\S]*?-->/g);
      if (comments && comments.join("").replace(/\s/g, "") === raw.replace(/\s/g, "")) {
        for (const c of comments) {
          const r = parseDirectiveComment(c, line);
          if (r.kind === "directive") nodes.push({ type: "directive", directive: r.directive });
          else if (r.kind === "unknown")
            nodes.push({ type: "unknown-directive", raw: c, keyword: r.keyword, line });
        }
      } else {
        nodes.push({ type: "html", raw, line });
      }
      continue;
    }
    nodes.push({ type: "md", node });
  }

  return { frontmatter, frontmatterError, nodes };
}
