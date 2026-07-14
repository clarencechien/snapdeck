# Drop Mode 分享 — 計劃與實作記錄

狀態:**已實作**(2026-07-13,方案 A)。本文件保留原計劃,實作差異見文末附註。

實際限制補充(使用者提供的 Drop Q&A):匿名網址 **60 分鐘**有效、
上傳 **zip 或資料夾**、根目錄必須有 **index.html**、單檔 ≤25MB、
總量 ≤100MB、檔數 ≤2000。SnapDeck 產出單一 index.html 的 zip
(典型 30–300KB),全部遠低於限制。

## 0. 一句話

把整份簡報變成**一個自含的「可播放簡報 HTML」**,丟上 **Cloudflare Drop**
秒得一條 `*.workers.dev` 臨時網址——收到連結的人打開就是全螢幕簡報,
像 Claude 的 share 頁一樣是「一個活的網站」,而不是一條要回本站解碼的連結。

## 1. Cloudflare Drop 調查結果(2026-07-08 上線)

| 項目 | 事實 |
|---|---|
| 是什麼 | 拖一個資料夾或 zip 到 cloudflare.com/drop,秒得一個 live HTTPS 靜態站(`*.workers.dev`),**免帳號、免 CLI、免 build** |
| 臨時網址壽命 | **1 小時**;期間可按 **Claim** 登入/註冊 Cloudflare 帳號轉為永久部署 |
| 支援內容 | 靜態 HTML/CSS/JS/圖片/字型 |
| 底層機制 | 臨時 sandbox 帳號(拋棄式),Claim 後轉入正式帳號 |
| **API / 程式化上傳** | **官方文件與所有評測皆未提及任何 API**——目前只有瀏覽器拖放 UI |
| 大小/檔數上限 | 官方未載明 |

