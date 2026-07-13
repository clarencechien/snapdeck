// Profile linter(PROFILE.md §8):CLI 與站內共用。
// 錯誤(阻擋):未知 directive;split 出現在非 two-col 頁;frontmatter YAML 解析失敗。
// 警告(不阻擋):未知 frontmatter 欄位;一頁多個 layout;單頁內容塊 >8;外部圖片 URL。

import type { ParsedDoc, ParsedNode } from "./parse";
import { LAYOUT_VALUES } from "./parse";
import { chunkSlides, chunkStartLine } from "./chunk";

export type LintMessage = {
  severity: "error" | "warning";
  rule: string;
  message: string;
  line?: number;
};

export type LintResult = {
  ok: boolean;
  messages: LintMessage[];
};

const KNOWN_FRONTMATTER = new Set(["title", "author", "date", "template", "lang"]);

export function lint(doc: ParsedDoc): LintResult {
  const messages: LintMessage[] = [];

  if (doc.frontmatterError) {
    messages.push({ severity: "error", rule: "frontmatter", message: doc.frontmatterError, line: 1 });
  }

  for (const key of Object.keys(doc.frontmatter)) {
    if (!KNOWN_FRONTMATTER.has(key)) {
      messages.push({
        severity: "warning",
        rule: "frontmatter-unknown-field",
        message: `未知 frontmatter 欄位「${key}」(會被忽略)`,
      });
    }
  }

  // 未知 directive → 錯誤
  for (const pn of doc.nodes) {
    if (pn.type === "unknown-directive") {
      messages.push({
        severity: "error",
        rule: "directive-unknown",
        message: `未知 directive「${pn.keyword}」;合法詞彙:layout, split, notes, emphasis, fit, skip`,
        line: pn.line,
      });
    }
    if (pn.type === "html") {
      messages.push({
        severity: "warning",
        rule: "inline-html",
        message: "偵測到行內 HTML,profile 禁止(除 HTML 註解外),輸出時會被忽略",
        line: pn.line,
      });
    }
  }

  // 逐頁檢查
  for (const nodes of chunkSlides(doc.nodes)) {
    const chunk = { nodes, startLine: chunkStartLine(nodes) };
    const layouts = chunk.nodes.filter(
      (n) => n.type === "directive" && n.directive.keyword === "layout"
    );
    const firstLayout =
      layouts.length > 0
        ? (layouts[0] as Extract<ParsedNode, { type: "directive" }>).directive.value?.toLowerCase()
        : undefined;

    if (layouts.length > 1) {
      messages.push({
        severity: "warning",
        rule: "layout-duplicate",
        message: "一頁出現多個 layout directive,只取第一個",
        line: chunk.startLine,
      });
    }

    if (firstLayout && !(LAYOUT_VALUES as readonly string[]).includes(firstLayout)) {
      messages.push({
        severity: "error",
        rule: "layout-invalid",
        message: `layout 值「${firstLayout}」不合法;合法值:${LAYOUT_VALUES.join(", ")}`,
        line: chunk.startLine,
      });
    }

    const hasSplit = chunk.nodes.some(
      (n) => n.type === "directive" && n.directive.keyword === "split"
    );
    if (hasSplit && firstLayout !== "two-col") {
      messages.push({
        severity: "error",
        rule: "split-outside-two-col",
        message: "<!-- split --> 只能出現在 layout: two-col 的頁",
        line: chunk.startLine,
      });
    }

    const contentBlocks = chunk.nodes.filter(
      (n) => n.type === "md" && n.node.type !== "heading"
    );
    if (contentBlocks.length > 8) {
      messages.push({
        severity: "warning",
        rule: "too-many-blocks",
        message: `單頁內容塊 ${contentBlocks.length} 個(>8),建議用 --- 拆頁`,
        line: chunk.startLine,
      });
    }

    // 外部圖片 URL → 警告(pptx 端有失敗風險)
    for (const n of chunk.nodes) {
      if (n.type !== "md") continue;
      const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const nd = node as { type?: string; url?: string; children?: unknown[]; position?: { start: { line: number } } };
        if (nd.type === "image" && nd.url && /^https?:\/\//.test(nd.url)) {
          messages.push({
            severity: "warning",
            rule: "external-image",
            message: `外部圖片 URL(${nd.url}),pptx 匯出時內嵌下載,失敗則以佔位框呈現`,
            line: nd.position?.start.line,
          });
        }
        if (Array.isArray(nd.children)) nd.children.forEach(walk);
      };
      walk(n.node);
    }
  }

  return { ok: !messages.some((m) => m.severity === "error"), messages };
}
