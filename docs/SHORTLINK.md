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

- **有效期 180 天**(KV `expirationTtl`),過期後連結失效——長連結
  (`#s=`)永久有效,重要內容建議兩種都留。
- 短連結需要網路與這個站存活;`#s=` 長連結離線可解、與站無關
  (任何一份 SnapDeck 部署都能開)。
- 上限 100KB 密文(遠大於實際文件)。
- 未做防濫用限流;若公開部署被濫用,可在 Cloudflare 加 rate limiting rule。
