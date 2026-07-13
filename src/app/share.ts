// Share link:仿 PlantUML 的 URL 編碼 —— MD + template 壓縮後放進
// URL hash fragment(#s=…)。fragment 不會送到伺服器、不進 access log,
// 維持「文件內容不出瀏覽器」;解碼端也完全在瀏覽器內完成。
// 格式:#s=1.<base64url(deflate-raw(JSON{m,t}))>,前綴 1 為版本號。

export type SharePayload = {
  md: string;
  /** template override("auto" = 跟隨文件 frontmatter) */
  template: string;
};

const VERSION = "1";

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
  const json = JSON.stringify({ m: payload.md, t: payload.template });
  const compressed = await pipeThrough(
    new TextEncoder().encode(json),
    new CompressionStream("deflate-raw")
  );
  return `${VERSION}.${bytesToBase64Url(compressed)}`;
}

export async function decodeShare(encoded: string): Promise<SharePayload | null> {
  try {
    const dot = encoded.indexOf(".");
    if (dot === -1 || encoded.slice(0, dot) !== VERSION) return null;
    const bytes = base64UrlToBytes(encoded.slice(dot + 1));
    const json = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
    const obj = JSON.parse(new TextDecoder().decode(json)) as { m?: unknown; t?: unknown };
    if (typeof obj.m !== "string") return null;
    return { md: obj.m, template: typeof obj.t === "string" ? obj.t : "auto" };
  } catch {
    return null;
  }
}

export async function buildShareUrl(payload: SharePayload): Promise<string> {
  const encoded = await encodeShare(payload);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `s=${encoded}`;
  return url.toString();
}

/** 讀取並清除網址上的分享 payload(留下乾淨網址) */
export function readShareHash(): string | null {
  const m = /^#s=(.+)$/.exec(window.location.hash);
  return m ? m[1] : null;
}

export function clearShareHash(): void {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
