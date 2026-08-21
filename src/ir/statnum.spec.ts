import { describe, expect, it } from "vitest";
import { formatStatNumber, splitLeadingNumber, statNumberAttrs } from "./statnum";

describe("splitLeadingNumber — count-up 數值解析", () => {
  const cases: Array<[string, number, string, string, number]> = [
    // 原字串, num, pre, suf, dec
    ["96%", 96, "", "%", 0],
    ["2.84 億", 2.84, "", " 億", 2],
    ["187 家", 187, "", " 家", 0],
    ["61% 營收來自 App 會員", 61, "", "% 營收來自 App 會員", 0],
    ["< 500ms", 500, "< ", "ms", 0],
    ["99.89%", 99.89, "", "%", 2],
    ["129 KB", 129, "", " KB", 0],
    ["20-30%", 20, "", "-30%", 0],
    ["90 萬+", 90, "", " 萬+", 0],
    ["3.5 小時", 3.5, "", " 小時", 1],
    ["NT$1,200", 1200, "NT$", "", 0],
    ["約 45 天", 45, "約 ", " 天", 0],
  ];

  for (const [value, num, pre, suf, dec] of cases) {
    it(`解析「${value}」`, () => {
      const n = splitLeadingNumber(value);
      expect(n, value).not.toBeNull();
      expect(n!.num).toBe(num);
      expect(n!.pre).toBe(pre);
      expect(n!.suf).toBe(suf);
      expect(n!.dec).toBe(dec);
    });
  }

  it("千分位保留(還原後與原字串相同)", () => {
    const n = splitLeadingNumber("10,000+ 小時")!;
    expect(n.num).toBe(10000);
    expect(n.group).toBe(true);
    expect(formatStatNumber(n, 10000)).toBe("10,000+ 小時");
  });

  it("每個可動畫的值:終幀必定等於原字串(無損還原)", () => {
    for (const [value] of cases) {
      const n = splitLeadingNumber(value)!;
      expect(formatStatNumber(n, n.num), value).toBe(value);
    }
  });

  it("count-up 中途值帶著前後綴", () => {
    const n = splitLeadingNumber("< 500ms")!;
    expect(formatStatNumber(n, 250)).toBe("< 250ms");
    const b = splitLeadingNumber("2.84 億")!;
    expect(formatStatNumber(b, 1.5)).toBe("1.50 億");
  });

  it("無數字 / 零 / 無法無損還原 → null(不動畫)", () => {
    expect(splitLeadingNumber("持續成長")).toBeNull();
    expect(splitLeadingNumber("0 MB")).toBeNull();
    expect(splitLeadingNumber("1,0000 元")).toBeNull(); // 非標準千分位
  });

  it("statNumberAttrs:可動畫給 data-*,不可動畫給空物件", () => {
    expect(statNumberAttrs("96%")).toEqual({
      "data-num": "96",
      "data-dec": "0",
      "data-pre": "",
      "data-suf": "%",
    });
    expect(statNumberAttrs("持續成長")).toEqual({});
  });
});