來源:
- [Cloudflare Changelog — Cloudflare Drop](https://developers.cloudflare.com/changelog/post/2026-07-08-cloudflare-drag-and-drop/)
- [flaviocopes.com — Cloudflare Drop: drag a folder, get a live site](https://flaviocopes.com/cloudflare-drop/)
- [explainx.ai — Instant Edge Deploy, No Account](https://explainx.ai/blog/cloudflare-drop-instant-deploy-july-2026)

## 2. 關鍵約束與方案比較

沒有 API = 我們無法從 SnapDeck 內直接把檔案送進 Drop。三條路:

| 方案 | 流程 | 自動化 | 風險 | 判定 |
|---|---|---|---|---|
| **A. 半自動 Drop 流程(建議)** | 站內一鍵「🚀 Drop 分享」→ 產出單檔 `snapdeck-live.html`(自含可播放簡報)並下載 → 自動開新分頁 cloudflare.com/drop → 使用者把剛下載的檔案拖進去 → 拿到 workers.dev 網址 | 兩步(下載 + 拖放) | 低;完全走官方 UI | ✅ 先做這個 |
| B. 逆向 Drop 上傳端點 | 站內直接 POST 到 Drop 的未文件化端點 | 一鍵 | 未文件化、隨時會改、極可能被 CORS 擋、ToS 疑慮 | ❌ 不做 |
| C. 自家 drop(worker + KV 已有) | 上傳 deck HTML 到自家 KV,`/d/<id>` 直出 | 一鍵 | 網址是本站域名(不是 workers.dev 的「拋棄感」);內容存我方,除非做解密殼頁否則失去零知識 | ⏸ 備案,若 Drop 之後開 API 再比較 |

方案 A 的體驗雖是兩步,但每步都是零思考:檔案剛下載完、Drop 分頁剛開好,
拖過去即完成。Drop 若未來釋出 API,A 可無縫升級為一鍵(產檔邏輯完全共用)。

## 3. 核心新元件:自含「可播放簡報 HTML」匯出器

這是無論走哪條路都需要的資產,也是本計劃的主要工作量。
與現有 `exportHtml.ts`(閱讀頁)同族,但輸出的是**簡報播放器**:

### 3.1 內容物(單一 HTML 檔,零外部請求)

- **全部 slides 預渲染為靜態 DOM**:離螢幕 render 每頁 `SlideSurface`
  (1280×720,含 mermaid SVG、字級縮放定案後的結果),序列化進檔案。
  skip 頁不進。
- **播放 header(使用者指定)**:頂部細條 bar——文件標題、頁碼 `N / 總數`、
  「▶ 播放」(進全螢幕)、「☰ 目錄」(章節跳頁)、「以 SnapDeck 製作」
  角標(連回本站,順便當成長迴路)。播放中 header 自動隱藏,滑鼠移到
  頂部浮現。
- **內嵌 vanilla JS runtime(~2–3KB,不帶 React)**:
  - 方向鍵/空白鍵/點擊翻頁、Esc 退出全螢幕、`?p=N` 深連結
  - `s` 鍵 notes 面板(notes 內容以 hidden div 隨頁嵌入)
  - 縮放:CSS transform 把 1280×720 設計面等比縮進視窗(邏輯同 ScaledSlide,
    十幾行 vanilla 即可)
- **CSS**:沿用 exportHtml 的 document.styleSheets 全量收集 + template 色票
  custom properties。
- 檔案大小估算:CSS ~30KB + slides DOM + 內嵌 SVG,典型文件 **100–300KB
  單檔**,Drop 秒傳。

### 3.2 UX 流程(方案 A)

1. 分享選單新增「🚀 Drop 分享(1 小時臨時網站)」。
2. 點擊 → 產檔下載 `<title>-live.html` → `window.open("https://cloudflare.com/drop")`
   → toast 指引:「把剛下載的檔案拖進 Drop 頁面,秒得臨時網址;
   想留住就按 Claim」。
3. (加分項)站內顯示一張三步驟小卡,首次使用才出現。

### 3.3 檔案結構(預計)

```
src/render-html/exportDeck.ts   # 自含播放器匯出(核心新檔)
src/render-html/deckRuntime.ts  # 內嵌的 vanilla runtime(以 ?raw 匯入字串)
src/app/App.tsx                 # 分享選單 + Drop 指引 UI
```

## 4. 隱私模型對比(要在 UI 講清楚)

| 通道 | 內容在哪 | 誰能看 | 壽命 |
|---|---|---|---|
| `#s=` 長連結 | 只在網址裡 | 拿到連結的人 | 永久、離線可解 |
| 零知識短連結 | 自家 KV(密文) | 拿到連結的人;**伺服器不能** | 180 天 |
| **Drop mode** | **Cloudflare 臨時帳號(明文靜態站)** | 拿到網址的任何人;內容明文存於 Cloudflare | 1 小時(Claim 後永久) |

Drop mode 是三者中唯一「內容明文離開使用者掌控」的通道——UI 必須明示
(選單描述 + 首次確認),敏感內容導向短連結。

## 5. 里程碑與估算

| 里程碑 | 內容 | 估算 |
|---|---|---|
| M1 | `exportDeck.ts`:靜態預渲染 + vanilla runtime + 播放 header;鍵盤/縮放/notes/深連結 | 主要工作,~1 個工作階段 |
| M2 | 分享選單整合 + Drop 指引 UX + 首次隱私確認 | 小 |
| M3 | 驗證:產出檔在 file:// 與 Drop 實站皆可播放(手動拖放實測);e2e 驗 runtime 鍵盤與縮放 | 小 |
| M4 | 文件:README、STATUS、DECISIONS(隱私模型對比進 SHORTLINK.md 或獨立) | 小 |

## 6. 風險

- **Drop 產品太新**(上線一週):限制、防濫用政策、URL 格式都可能變;
  幸好我們只依賴「使用者自己拖檔案」這個最穩的介面。
- **1 小時壽命**:適合「開會前丟連結」場景;要長效得 Claim(需 CF 帳號)
  或改用短連結。UI 要把壽命寫在按鈕描述裡,避免連結過期的驚訝。
- **單檔大小**:mermaid SVG 多的文件可能到數百 KB;Drop 上限未知,
  需實測(M3)。
- **釣魚濫用觀感**:workers.dev 臨時站已有被釣魚濫用的討論(見 PhishEye
  報導),企業收件人可能對此類網址警戒——閱讀對象是企業時,短連結
  (本站域名)觀感更好。

## 7. 開放問題

1. Drop 是否會釋出 API?(若有,方案 A 直接升級一鍵;值得訂閱 changelog)
2. 播放 header 是否也放「下載 pptx」按鈕?(檔內嵌 md 原文 → 收件人可
   自己轉 pptx?會讓檔案變大、也改變分享語意——傾向 v1 不做)
3. 自含 deck HTML 是否同時取代現有 HTML 匯出的「閱讀版」?(可做成
   header 上「簡報/閱讀」雙模切換——v1 先只做簡報模式)

## 附註:實作結果(與計劃的差異)

- 入口不是分享選單,而是 **HTML 按鈕旁的「Drop」勾選**(使用者指定):
  未勾 = 原本單檔閱讀版 HTML;勾選 = 雙模式 deck zip + 自動開啟
  cloudflare.com/drop 分頁(半自動拖放)。
- 開放問題 3 直接在 v1 解掉:匯出的 HTML 是**雙模式**——header bar 有
  「▶ 簡報 / ☰ 閱讀」切換,**預設簡報模式**。
- 產出為 zip(內含 index.html),對應 Drop 的格式要求。
- runtime:~3KB vanilla JS(翻頁/點擊/縮放/?p=N/s 鍵 notes/全螢幕),
  不帶 React;slides 於匯出時離螢幕預渲染(字級縮放收斂後序列化)。
- 隱私提示放在勾選的 tooltip(明文上臨時網站;敏感內容導向零知識短連結)。
