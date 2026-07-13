// HTML export:把頁面 view 匯出成單一自含 HTML 檔(blog 式閱讀版)。
// 作法:離螢幕 render PageView → 等 mermaid SVG 內嵌完成 → 序列化 DOM,
// 連同 bundle 內的全部 CSS 規則與 template 色票一起寫進檔案。
// 產物零外部依賴(SVG 內嵌、CSS 內嵌),可寄信、可丟任何靜態空間。

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { SlideDoc } from "../ir/types";
import type { TemplateConfig } from "../templates";
import { templateCssVars } from "../templates";
import { PageView } from "../render-html/PageView";

function countDiagrams(doc: SlideDoc): number {
  let n = 0;
  for (const slide of doc.slides) {
    for (const b of slide.blocks) if (b.kind === "diagram") n += 1;
  }
  return n;
}

function collectCss(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) rules.push(rule.cssText);
    } catch {
      // 跨域樣式表(理論上不存在,bundle 全內嵌)略過
    }
  }
  return rules.join("\n");
}

export async function exportHtml(doc: SlideDoc, template: TemplateConfig): Promise<string> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = "900px";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(createElement(PageView, { doc, template }));
    // React 18 createRoot 的 commit 是非同步:先等 DOM 出現,再等 mermaid
    const expected = countDiagrams(doc);
    const deadline = Date.now() + 8000;
    const ready = () =>
      host.querySelector(".sd-page") !== null &&
      host.querySelectorAll(".sd-diagram svg").length >= expected;
    while (!ready() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 60));
    }
    if (!host.querySelector(".sd-page")) throw new Error("頁面渲染逾時");

    const vars = templateCssVars(template);
    const varStyle = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");
    const title = (doc.meta.title ?? "SnapDeck").replace(/[<>&]/g, "");
    const extraCss = `
      html { background: color-mix(in srgb, ${`#${template.colors.surface}`} 60%, #ffffff); }
      body { margin: 0; padding: 48px 16px 96px;
             font-family: ${template.fonts.body}; }
      .sd-export-footer { max-width: 780px; margin: 28px auto 0; text-align: center;
             font-size: 12.5px; color: #${template.colors.muted};
             font-family: ${template.fonts.body}; }
      .sd-export-footer a { color: inherit; }
      @media (max-width: 840px) { .sd-page { padding: 32px 22px 48px; border-radius: 0; } body { padding: 0 0 64px; } }
    `;
    return [
      "<!doctype html>",
      `<html lang="${doc.meta.lang ?? "zh-TW"}">`,
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${title}</title>`,
      `<style>${collectCss()}</style>`,
      `<style>${extraCss}</style>`,
      "</head>",
      "<body>",
      `<div class="sd-export-root" style="${varStyle}">`,
      host.innerHTML,
      `<div class="sd-export-footer">以 <a href="${window.location.origin}${window.location.pathname}">SnapDeck</a> 製作 — 寫作即排版,貼上即上台</div>`,
      "</div>",
      "</body>",
      "</html>",
    ].join("\n");
  } finally {
    root.unmount();
    host.remove();
  }
}

export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
