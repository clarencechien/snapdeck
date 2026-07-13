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

未啟用時一切照舊:API 回 503,前端自動退回 `#s=` 長連結,不會壞。

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
