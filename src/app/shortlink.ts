// 零知識短連結(仿 PrivateBin):
//   1. 內容先走 encodeShare 壓縮 → 瀏覽器內 AES-GCM 加密
//   2. 只把「密文」POST 到 /api/s(Cloudflare KV),取得短 id
//   3. 短連結 = /#l=<id>.<金鑰>——金鑰在 URL fragment,永遠不會隨
//      HTTP 請求送出;伺服器只存亂碼,無法解密(零知識)
// 服務未設定 KV 時 API 回 503,呼叫端退回長連結(優雅降級)。

import type { SharePayload } from "./share";
import { encodeShare, decodeShare, bytesToB64Url, b64UrlToBytes } from "./share";

const IV_LEN = 12;

/** 壓縮 + 加密:回傳可上傳的密文(iv 前綴)與 base64url 金鑰。純函式,可測。 */
export async function sealPayload(
  payload: SharePayload
): Promise<{ body: Uint8Array; key: string }> {
  const encoded = await encodeShare(payload);
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 128 }, true, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(encoded))
  );
  const body = new Uint8Array(IV_LEN + ct.length);
  body.set(iv);
  body.set(ct, IV_LEN);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKey));
  return { body, key: bytesToB64Url(rawKey) };
}

/** 解密 + 解壓。金鑰錯誤或密文被動過 → null(AES-GCM 驗證失敗)。 */
export async function openSealed(bytes: Uint8Array, key: string): Promise<SharePayload | null> {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      b64UrlToBytes(key) as BufferSource,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, IV_LEN) as BufferSource },
      cryptoKey,
      bytes.slice(IV_LEN) as BufferSource
    );
    return decodeShare(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

/** 上傳密文取得短 id;服務未啟用(503)或失敗 → null,呼叫端 fallback 長連結 */
export async function uploadSealed(body: Uint8Array): Promise<string | null> {
  try {
    const res = await fetch("/api/s", { method: "POST", body: body as BodyInit });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    return typeof json.id === "string" ? json.id : null;
  } catch {
    return null;
  }
}

export async function fetchSealed(id: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`/api/s/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function resolveShortLink(id: string, key: string): Promise<SharePayload | null> {
  const bytes = await fetchSealed(id);
  if (!bytes) return null;
  return openSealed(bytes, key);
}
