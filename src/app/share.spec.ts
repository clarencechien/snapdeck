import { describe, expect, it } from "vitest";
import { encodeShare, decodeShare } from "./share";

describe("share link 編碼", () => {
  it("round-trip:中文 + directive + emoji", async () => {
    const md =
      "---\ntitle: 測試 ✨\n---\n\n## 頁一\n\n- **重點**:中文內容與 <!-- notes: 備註 -->\n";
    const encoded = await encodeShare({ md, template: "craft" });
    expect(encoded).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    const decoded = await decodeShare(encoded);
    expect(decoded).toEqual({ md, template: "craft" });
  });

  it("壓縮率:重複性高的 MD 明顯小於原文", async () => {
    const md = "## 頁\n\n- **項目**:說明\n".repeat(80);
    const encoded = await encodeShare({ md, template: "auto" });
    expect(encoded.length).toBeLessThan(md.length / 2);
  });

  it("壞字串回傳 null,不丟例外", async () => {
    expect(await decodeShare("1.!!!not-base64!!!")).toBeNull();
    expect(await decodeShare("9.AAAA")).toBeNull();
    expect(await decodeShare("garbage")).toBeNull();
  });
});
