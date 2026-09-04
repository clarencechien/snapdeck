// Markdown 連結與圖片的協定白名單。
//
// blocks.tsx 把 IR 的 link 原樣放進 <a href>,React 18 的 production build 對
// javascript: 只在 dev 警告、不擋。目前那條路走不通 —— rel="noreferrer" 隱含
// noopener,新分頁是沒有 creator 的 opaque origin,規範上 javascript: 的跨源
// 導航不執行。但那是零層次防禦:它靠的是別人的實作細節。
//
// 白名單放在 IR 而不是渲染端,因為同一份 IR 會流進頁面 view、slide、單檔 HTML
// 匯出、Drop zip 與 pptx —— 在出口擋要擋五次。

import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../parser/parse";
import { buildIR, safeUrl } from "./buildIR";
import { getTemplate } from "../templates";

const linksOf = (md: string) =>
  buildIR(parseMarkdown(md))
    .slides.flatMap((s) => s.blocks)
    .flatMap((b) => ("text" in b && Array.isArray(b.text) ? b.text : []))
    .map((seg) => seg.link);

describe("safeUrl — 連結協定白名單", () => {
  it("放行 http / https / mailto / 相對路徑 / 片段", () => {
    for (const ok of [
      "https://example.com/a?b=1#c",
      "http://example.com",
      "mailto:someone@example.com",
      "/absolute/path",
      "./relative.md",
      "#section",
      "page.html",
    ]) {
      expect(safeUrl(ok)).toBe(ok);
    }
  });

  it("擋掉 javascript: 與其他協定", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)  ",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/x",
    ]) {
      expect(safeUrl(bad)).toBeUndefined();
    }
  });

  it("空值不會變成連結", () => {
    expect(safeUrl("")).toBeUndefined();
    expect(safeUrl("   ")).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
  });

  it("走完整的 parse → IR:惡意連結被拿掉,文字留著", () => {
    const links = linksOf("# H\n\n[點我](javascript:alert(1)) 與 [正常](https://example.com)\n");
    expect(links).not.toContain("javascript:alert(1)");
    expect(links).toContain("https://example.com");
    const text = buildIR(parseMarkdown("# H\n\n[點我](javascript:alert(1))\n"))
      .slides.flatMap((s) => s.blocks)
      .flatMap((b) => ("text" in b && Array.isArray(b.text) ? b.text : []))
      .map((s) => s.text)
      .join("");
    expect(text).toContain("點我"); // 文字沒有被吃掉
  });

  it("data:image 只給圖片用,連結不放行", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(safeUrl(png, true)).toBe(png);
    expect(safeUrl(png)).toBeUndefined();
    // data:text/html 就算掛在圖片上也不行
    expect(safeUrl("data:text/html,<script>alert(1)</script>", true)).toBeUndefined();
    const ir = buildIR(parseMarkdown(`# H\n\n![alt](${png})\n`));
    expect(ir.slides.flatMap((s) => s.blocks).some((b) => b.kind === "image")).toBe(true);
  });

  it("圖片的 src 也走同一組白名單,不合法就降級成文字", () => {
    const ir = buildIR(parseMarkdown("# H\n\n![替代文字](javascript:alert(1))\n"));
    const blocks = ir.slides.flatMap((s) => s.blocks);
    expect(blocks.some((b) => b.kind === "image")).toBe(false);
    expect(JSON.stringify(blocks)).not.toContain("javascript:");
    const ok = buildIR(parseMarkdown("# H\n\n![alt](https://example.com/a.png)\n"));
    expect(ok.slides.flatMap((s) => s.blocks).some((b) => b.kind === "image")).toBe(true);
  });
});

describe("getTemplate — 原型鏈", () => {
  it("frontmatter 的 template 值不會沿著原型鏈拿到 Object", () => {
    for (const evil of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      const t = getTemplate(evil);
      expect(typeof t).toBe("object");
      expect(t.id).toBe("clean-light");
    }
  });

  it("已知的 template 照常回傳", () => {
    expect(getTemplate("craft").id).toBe("craft");
    expect(getTemplate(undefined).id).toBe("clean-light");
  });
});
