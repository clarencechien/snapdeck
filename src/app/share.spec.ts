import { describe, expect, it } from "vitest";
import { encodeShare, decodeShare } from "./share";

async function deflateRaw(text: string): Promise<Uint8Array> {
  const out = new Response(
    new Blob([new TextEncoder().encode(text) as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw") as ReadableWritablePair<Uint8Array, Uint8Array>)
  );
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("share link 編碼", () => {
  it("v2 round-trip:中文 + directive + emoji", async () => {
    const md =
      "---\ntitle: 測試 ✨\n---\n\n## 頁一\n\n- **重點**:中文內容與 <!-- notes: 備註 -->\n";
    const encoded = await encodeShare({ md, template: "craft" });
    expect(encoded).toMatch(/^2\.[A-Za-z0-9_-]+$/);
    const decoded = await decodeShare(encoded);
    expect(decoded).toEqual({ md, template: "craft" });
  });

  it("v1(JSON 格式)仍可解碼 — 舊分享連結不失效", async () => {
    const md = "## 舊連結\n\n內容";
    const v1 = `1.${toBase64Url(await deflateRaw(JSON.stringify({ m: md, t: "midnight" })))}`;
    const decoded = await decodeShare(v1);
    expect(decoded).toEqual({ md, template: "midnight" });
  });

  it("v2 比 v1 短(拆掉 JSON 換行轉義層)", async () => {
    const md = "## 頁\n\n- **項目**:說明文字\n\n一般段落。\n".repeat(40);
    const v2 = await encodeShare({ md, template: "auto" });
    const v1 = `1.${toBase64Url(await deflateRaw(JSON.stringify({ m: md, t: "auto" })))}`;
    expect(v2.length).toBeLessThan(v1.length);
  });

  it("壓縮率:重複性高的 MD 明顯小於原文", async () => {
    const md = "## 頁\n\n- **項目**:說明\n".repeat(80);
    const encoded = await encodeShare({ md, template: "auto" });
    expect(encoded.length).toBeLessThan(md.length / 2);
  });

  it("壞字串回傳 null,不丟例外", async () => {
    expect(await decodeShare("2.!!!not-base64!!!")).toBeNull();
    expect(await decodeShare("9.AAAA")).toBeNull();
    expect(await decodeShare("garbage")).toBeNull();
  });
});
