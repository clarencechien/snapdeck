// 黃金樣本 IR snapshot 測試(HANDOFF M1 驗收)。

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdown } from "../parser/parse";
import { buildIR } from "./buildIR";

const dir = join(__dirname, "../../examples");
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

describe("buildIR — golden samples", () => {
  it("有 6 份黃金樣本(產、銷、人、發、財 + 產品規劃)", () => {
    expect(files.length).toBe(6);
  });

  for (const file of files) {
    it(`IR snapshot: ${file}`, () => {
      const md = readFileSync(join(dir, file), "utf8");
      const ir = buildIR(parseMarkdown(md));
      expect(ir).toMatchSnapshot();
    });
  }
});

describe("design rules", () => {
  const ir = (md: string) => buildIR(parseMarkdown(md));

  it("rule 1:frontmatter 存在 → 第一頁 title layout", () => {
    const doc = ir("---\ntitle: T\nauthor: A\n---\n\n## 頁一\n\n內容");
    expect(doc.slides[0].layout).toBe("title");
    expect(doc.slides[1].layout).toBe("content");
  });

  it("rule 1:無 frontmatter → 無 title slide", () => {
    const doc = ir("## 頁一\n\n一般內容,不觸發任何形狀規則。");
    expect(doc.slides[0].layout).toBe("content");
  });

  it("rule 2:H2 開新頁;--- 強制分頁;單獨 H1 → section", () => {
    const doc = ir("# 章節\n\n## A\n\n甲\n\n乙說明文字\n\n---\n\n丙說明文字\n\n## B\n\n丁");
    expect(doc.slides.map((s) => s.layout)).toEqual(["section", "content", "content", "content"]);
    expect(doc.slides[0].headingPath).toEqual(["章節"]);
    expect(doc.slides[2].headingPath).toEqual(["章節", "A"]);
  });

  it("rule 3:layout directive 覆蓋推斷", () => {
    const doc = ir("## 頁\n\n<!-- layout: quote -->\n\n一般段落內容而已");
    expect(doc.slides[0].layout).toBe("quote");
    expect(doc.slides[0].layoutSource).toBe("directive");
  });

  it("rule 4:≥3 項「**粗體**:說明」清單 → cards", () => {
    const doc = ir("## 頁\n\n- **甲**:說明一\n- **乙**:說明二\n- **丙**:說明三");
    const slide = doc.slides[0];
    expect(slide.layout).toBe("cards");
    const list = slide.blocks.find((b) => b.kind === "list");
    expect(list && list.kind === "list" && list.shape).toBe("cards");
    expect(list && list.kind === "list" && list.items[0].term).toBe("甲");
  });

  it("rule 4:有序清單 ≤5 → steps", () => {
    const doc = ir("## 頁\n\n1. 第一步\n2. 第二步\n3. 第三步");
    const list = doc.slides[0].blocks.find((b) => b.kind === "list");
    expect(list && list.kind === "list" && list.shape).toBe("steps");
  });

  it("rule 5:數字開頭短段落(無逗號)→ 整段即大字", () => {
    const doc = ir("## 頁\n\n96% 試產良率");
    const slide = doc.slides[0];
    expect(slide.layout).toBe("big-stat");
    const stat = slide.blocks.find((b) => b.kind === "stat");
    expect(stat && stat.kind === "stat" && stat.value).toBe("96% 試產良率");
  });

  it("rule 5(v4):第一個逗號前的全部 = 大字", () => {
    const doc = ir("## 頁\n\n61% 營收來自 App 會員,首次過半後持續攀升");
    const stat = doc.slides[0].blocks.find((b) => b.kind === "stat");
    expect(stat && stat.kind === "stat" && stat.value).toBe("61% 營收來自 App 會員");
    expect(stat && stat.kind === "stat" && stat.label).toBe("首次過半後持續攀升");
    expect(doc.slides[0].layout).toBe("big-stat");
  });

  it("rule 5(v4):比較符號/範圍/任意單位全進大字(使用者案例)", () => {
    const cases: Array<[string, string, string]> = [
      ["99.89%,體積縮減率,透過 esbuild 達成優化", "99.89%", "體積縮減率"],
      ["129 KB,Node.js 腳本,最輕量的執行方案", "129 KB", "Node.js 腳本"],
      ["0 MB,安裝空間,直接透過 NPX 執行即可", "0 MB", "安裝空間"],
      ["< 500ms,簡單查詢響應,極速回傳資料", "< 500ms", "簡單查詢響應"],
      ["< 10s,萬筆資料匯出,維持低記憶體佔用", "< 10s", "萬筆資料匯出"],
      ["20-30%,效能提升幅度,導入資料庫連線池技術", "20-30%", "效能提升幅度"],
    ];
    for (const [line, value, label] of cases) {
      const doc = ir(`## 頁\n\n${line}`);
      const stat = doc.slides[0].blocks.find((b) => b.kind === "stat");
      expect(stat && stat.kind === "stat" && stat.value, line).toBe(value);
      expect(stat && stat.kind === "stat" && stat.label, line).toBe(label);
    }
  });

  it("rule 5(v4):千分位逗號不是欄位分隔", () => {
    const doc = ir("## 頁\n\n10,000+ 小時,喜劇內容總製作量");
    const stat = doc.slides[0].blocks.find((b) => b.kind === "stat");
    expect(stat && stat.kind === "stat" && stat.value).toBe("10,000+ 小時");
    expect(stat && stat.kind === "stat" && stat.label).toBe("喜劇內容總製作量");
  });

  it("rule 5:超過 40 字不升格 stat(graceful degradation)", () => {
    const doc = ir(
      "## 頁\n\n42% 的成本來自閒置節點,但這句話實在太長太長了所以完全不應該被升格成大數字版面,應該維持一般段落呈現才對"
    );
    expect(doc.slides[0].blocks.find((b) => b.kind === "stat")).toBeUndefined();
  });

  it("rule 5:無逗號且 >20 字不升格 stat", () => {
    const doc = ir("## 頁\n\n42% 的季度成本全部來自那些閒置太久的邊緣節點群");
    expect(doc.slides[0].blocks.find((b) => b.kind === "stat")).toBeUndefined();
  });

  it("rule 5(v3):+ 與單位進大字(value),逗號後為標籤", () => {
    const doc = ir("## 頁\n\n10,000+ 小時,喜劇內容與旅遊節目總時數");
    const stat = doc.slides[0].blocks.find((b) => b.kind === "stat");
    expect(stat && stat.kind === "stat" && stat.value).toBe("10,000+ 小時");
    expect(stat && stat.kind === "stat" && stat.label).toBe("喜劇內容與旅遊節目總時數");
    expect(doc.slides[0].layout).toBe("big-stat");
  });

  it("rule 5(v3):單位後綴 + 也進大字", () => {
    const doc = ir("## 頁\n\n90 萬+,App 會員數");
    const stat = doc.slides[0].blocks.find((b) => b.kind === "stat");
    expect(stat && stat.kind === "stat" && stat.value).toBe("90 萬+");
    expect(stat && stat.kind === "stat" && stat.label).toBe("App 會員數");
  });

  it("dashboard:連續 ≥2 段數字短句 → 多 stat + big-stat layout", () => {
    const doc = ir("## 頁\n\n2.84 億,季營收,年增 18%\n\n187 家,門市總數\n\n61%,會員貢獻營收");
    const stats = doc.slides[0].blocks.filter((b) => b.kind === "stat");
    expect(stats).toHaveLength(3);
    expect(doc.slides[0].layout).toBe("big-stat");
    const first = stats[0];
    expect(first.kind === "stat" && first.value).toBe("2.84 億");
    expect(first.kind === "stat" && first.label).toBe("季營收");
    expect(first.kind === "stat" && first.caption).toBe("年增 18%");
  });

  it("rule 6:整頁只有 quote → quote layout,含出處", () => {
    const doc = ir("## 頁\n\n> 名言警句。\n> — 某人");
    const slide = doc.slides[0];
    expect(slide.layout).toBe("quote");
    const q = slide.blocks.find((b) => b.kind === "quote");
    expect(q && q.kind === "quote" && q.cite).toBe("某人");
  });

  it("rule 7:mermaid 為主 → diagram layout", () => {
    const doc = ir("## 頁\n\n```mermaid\nflowchart LR\n  A --> B\n```");
    expect(doc.slides[0].layout).toBe("diagram");
  });

  it("two-col + split → columns", () => {
    const doc = ir(
      "## 頁\n\n<!-- layout: two-col -->\n\n左欄內容\n\n<!-- split -->\n\n右欄內容"
    );
    const slide = doc.slides[0];
    expect(slide.layout).toBe("two-col");
    expect(slide.columns?.[0]).toHaveLength(1);
    expect(slide.columns?.[1]).toHaveLength(1);
  });

  it("notes / skip / fit / emphasis directive", () => {
    const doc = ir(
      "## 頁\n\n<!-- fit -->\n<!-- skip -->\n\n<!-- emphasis -->\n\n重點段落\n\n<!-- notes: 講稿 -->"
    );
    const slide = doc.slides[0];
    expect(slide.skip).toBe(true);
    expect(slide.fit).toBe(true);
    expect(slide.notes).toBe("講稿");
    const para = slide.blocks.find((b) => b.kind === "para");
    expect(para && "emphasis" in para && para.emphasis).toBe(true);
  });
});
