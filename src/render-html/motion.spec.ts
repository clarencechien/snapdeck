// 動畫 CSS 的匯出防呆(DECISIONS D27)。
//
// 背景:Drop 匯出用 collectCss() 逐條 rule.cssText 序列化再重新解析。
// 當一條規則同時有「含 var() 的 animation 簡寫」與「animation-delay
// 長寫覆蓋」時,Chromium 序列化不出這個組合——簡寫整個消失,只留下
// delay,匯出檔的動畫因此靜止(站內卻正常)。本測試把兩道保險釘死。

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const motion = readFileSync(join(__dirname, "../app/motion.css"), "utf8");
const exportSrc = readFileSync(join(__dirname, "exportDeck.tsx"), "utf8");

/** 取出所有 `animation: ...;` 簡寫宣告 */
function shorthands(css: string): string[] {
  return css.match(/animation:[^;}]+/g) ?? [];
}

describe("motion.css — 匯出安全性", () => {
  it("保險一:animation 簡寫不得含 var()(序列化會整條掉)", () => {
    const bad = shorthands(motion).filter((d) => d.includes("var("));
    expect(bad, `這些簡寫含 var(),匯出後會失效:\n${bad.join("\n")}`).toEqual([]);
  });

  it("保險二:exportDeck 以原文內嵌 motion.css,不依賴 cssText 還原", () => {
    expect(exportSrc).toMatch(/import motionCss from "\.\.\/app\/motion\.css\?raw"/);
    expect(exportSrc).toMatch(/<style>\$\{motionCss\}<\/style>/);
  });

  it("動畫全部只動 opacity / transform(不干擾溢版量測)", () => {
    const frames = motion.match(/@keyframes[^{]+\{[\s\S]*?\n\}/g) ?? [];
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      const props = (f.match(/^\s*(?:from|to|\d+%)?\s*\{([^}]*)\}/gm) ?? [])
        .flatMap((body) => body.match(/[a-z-]+(?=\s*:)/g) ?? [])
        .filter((p) => p !== "from" && p !== "to");
      for (const p of props) expect(["opacity", "transform"], f).toContain(p);
    }
  });

  it("動畫範圍鎖在簡報態(每條規則都有 .sd-present / #dk-frame 前綴)", () => {
    // 先去掉註解與 @keyframes 區塊,只留下真正的樣式規則選擇器
    const rules = motion
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@keyframes[^{]*\{[\s\S]*?\n\}/g, "");
    const selectors = (rules.match(/^[^@\s{}][^{]*\{/gm) ?? [])
      .map((s) => s.replace(/\{$/, "").trim())
      .filter((s) => s !== ":root");
    expect(selectors.length).toBeGreaterThan(10);
    for (const sel of selectors) {
      expect(sel, `未鎖範圍的選擇器:${sel}`).toMatch(/\.sd-present|#dk-frame/);
    }
  });

  it("SVG 內部只准動 opacity(CSS transform 會覆蓋 mermaid 的定位屬性)", () => {
    // 只動 opacity 的 keyframe 名單
    const opacityOnly = new Set(
      (motion.match(/@keyframes\s+([\w-]+)\s*\{[\s\S]*?\n\}/g) ?? [])
        .filter((f) => !/transform\s*:/.test(f))
        .map((f) => /@keyframes\s+([\w-]+)/.exec(f)![1])
    );
    expect(opacityOnly.has("sd-fade")).toBe(true);

    const rules = motion.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^}]*\}/g) ?? [];
    const svgRules = rules.filter((r) => /\.sd-diagram/.test(r.split("{")[0]));
    expect(svgRules.length).toBeGreaterThan(0);
    for (const r of svgRules) {
      const used = /animation:\s*([\w-]+)/.exec(r)?.[1];
      expect(used && opacityOnly.has(used), `圖表規則用了會動 transform 的 ${used}:\n${r}`).toBe(true);
      expect(/transform(-origin)?\s*:/.test(r), `圖表規則不得設 transform:\n${r}`).toBe(false);
    }
  });

  it("保留 prefers-reduced-motion 降級", () => {
    expect(motion).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(motion).toMatch(/animation: none !important/);
  });
});
