// v2 摘要投影層測試(HANDOFF-snapdeck-v2 M1 驗收):
// 確定性、slide: directive、第一句抽取、多段收斂、既有樣本不退化。

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown } from "../parser/parse";
import { buildIR } from "./buildIR";
import { summarizeDoc, firstSentence } from "./summarize";
import { plainText } from "./types";

const ir = (md: string) => buildIR(parseMarkdown(md));

describe("firstSentence", () => {
  it("全形句號斷句", () => {
    expect(firstSentence("第一句。第二句。")).toBe("第一句。");
  });
  it("半形句號僅在後接空白/行尾時斷(不切壞小數與縮寫)", () => {
    expect(firstSentence("成長 3.5 倍,超出預期。後續說明")).toBe("成長 3.5 倍,超出預期。");
    expect(firstSentence("First sentence. Second one.")).toBe("First sentence.");
  });
  it("無句號 → 整段;過長 → 截斷加省略號", () => {
    expect(firstSentence("沒有句號的短段")).toBe("沒有句號的短段");
    const long = "很".repeat(80);
    expect(firstSentence(long)).toBe("很".repeat(48) + "…");
  });
});

describe("summarizeDoc — 降密度規則", () => {
  it("文件密度段落 → slide 態只取第一句", () => {
    const doc = ir(
      "## 頁\n\n這是第一句結論。這是文件態才需要的展開說明,講得比較長,slide 上不需要。"
    );
    const s = summarizeDoc(doc);
    const para = s.slides[0].blocks.find((b) => b.kind === "para");
    expect(para && para.kind === "para" && plainText(para.text)).toBe("這是第一句結論。");
    // 文件態(原 doc)不受影響
    const orig = doc.slides[0].blocks.find((b) => b.kind === "para");
    expect(orig && orig.kind === "para" && plainText(orig.text)).toContain("展開說明");
  });

  it("連續 ≥3 段 → 收斂為清單(各取第一句,≤5 條)", () => {
    const paras = Array.from(
      { length: 6 },
      (_, i) => `第 ${i + 1} 點結論。這一段還有更長的說明文字,只該留在文件態。`
    ).join("\n\n");
    const s = summarizeDoc(ir(`## 頁\n\n${paras}`));
    const list = s.slides[0].blocks.find((b) => b.kind === "list");
    expect(list && list.kind === "list" && list.items.length).toBe(5);
    expect(list && list.kind === "list" && plainText(list.items[0].text)).toBe("第 1 點結論。");
  });

  it("連續 2 段不收斂,各自取第一句", () => {
    const s = summarizeDoc(ir("## 頁\n\n甲句一。甲句二。\n\n乙句一。乙句二。"));
    const paras = s.slides[0].blocks.filter((b) => b.kind === "para");
    expect(paras).toHaveLength(2);
  });

  it("slide: skip → 不進 slide,文件態保留", () => {
    const md = "## 頁\n\n<!-- slide: skip -->\n\n這段只給文件態讀者。\n\n這段兩態都在。";
    const doc = ir(md);
    const s = summarizeDoc(doc);
    expect(s.slides[0].blocks.filter((b) => b.kind === "para")).toHaveLength(1);
    expect(doc.slides[0].blocks.filter((b) => b.kind === "para")).toHaveLength(2);
  });

  it("slide: keep → 全量進 slide(不取第一句)", () => {
    const md = "## 頁\n\n<!-- slide: keep -->\n\n完整句子一。完整句子二也要上台。";
    const s = summarizeDoc(ir(md));
    const para = s.slides[0].blocks.find((b) => b.kind === "para");
    expect(para && para.kind === "para" && plainText(para.text)).toContain("完整句子二");
  });

  it("slide: 自訂字串 → 以該字串當 slide 內容", () => {
    const md = '## 頁\n\n<!-- slide: 三個字 -->\n\n這是一大段文件態的完整論述,很長很長。';
    const doc = ir(md);
    const s = summarizeDoc(doc);
    const para = s.slides[0].blocks.find((b) => b.kind === "para");
    expect(para && para.kind === "para" && plainText(para.text)).toBe("三個字");
    const orig = doc.slides[0].blocks.find((b) => b.kind === "para");
    expect(orig && orig.kind === "para" && plainText(orig.text)).toContain("完整論述");
  });

  it("形狀 block(cards/stat/quote/mermaid/table)原樣保留", () => {
    const md = [
      "## 頁",
      "",
      "- **甲**:說明一",
      "- **乙**:說明二",
      "- **丙**:說明三",
      "",
      "61%,關鍵指標",
      "",
      "> 引言。",
      "> — 出處",
    ].join("\n");
    const doc = ir(md);
    const s = summarizeDoc(doc);
    expect(s.slides[0].blocks.map((b) => b.kind)).toEqual(
      doc.slides[0].blocks.map((b) => b.kind)
    );
  });

  it("投影後重推 layout:多段文件內容收斂後仍為 content;directive 指定不動", () => {
    const md = "## 頁\n\n<!-- layout: quote -->\n\n甲。\n\n乙。\n\n丙。";
    const s = summarizeDoc(ir(md));
    expect(s.slides[0].layout).toBe("quote");
    expect(s.slides[0].layoutSource).toBe("directive");
  });

  it("確定性:同輸入兩次輸出 deep-equal", () => {
    const md = readFileSync(join(__dirname, "../../examples/01-mdshare-product.md"), "utf8");
    const a = summarizeDoc(buildIR(parseMarkdown(md)));
    const b = summarizeDoc(buildIR(parseMarkdown(md)));
    expect(a).toEqual(b);
  });
});

describe("summarizeDoc — 既有黃金樣本不退化", () => {
  // v1 樣本本來就是 slide 密度:投影應近乎恆等(短句取第一句 = 原句、
  // 形狀 block 原樣)。以 snapshot 固定投影結果,防止 summarizer 迭代時退化。
  const dir = join(__dirname, "../../examples");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  for (const file of files) {
    it(`投影 snapshot: ${file}`, () => {
      const doc = buildIR(parseMarkdown(readFileSync(join(dir, file), "utf8")));
      const s = summarizeDoc(doc);
      const digest = s.slides.map((sl) => ({
        layout: sl.layout,
        blocks: sl.blocks.map((b) =>
          "text" in b ? `${b.kind}:${plainText(b.text as never)}` : b.kind
        ),
      }));
      expect(digest).toMatchSnapshot();
    });
  }
});
