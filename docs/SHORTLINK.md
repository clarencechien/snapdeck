# 零知識短連結 — 啟用指南

長文件的 `#s=` 分享連結可達數千字元,通訊軟體與傳統縮址服務(bit.ly 等)
會截斷或拒收。SnapDeck 內建**零知識短連結**:連結縮到約 60 字元,而且
**伺服器讀不到任何內容**。

## 運作原理(為什麼是零知識)

1. 內容在**瀏覽器內**壓縮後以 AES-GCM(128-bit 隨機金鑰)加密。
2. 只有**密文**上傳到 Cloudflare KV,取得短 id(180 天後自動過期)。
3. 短連結:`https://<host>/#l=<id>.<金鑰>` —— 金鑰放在 URL fragment,
   **瀏覽器永遠不會把 fragment 送到伺服器**,所以 KV 裡只有解不開的亂碼。
4. 開啟連結時,瀏覽器抓回密文、用 fragment 裡的金鑰在本地解密。
   金鑰錯誤或密文被動過,AES-GCM 驗證直接失敗。

與 PrivateBin / Firefox Send 同一套模式。營運者(以及 Cloudflare)
只看得到:一筆不透明的 blob、建立時間。沒有金鑰,內容無法還原。

## 啟用步驟(一次性,約 2 分鐘)

1. 建立 KV namespace:

   ```bash
   npx wrangler kv namespace create LINKS
   ```

   輸出會給你一個 `id`。

2. 編輯 `wrangler.jsonc`,把檔尾註解掉的區塊打開並填入 id:

   ```jsonc
   "kv_namespaces": [
     { "binding": "LINKS", "id": "<步驟 1 的 id>" }
   ]
   ```

3. push(或 `npx wrangler deploy`)。完成。

   ⚠ **`id` 要填 32 碼十六進位的 namespace ID,不是名稱**。填成名稱
   (如 `snapdeck.kv`)部署會失敗,錯誤碼 10042。ID 查法:
   `npx wrangler kv namespace list`,或 Dashboard → Storage & Databases
   → KV → 該 namespace 列的 ID 欄。

未啟用時一切照舊:API 回 503,前端自動退回 `#s=` 長連結,不會壞。

## 怎麼確認 worker 部署到哪一版

開 `https://<host>/api/health`:

| 回應 | 意義 |
|---|---|
| `{"worker":true,"kv":true,...}` | worker 已部署且 KV 已綁定,短連結可用 |
| `{"worker":true,"kv":false,...}` | worker 已部署,但 KV 未綁定(API 回 503,前端退長連結) |
| 回到 HTML(SnapDeck 頁面) | 線上還是舊版 assets-only 部署,worker 沒上去 |

**部署失敗 = 線上維持上一版**(Cloudflare 不會半套上線)。build log 最後
必須看到 deploy 成功而非 `Failed`;失敗時前一版繼續服務,不影響網站。

## 疑難排解

- **`KV namespace '…' is not valid [code: 10042]`**:`id` 填到名稱了,
  換成 32 碼 hex ID(見上)。
- **health 顯示 kv:false 但已填 id**:確認 id 屬於同一個 Cloudflare
  帳號、`kv_namespaces` 區塊在 JSON 中有效(注意前導逗號)。
- **勾了短連結仍複製出長連結**:toast 會註明「短連結服務未啟用」;
  先看 /api/health。

## 使用

「⛓ 分享」選單勾選「⚡ 產生短連結」(記住選擇),之後三種分享連結
(編輯/閱讀頁/簡報)都會走短連結;服務失敗時自動退回長連結並提示。

## 邊界與取捨

- **有效期依大小分級**(KV `expirationTtl`):20 KB 以下 180 天,以上 30 天。
  過期後連結失效——長連結(`#s=`)永久有效,重要內容建議兩種都留。
- 短連結需要網路與這個站存活;`#s=` 長連結離線可解、與站無關
  (任何一份 SnapDeck 部署都能開)。
- 上限 100KB 密文(遠大於實際文件)。`content-length` 超量在讀 body 之前就 413。
- **已在 code 內限流**(2026-09-04):每 IP 每分鐘 5 次、全站每天 500 次,
  瀏覽器的跨站寫入(`Sec-Fetch-Site` 不是 `same-origin`)403。
  撞上限回 429,前端本來就會退回長連結,站不會壞。

  這一節原本寫的是「未做防濫用限流;可在 Cloudflare 加 rate limiting rule」。
  那個推理不完整,四點:

  1. Workers Free plan 的 KV **每日 1,000 次寫入** —— 1000 個 `curl` 就讓短連結
     功能全天 503。實測改動前的 worker:同一個 IP 連打 1000 次,1000 次全部寫進 KV。
  2. Paid plan 下 storage 以 GB-月計費,而物件活 180 天。**rate limiting 只壓速率,
     不壓累積量** —— 每分鐘擋到剩幾筆,乘上 180 天還是很可觀。
  3. worker 不檢查上傳內容是不是密文(也檢查不了,它就該是不透明的),任何
     ≥ 28 bytes 的 blob 都收 —— 等同一個匿名的 100 KB 檔案暫存。
  4. dashboard 上的規則在 repo 裡看不到,壞了或被改掉沒有人會發現。

  所以閘門放在 code 裡,而且是兩層:每 IP 的速率擋單點灌爆,**全站每日總量**
  擋分散來源 —— 第二層才是真正的天花板。兩層都在 Durable Object 裡做,因為
  DO 的 input gate 讓「讀計數 → 判斷 → 加一」是原子的;在 Worker 裡做就是
  read-then-act,並行 N 條每條看到的都是舊值。每日計數放 DO 的持久儲存
  (DO 會被回收,記憶體歸零等於上限重新開始);每 IP 的視窗留在記憶體,
  它只需要涵蓋 60 秒,漏網由每日總量兜底。

  回歸測試:`npx vitest run worker/gate.spec.js`。
  **驗證範圍**:那 14 個案例驗的是閘門的帳目與路由,用假的 KV 與假的 DO storage,
  **不驗 DO 的 input gate 本身** —— 讓「檢查 + 加一」變原子的正是那個,Node 重現不了。
