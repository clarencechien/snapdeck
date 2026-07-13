import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./parse";
import { lint } from "./linter";

const run = (md: string) => lint(parseMarkdown(md));

describe("profile linter", () => {
  it("合法最小文件通過", () => {
    const r = run("---\ntitle: T\n---\n\n## 頁\n\n內容");
    expect(r.ok).toBe(true);
    expect(r.messages).toHaveLength(0);
  });

  it("未知 directive → error", () => {
    const r = run("## 頁\n\n<!-- highlight -->\n\n內容");
    expect(r.ok).toBe(false);
    expect(r.messages.some((m) => m.rule === "directive-unknown")).toBe(true);
  });

  it("split 出現在非 two-col 頁 → error", () => {
    const r = run("## 頁\n\n左\n\n<!-- split -->\n\n右");
    expect(r.ok).toBe(false);
    expect(r.messages.some((m) => m.rule === "split-outside-two-col")).toBe(true);
  });

  it("split 在 two-col 頁 → ok", () => {
    const r = run("## 頁\n\n<!-- layout: two-col -->\n\n左\n\n<!-- split -->\n\n右");
    expect(r.ok).toBe(true);
  });

  it("frontmatter YAML 解析失敗 → error", () => {
    const r = run("---\ntitle: [unclosed\n---\n\n## 頁\n\n內容");
    expect(r.ok).toBe(false);
    expect(r.messages.some((m) => m.rule === "frontmatter")).toBe(true);
  });

  it("未知 frontmatter 欄位 → warning", () => {
    const r = run("---\ntitle: T\nfoo: bar\n---\n\n## 頁\n\n內容");
    expect(r.ok).toBe(true);
    expect(r.messages.some((m) => m.rule === "frontmatter-unknown-field")).toBe(true);
  });

  it("一頁多個 layout → warning", () => {
    const r = run("## 頁\n\n<!-- layout: content -->\n<!-- layout: quote -->\n\n內容");
    expect(r.ok).toBe(true);
    expect(r.messages.some((m) => m.rule === "layout-duplicate")).toBe(true);
  });

  it("layout 值不合法 → error", () => {
    const r = run("## 頁\n\n<!-- layout: fancy -->\n\n內容");
    expect(r.ok).toBe(false);
    expect(r.messages.some((m) => m.rule === "layout-invalid")).toBe(true);
  });

  it("單頁內容塊 >8 → warning", () => {
    const blocks = Array.from({ length: 9 }, (_, i) => `第 ${i} 段內容`).join("\n\n");
    const r = run(`## 頁\n\n${blocks}`);
    expect(r.ok).toBe(true);
    expect(r.messages.some((m) => m.rule === "too-many-blocks")).toBe(true);
  });

  it("外部圖片 URL → warning", () => {
    const r = run("## 頁\n\n![圖](https://example.com/a.png)");
    expect(r.ok).toBe(true);
    expect(r.messages.some((m) => m.rule === "external-image")).toBe(true);
  });

  it("directive 大小寫不敏感", () => {
    const r = run("## 頁\n\n<!-- NOTES: 講稿 -->\n\n內容");
    expect(r.ok).toBe(true);
  });

  it("行內 HTML → warning", () => {
    const r = run('## 頁\n\n<div class="x">內容</div>');
    expect(r.ok).toBe(true);
    expect(r.messages.some((m) => m.rule === "inline-html")).toBe(true);
  });
});
