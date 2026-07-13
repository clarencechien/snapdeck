import { describe, expect, it } from "vitest";
import { sealPayload, openSealed } from "./shortlink";
import { parseShareHash } from "./share";

describe("零知識短連結 — 加密層", () => {
  const payload = {
    md: "---\ntitle: 測試\n---\n\n## 頁\n\n61%,關鍵指標,持續上升",
    template: "craft",
  };

  it("seal → open round-trip", async () => {
    const { body, key } = await sealPayload(payload);
    expect(body.length).toBeGreaterThan(28); // iv(12) + tag(16) + ct
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/); // 128-bit base64url
    const opened = await openSealed(body, key);
    expect(opened).toEqual(payload);
  });

  it("密文是不透明的:不含明文片段", async () => {
    const { body } = await sealPayload(payload);
    const asText = new TextDecoder().decode(body);
    expect(asText).not.toContain("title");
    expect(asText).not.toContain("61%");
  });

  it("金鑰錯誤 → null(不丟例外)", async () => {
    const { body } = await sealPayload(payload);
    const wrong = await sealPayload(payload);
    expect(await openSealed(body, wrong.key)).toBeNull();
  });

  it("密文被竄改 → null(AES-GCM 驗證失敗)", async () => {
    const { body, key } = await sealPayload(payload);
    body[body.length - 1] ^= 0xff;
    expect(await openSealed(body, key)).toBeNull();
  });
});

describe("parseShareHash — #l= 短連結格式", () => {
  it("解析 id 與金鑰", () => {
    const h = parseShareHash("l=Ab3xYz12Qwe.k123-_key");
    expect(h).toEqual({ kind: "stored", id: "Ab3xYz12Qwe", key: "k123-_key", view: "editor" });
  });

  it("帶檢視參數", () => {
    expect(parseShareHash("l=abc12345.key1&v=page")).toMatchObject({ kind: "stored", view: "page" });
    expect(parseShareHash("l=abc12345.key1&p=3")).toMatchObject({
      kind: "stored",
      view: "present",
      presentPage: 3,
    });
  });

  it("inline #s= 仍解析", () => {
    expect(parseShareHash("s=2.AAAA&v=page")).toMatchObject({ kind: "inline", view: "page" });
  });

  it("壞格式 → null", () => {
    expect(parseShareHash("l=noKeyHere")).toBeNull();
    expect(parseShareHash("l=.keyOnly")).toBeNull();
    expect(parseShareHash("x=whatever")).toBeNull();
  });
});
