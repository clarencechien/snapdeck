// POST /api/s 的寫入閘門 —— 對著 worker/index.js 實跑。
//
// 為什麼要有這支:那個端點不需要來源檢查、不需要 Turnstile、不需要任何 token,
// 而 Workers Free plan 的 KV 每天只有 1,000 次寫入 —— 1000 個 curl 就讓短連結
// 功能全天 503。docs/SHORTLINK.md 原本把這個列為「可加 Cloudflare rate limiting
// rule」的已知取捨,但 rate limiting 只壓速率,壓不住 180 天 TTL 的累積量。
//
// 驗證範圍:這支驗的是**閘門的帳目與路由**,用的是假的 KV 與假的 DO storage。
// 它不驗 DO 的 input gate 本身 —— 讓「檢查 + 加一」變原子的是那個,Node 重現不了。
// 不要因為這支綠了就以為併發被測過。

import { describe, expect, it, beforeEach } from "vitest";
import worker, { WriteGate } from "./index.js";

/** 假的 DO:一個真的 WriteGate 實例,storage 換成記憶體 Map。 */
function makeEnv({ withGate = true, kv = true } = {}) {
  const store = new Map();
  const gate = new WriteGate({
    storage: {
      async get(k) { return store.get(k); },
      async put(k, v) { store.set(k, v); },
    },
  });
  const written = [];
  return {
    written,
    store,
    env: {
      ...(kv ? { LINKS: { async put(id, body, opts) { written.push({ id, bytes: body.byteLength, ttl: opts.expirationTtl }); } } } : {}),
      ...(withGate
        ? { WRITE_GATE: { idFromName: () => "global", get: () => ({ fetch: (u, init) => gate.fetch(new Request("https://gate/", init)) }) } }
        : {}),
      ASSETS: { fetch: async () => new Response("asset") },
    },
  };
}

const post = (env, { bytes = 100, ip = "1.1.1.1", headers = {} } = {}) =>
  worker.fetch(
    new Request("https://snapdeck.ai-apps.work/api/s", {
      method: "POST",
      body: new Uint8Array(bytes),
      headers: { "cf-connecting-ip": ip, ...headers },
    }),
    env,
  );

describe("POST /api/s — 寫入閘門", () => {
  let h;
  beforeEach(() => { h = makeEnv(); });

  it("正常的一筆會寫進 KV", async () => {
    const res = await post(h.env);
    expect(res.status).toBe(200);
    expect(h.written).toHaveLength(1);
  });

  it("每 IP 每分鐘 5 次,第 6 次 429", async () => {
    for (let i = 0; i < 5; i++) expect((await post(h.env)).status).toBe(200);
    const sixth = await post(h.env);
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBe("60");
    expect(h.written).toHaveLength(5); // 被擋下來的沒有碰到 KV
  });

  it("換 IP 就重新計算 —— 每 IP 的限制擋不住分散來源", async () => {
    for (let i = 0; i < 5; i++) await post(h.env, { ip: "1.1.1.1" });
    expect((await post(h.env, { ip: "2.2.2.2" })).status).toBe(200);
  });

  it("所以全站每日總量才是真正的天花板:第 501 次 429", async () => {
    // 每個 IP 只借 5 次,湊滿 500
    for (let i = 0; i < 500; i++) {
      const res = await post(h.env, { ip: `10.0.${Math.floor(i / 5 / 256)}.${Math.floor(i / 5) % 256}` });
      expect(res.status).toBe(200);
    }
    const over = await post(h.env, { ip: "9.9.9.9" });
    expect(over.status).toBe(429);
    expect(await over.text()).toContain("daily");
    expect(h.written).toHaveLength(500);
  });

  it("每日計數放在持久儲存,不是記憶體", async () => {
    await post(h.env);
    expect(h.store.get("day")).toMatchObject({ count: 1 });
  });

  it("content-length 超量:在讀 body 之前就 413", async () => {
    const res = await worker.fetch(
      new Request("https://snapdeck.ai-apps.work/api/s", {
        method: "POST",
        body: new Uint8Array(10),
        headers: { "content-length": "200000", "cf-connecting-ip": "1.1.1.1" },
      }),
      h.env,
    );
    expect(res.status).toBe(413);
    expect(h.store.get("day")).toBeUndefined(); // 連閘門都沒走到,不佔額度
  });

  it("body 真的超量也還是 413(沒帶 content-length 的情況)", async () => {
    expect((await post(h.env, { bytes: 100_001 })).status).toBe(413);
  });

  it("太短的 body 是 400", async () => {
    expect((await post(h.env, { bytes: 27 })).status).toBe(400);
  });

  it("瀏覽器的跨站寫入 403", async () => {
    expect((await post(h.env, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await post(h.env, { headers: { "sec-fetch-site": "same-site" } })).status).toBe(403);
    expect((await post(h.env, { headers: { "sec-fetch-site": "same-origin" } })).status).toBe(200);
    expect((await post(h.env, { headers: { "sec-fetch-site": "none" } })).status).toBe(403);
  });

  it("沒有 Sec-Fetch-Site 就放行 —— 非瀏覽器的正當用途不該被擋", async () => {
    expect((await post(h.env)).status).toBe(200);
  });

  it("TTL 依大小分級", async () => {
    await post(h.env, { bytes: 20_000 });
    await post(h.env, { bytes: 20_001 });
    expect(h.written[0].ttl).toBe(60 * 60 * 24 * 180);
    expect(h.written[1].ttl).toBe(60 * 60 * 24 * 30);
  });

  it("閘門壞掉是 fail-closed(503),不是變成沒有閘門", async () => {
    const env = {
      ...h.env,
      WRITE_GATE: { idFromName: () => "g", get: () => ({ fetch: () => { throw new Error("boom"); } }) },
    };
    const res = await post(env);
    expect(res.status).toBe(503);
    expect(h.written).toHaveLength(0);
  });

  it("沒綁 KV 還是 503,前端照舊退回長連結", async () => {
    const { env } = makeEnv({ kv: false });
    expect((await post(env)).status).toBe(503);
  });

  it("GET 讀取不受閘門影響", async () => {
    const env = { ...h.env, LINKS: { ...h.env.LINKS, async get() { return new Uint8Array(40).buffer; } } };
    const res = await worker.fetch(new Request("https://snapdeck.ai-apps.work/api/s/AbCdEfGhIjK"), env);
    expect(res.status).toBe(200);
  });
});
