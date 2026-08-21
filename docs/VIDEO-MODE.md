# VIDEO-MODE — autoplay 與影片輸出計劃(查證版,尚未實作影片)

> 狀態:**autoplay 已實作**(app 簡報模式 + Drop zip runtime);影片輸出
> 為計劃,方法與瀏覽器支援度已查證(2026-08),落地順序見文末。

## 0. 已交付:autoplay

影片的前提是「deck 能自己走完」,這部分已上線:

| 入口 | 操作 |
|---|---|
| app 簡報模式 | `a` 鍵開關自動播放;網址帶 `?auto` 進場即自動播;播到最後一頁自動停 |
| Drop zip | `a` 鍵開關;`?auto` 進場即播**且循環**(kiosk/展場);`?auto=8` 固定每頁 8 秒 |

每頁停留秒數由內容量確定性估算(`autoDelaySeconds`:4–12 秒,與
HTML/pptx 共用同一套 `contentWeight`),export 時寫進 `data-dur`,兩端
同一條規則。任何手動翻頁(鍵盤/點擊)即停止自動播放——kiosk 慣例。

## 1. 目標與非目標

- 目標:把一份 deck 變成**無聲影片檔**(簡報自動走完 + 未來的動畫演出),
  全程在瀏覽器內完成——內容不離開瀏覽器的原則不變。
- 非目標(明確排除):配音/TTS 旁白(另一個工程)、伺服器端渲染
  (違反零後端)、即時串流。

## 2. 三條技術路線(2026-08 查證)

### 路線 A|錄影式:`getDisplayMedia` + `MediaRecorder`

按「錄製」→ 瀏覽器彈授權選「此分頁」→ autoplay 播完 → 存檔下載。

- **支援度**:所有主流瀏覽器。Chrome 現已支援 `MediaRecorder` 直出
  **MP4(H.264+AAC)容器**,不再只有 WebM;Firefox/Safari 仍以 WebM 為主。
- **保真度**:100%(錄的就是真實渲染)。
- **限制**:只能**即時錄**(5 分鐘 deck 錄 5 分鐘);要使用者授權選分頁;
  預設會把整個分頁(含頂欄、hint)錄進去;分頁切到背景可能被節流。
- **工程量**:1–2 天。

### 路線 A+|Chrome 專屬升級:Region / Element Capture

Chrome 在分頁擷取上多兩個 API,能把錄製範圍**裁到 16:9 舞台元素本身**:

- **Region Capture**(`track.cropTo(CropTarget)`,Chrome 104+):按元素
  的 bounding box 裁切。
- **Element Capture**(`track.restrictTo(RestrictionTarget)`,較新
  Chrome):只錄該 DOM 子樹,連疊在上面的東西都不會入鏡。

搭配 `preferCurrentTab`(授權對話框直接預選本分頁)後,體驗變成:
按「錄製影片」→ 一次點擊確認 → 自動播完 → **乾淨無邊框的 MP4** 下載。
仍是即時錄,但輸出品質等同離線渲染。工程量:在 A 之上 +0.5 天。

### 路線 B|離線逐幀渲染:WAAPI 時間軸 + WebCodecs + mp4-muxer(正解)

原理同 Remotion 但純瀏覽器內:

1. `document.getAnimations()` 全部暫停,把 `currentTime` 逐幀撥到
   t=0、33ms、66ms…(確定性時間軸,與 autoplay 的 `data-dur` 同一組秒數);
2. 每幀把 slide DOM 經 SVG `foreignObject` 光柵化進 canvas
   (pptx 匯出已有 SVG→canvas→PNG 全套機器,含 mermaid 的
   `htmlLabels:false` 裁決,見 DECISIONS D5);
3. `VideoEncoder`(WebCodecs)硬體編碼 H.264,`mp4-muxer`
   (~10KB 純 TS 小庫)封裝成 MP4。

- **支援度**:`VideoEncoder` — Chrome 94+ / Edge / Firefox 130+(桌面)/
  Safari 16.4+(視訊編碼;Safari 26 才補齊音訊,我們用不到)。
  H.264/VP9 編碼在 2026 已「效實上通用」。
- **優點**:精確 1920×1080、**比即時快**(不用等播完)、零授權彈窗、
  完全確定性(同一份 MD 秒出同一支影片)。
- **難點**:DOM→點陣圖那一步。foreignObject 要求樣式與字型全內嵌
  (外部資源會 taint canvas)——SnapDeck 本來就全自含,是天然優勢;
  剩餘風險:webfont 轉 data URL、CSS filter 在光柵化的支援差異、
  背景分頁節流(解法:OffscreenCanvas + Web Worker)。
- **工程量**:1–2 週(信心中等,風險集中在光柵化保真度)。

### 路線 C|伺服器端(Playwright/Remotion)——否決

保真最容易,但內容必須離開瀏覽器,違反零後端/零知識原則。不做。

## 3. 「如果只支援 Chrome」的答案

**可以,而且三條路全通、體驗最好**:

- A+(Region/Element Capture + MP4 直出)只有 Chrome 有;
- B 的 WebCodecs 在 Chrome 最成熟(硬體 H.264,1080p 編碼遠快於即時);
- 體驗:「⬇ 匯出影片」→ 進度條跑完(比播放時間短)→ `deck.mp4` 下載,
  無彈窗、無等待實際播完、幀幀精確。這是 PowerPoint「匯出視訊」的
  瀏覽器版,零安裝。

非 Chrome 的降級鏈:Firefox 桌面走 B(130+ 有 VideoEncoder)→
Safari 走 B(16.4+)或退到 A 錄 WebM → 都不行就只給 autoplay。
偵測用 `('VideoEncoder' in window)`,一行。

## 4. 落地順序

1. ✅ autoplay(本次交付)——自身就有 kiosk 價值,也是影片的地基。
2. 動畫系統 1+2+3(house transition / block 進場 / 分拍揭露,
   見 open-slide 研究)——影片「值得看」的前提。
3. 路線 A(+A+):錄影式 MVP,1–2 天,先能出片。
4. 路線 B:離線逐幀 MP4,體驗終局。A 的 UI 保留當 fallback。

## 5. 參考資料(查證來源)

- WebCodecs 支援度:digitalsamba.com/blog/webcodecs-api-explained、
  testmuai.com/learning-hub/webcodecs-browser-support
- Element/Region Capture:developer.chrome.com/docs/web-platform/element-capture、
  developer.chrome.com/docs/web-platform/region-capture
- MediaRecorder MP4:chromestatus.com/feature/5163469011943424
- WebCodecs→MP4 實作:npmjs.com/package/mp4-muxer、
  devtails.xyz/adam/how-to-save-html-canvas-to-mp4-using-web-codecs-api、
  webcodecsfundamentals.org/basics/muxing
- 背景節流與 Worker 解法:medium.com/@chemsabd(OffscreenCanvas + WebCodecs)
