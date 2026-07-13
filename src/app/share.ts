// Share link:仿 PlantUML 的 URL 編碼 —— MD + template 壓縮後放進
// URL hash fragment(#s=…)。fragment 不會送到伺服器、不進 access log,
// 維持「文件內容不出瀏覽器」;解碼端也完全在瀏覽器內完成。
//
// 格式 v2(現行):#s=2.<base64url(deflate-raw(template + "\0" + md))>
//   — 不經 JSON(JSON 會把每個換行轉義成兩字元、加引號括號,MD 換行多,
//     拆掉可再省一點)。NUL 作分隔符,不會出現在合法 MD 中。
// 格式 v1(相容讀取):#s=1.<base64url(deflate-raw(JSON{m,t}))>
// 可附加簡報深連結:#s=<payload>&p=<頁碼> → 開啟即進簡報模式該頁。

export type SharePayload = {
  md: string;
  /** template override("auto" = 跟隨文件 frontmatter) */
  template: string;
};

const VERSION = "2";

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  const out = new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>)
  );
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  const raw = `${payload.template}\u0000${payload.md}`;
  const compressed = await pipeThrough(
    new TextEncoder().encode(raw),
    new CompressionStream("deflate-raw")
  );
  return `${VERSION}.${bytesToBase64Url(compressed)}`;
}

export async function decodeShare(encoded: string): Promise<SharePayload | null> {
  try {
    const dot = encoded.indexOf(".");
    if (dot === -1) return null;
    const version = encoded.slice(0, dot);
    const bytes = base64UrlToBytes(encoded.slice(dot + 1));
    const text = new TextDecoder().decode(
      await pipeThrough(bytes, new DecompressionStream("deflate-raw"))
    );
    if (version === "2") {
      const nul = text.indexOf("\u0000");
      if (nul === -1) return null;
      return { template: text.slice(0, nul) || "auto", md: text.slice(nul + 1) };
    }
    if (version === "1") {
      const obj = JSON.parse(text) as { m?: unknown; t?: unknown };
      if (typeof obj.m !== "string") return null;
      return { md: obj.m, template: typeof obj.t === "string" ? obj.t : "auto" };
    }
    return null;
  } catch {
    return null;
  }
}

export type ShareView = "editor" | "page" | "present";

export async function buildShareUrl(
  payload: SharePayload,
  opts: { view?: ShareView; presentPage?: number } = {}
): Promise<string> {
  const encoded = await encodeShare(payload);
  const url = new URL(window.location.href);
  url.search = "";
  let hash = `s=${encoded}`;
  if (opts.view === "page") hash += "&v=page";
  if (opts.view === "present") hash += `&p=${opts.presentPage ?? 1}`;
  url.hash = hash;
  return url.toString();
}

export type ShareHash = { encoded: string; view: ShareView; presentPage?: number };

/** 讀取網址上的分享 payload(含選配的檢視模式/簡報頁碼) */
export function readShareHash(): ShareHash | null {
  const hash = window.location.hash.slice(1);
  if (!hash.startsWith("s=")) return null;
  const params = new URLSearchParams(hash);
  const encoded = params.get("s");
  if (!encoded) return null;
  const p = parseInt(params.get("p") ?? "", 10);
  if (Number.isFinite(p) && p >= 1) return { encoded, view: "present", presentPage: p };
  if (params.get("v") === "page") return { encoded, view: "page" };
  return { encoded, view: "editor" };
}

export function clearShareHash(): void {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
