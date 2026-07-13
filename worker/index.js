// SnapDeck Worker:靜態資產 + 零知識短連結 API。
// 伺服器只儲存瀏覽器端加密後的密文;解密金鑰在 URL fragment,
// 永遠不會出現在請求中——營運者無法讀取任何內容。
// 未綁定 KV(env.LINKS 不存在)時 API 回 503,前端自動退回長連結。
// 啟用方式見 docs/SHORTLINK.md。

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 天
const MAX_BYTES = 100_000;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function genId(len = 11) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/s" || url.pathname.startsWith("/api/s/")) {
      if (!env.LINKS) {
        return new Response("shortlink storage not configured", { status: 503 });
      }

      if (request.method === "POST" && url.pathname === "/api/s") {
        const body = await request.arrayBuffer();
        if (body.byteLength > MAX_BYTES) return new Response("payload too large", { status: 413 });
        if (body.byteLength < 28) return new Response("bad request", { status: 400 });
        const id = genId();
        await env.LINKS.put(id, body, { expirationTtl: TTL_SECONDS });
        return Response.json({ id, ttlDays: TTL_SECONDS / 86400 });
      }

      const m = /^\/api\/s\/([A-Za-z0-9]{8,32})$/.exec(url.pathname);
      if (request.method === "GET" && m) {
        const data = await env.LINKS.get(m[1], "arrayBuffer");
        if (!data) return new Response("not found or expired", { status: 404 });
        return new Response(data, {
          headers: {
            "content-type": "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      }

      return new Response("method not allowed", { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
