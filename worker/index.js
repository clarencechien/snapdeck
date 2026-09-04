// SnapDeck Worker:靜態資產 + 零知識短連結 API。
// 伺服器只儲存瀏覽器端加密後的密文;解密金鑰在 URL fragment,
// 永遠不會出現在請求中——營運者無法讀取任何內容。
// 未綁定 KV(env.LINKS 不存在)時 API 回 503,前端自動退回長連結。
// 啟用方式見 docs/SHORTLINK.md。

/**
 * 密文的保存期,依大小分級。
 *
 * 以前一律 180 天。問題不在單一連結的壽命,在**累積量**:物件活 180 天,
 * 而速率限制只壓速率不壓累積 —— 每分鐘擋到剩幾筆,乘上 180 天還是很可觀。
 * 大的東西留短一點,小的(絕大多數,實際文件都遠小於 20 KB)照舊。
 */
const TTL_SMALL = 60 * 60 * 24 * 180; // 180 天
const TTL_LARGE = 60 * 60 * 24 * 30; //  30 天
const SMALL_BYTES = 20_000;

const MAX_BYTES = 100_000;
const MIN_BYTES = 28; // iv(12) + GCM tag(16)
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const ttlFor = (bytes) => (bytes <= SMALL_BYTES ? TTL_SMALL : TTL_LARGE);

function genId(len = 11) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}

// ---------------------------------------------------------------------------
// 寫入閘門
//
// POST /api/s 不需要來源檢查、不需要 Turnstile、不需要任何 token —— 這是刻意的,
// 零知識短連結沒有帳號可綁。但「誰都能寫」不等於「誰都能無限寫」:
//
//   1. Workers Free plan 的 KV 每日 1,000 次寫入。1000 個 curl 就讓短連結
//      功能全天 503,不需要任何技巧。
//   2. Paid plan 下 storage 以 GB-月計費,而物件活 180 天 —— 速率限制只壓
//      速率,不壓累積量。
//   3. worker 不檢查上傳內容是不是密文(也檢查不了,它就該是不透明的),
//      任何 >= 28 bytes 的 blob 都收 —— 等同一個匿名的 100 KB 檔案暫存。
//
// 所以閘門有兩層:每 IP 每分鐘的速率,加上**全站每日寫入總量**。第二層是重點,
// 第一層擋不住分散來源。兩層都放在 DO 裡做,因為 DO 的 input gate 讓
// 「讀計數 → 判斷 → 加一」是原子的;在 Worker 裡做就是 read-then-act,
// 並行 N 條每條看到的都是舊值。
//
// 每日計數放 DO 的持久儲存(不是記憶體):DO 會被回收,記憶體歸零等於當天上限
// 重新開始。每 IP 的視窗則刻意留在記憶體 —— 它只需要涵蓋 60 秒,回收造成的
// 漏網由每日總量兜底,不值得為它多付一次持久寫入。
// ---------------------------------------------------------------------------

/** 每個 IP 每分鐘可以寫幾次。 */
const PER_IP_PER_MIN = 5;

/**
 * 全站每天最多寫幾次。Free plan 的 KV 是每日 1,000 次寫入,取一半 ——
 * 剩下的留給正常使用與突發,而且撞到這個上限時受影響的只有短連結:
 * 前端本來就會退回長連結,站不會壞。
 */
const DAILY_WRITES = 500;

const IP_WINDOW_MS = 60_000;

export class WriteGate {
  constructor(state) {
    this.state = state;
    /** @type {Map<string, number[]>} IP → 最近一分鐘內的寫入時間 */
    this.recent = new Map();
  }

  async fetch(request) {
    const { ip } = await request.json();
    const now = Date.now();

    // --- 每 IP 每分鐘 ---
    const hits = (this.recent.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    if (hits.length >= PER_IP_PER_MIN) {
      return Response.json({ ok: false, reason: "ip", retryAfter: 60 }, { status: 200 });
    }

    // --- 全站每日 ---
    // 日界線用 UTC:換算成當地時區只會讓「今天是哪天」在兩個地方各算一次。
    const day = new Date(now).toISOString().slice(0, 10);
    const stored = (await this.state.storage.get("day")) ?? { day, count: 0 };
    const count = stored.day === day ? stored.count : 0;
    if (count >= DAILY_WRITES) {
      return Response.json({ ok: false, reason: "daily", retryAfter: 3600 }, { status: 200 });
    }

    // 兩關都過了才記帳。DO 的 input gate 讓這一整段對同一個物件是序列化的,
    // 所以「檢查 + 加一」之間沒有窗口。
    await this.state.storage.put("day", { day, count: count + 1 });
    hits.push(now);
    this.recent.set(ip, hits);
    return Response.json({ ok: true }, { status: 200 });
  }
}

/**
 * @returns {Promise<Response|null>} 擋下來時回 429,放行回 null。
 *   DO 出錯時回 503(fail-closed)—— 閘門壞掉的時候不該變成沒有閘門。
 */
async function checkWriteGate(request, env) {
  if (!env.WRITE_GATE) return null; // 沒綁 DO 的舊部署:維持原本行為
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  try {
    const stub = env.WRITE_GATE.get(env.WRITE_GATE.idFromName("global"));
    const res = await stub.fetch("https://gate/", {
      method: "POST",
      body: JSON.stringify({ ip }),
    });
    const verdict = await res.json();
    if (verdict.ok) return null;
    return new Response(
      verdict.reason === "daily"
        ? "daily write limit reached; use the long link (#s=)"
        : "too many requests; use the long link (#s=)",
      { status: 429, headers: { "retry-after": String(verdict.retryAfter) } },
    );
  } catch {
    return new Response("write gate unavailable", { status: 503 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 部署狀態探針:worker 有部署就回 JSON;kv=true 代表短連結已啟用。
    // 舊版(assets-only)會回 index.html —— 一眼分辨部署到哪一版。
    if (url.pathname === "/api/health") {
      return Response.json({
        worker: true,
        kv: Boolean(env.LINKS),
        gate: Boolean(env.WRITE_GATE),
        version: "0.6",
      });
    }

    if (url.pathname === "/api/s" || url.pathname.startsWith("/api/s/")) {
      if (!env.LINKS) {
        return new Response("shortlink storage not configured", { status: 503 });
      }

      if (request.method === "POST" && url.pathname === "/api/s") {
        // 瀏覽器發的跨站請求擋在這裡。擋不到 curl(標頭是它自己說的),
        // 但擋得掉「別的網站放一段 script 幫忙灌爆」這一種。
        // 沒有這個標頭的一律放行:非瀏覽器的正當用途(自己的腳本)不該被擋。
        const site = request.headers.get("sec-fetch-site");
        if (site && site !== "same-origin") {
          return new Response("cross-site writes are not allowed", { status: 403 });
        }

        // content-length 先看再讀 body。原本是 await arrayBuffer() 之後才比對
        // 上限 —— 也就是超量的東西已經整份收進記憶體了才被拒絕。
        const declared = Number(request.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          return new Response("payload too large", { status: 413 });
        }

        const blocked = await checkWriteGate(request, env);
        if (blocked) return blocked;

        const body = await request.arrayBuffer();
        // 沒帶 content-length(chunked)時這裡才是唯一的把關,所以留著。
        if (body.byteLength > MAX_BYTES) return new Response("payload too large", { status: 413 });
        if (body.byteLength < MIN_BYTES) return new Response("bad request", { status: 400 });
        const id = genId();
        const ttl = ttlFor(body.byteLength);
        await env.LINKS.put(id, body, { expirationTtl: ttl });
        return Response.json({ id, ttlDays: ttl / 86400 });
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
