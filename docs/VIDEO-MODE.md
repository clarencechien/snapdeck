# VIDEO-MODE — autoplay 與影片輸出計劃(查證版,尚未實作影片)

> 狀態:**autoplay(v0.8)與簡報動畫層(v0.9)已實作**;影片輸出
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

1. ✅ autoplay(v0.8)——自身就有 kiosk 價值,也是影片的地基。
2. ✅ 動畫系統第 1+2 項(v0.9,DECISIONS D26):換頁轉場、逐塊/逐項
   進場、大數字 count-up、圖表節點依序長出。影片「值得看」的前提已成立。
   ⏸ 第 3 項分拍揭露(`<Steps>` 式)未做——影片其實不需要它(它是
   講者互動節奏),真要做也可獨立於影片。
3. 路線 A(+A+):錄影式 MVP,1–2 天,先能出片。
4. 路線 B:離線逐幀 MP4,體驗終局。A 的 UI 保留當 fallback。

補充:逐幀渲染(路線 B)撥時間軸靠 `document.getAnimations()`——
v0.9 的動畫全部是 CSS `@keyframes`,天生就在這個 API 的掌握範圍內;
唯一需要另外對時的是 count-up 的 rAF 迴圈(逐幀模式要改成吃外部
時間參數,而非 `requestAnimationFrame` 的實時時鐘)。

## 5. 落地位置(要做在哪)

### 5.1 錄製來源:匯出的 deck HTML,不是站內簡報模式

兩個候選來源,選後者:

| | 站內簡報模式 `.sd-present` | **匯出的 deck HTML `#dk-frame`** |
|---|---|---|
| 內容 | React 驅動,和編輯器共用 DOM | 自含單檔,零 React |
| 尺寸 | 跟著視窗縮放 | 固定 1280×720 設計面,可等比放大 1080p |
| 時間資料 | 無 | 每頁已有 `data-dur`(autoplay 用) |
| 隔離性 | 撥動畫時間軸會影響主畫面 | 塞進隱藏 iframe,完全隔離 |
| 裁切 | 要避開頂欄、hint、notes 面板 | Element Capture 直接鎖定 iframe |
| 確定性 | 受 React 重繪與量測時序影響 | 序列化完成的靜態 DOM |

**結論**:影片一律錄「`exportDeck()` 產出的 HTML」——它本來就是我們
對外交付的成品,錄它等於錄使用者真正會拿到的東西。站內簡報模式維持
純粹「給人看」的角色,不背錄影責任。

### 5.2 模組配置

```
src/render-video/
  timeline.ts    # 由 slideDoc 算出確定性時間軸(重用 autoDelaySeconds
                 # 與 motion.css 的 delay/duration 常數):每頁何時進場、
                 # 動畫何時結束、何時換頁 → 總長度與每一幀的 (page, t)
  deckStage.ts   # 把 exportDeck() 的 HTML 掛進隱藏 iframe,提供
                 # goto(n) / seek(ms) / size(w,h);錄影與逐幀共用
  recordDeck.ts  # 路線 A/A+:getDisplayMedia(preferCurrentTab)
                 # + restrictTo(iframe) + MediaRecorder → mp4/webm
  renderFrames.ts# 路線 B:暫停 getAnimations()、逐幀撥 currentTime、
                 # foreignObject 光柵化 → VideoEncoder → mp4-muxer
```

### 5.3 唯一需要改既有程式的地方:deck runtime 的 `?render` 模式

匯出檔的 vanilla runtime 加一個 `?render` 參數(約 20 行):

- 關閉 autoplay 與鍵盤/點擊翻頁(避免與驅動程式打架);
- 暴露 `window.__sd = { total, goto(n) }` 供 iframe 外驅動;
- **count-up 改吃外部時鐘**:目前是 `requestAnimationFrame` 的實時
  時鐘,逐幀渲染必須能被撥到任意時間點,所以 render 模式下改成
  `__sd.tick(elapsedMs)` 由渲染迴圈餵。CSS 動畫本身不用改——
  `document.getAnimations()` 就能撥。

### 5.4 UI 落點

- 主工具列在 `↓ pptx`、`↓ HTML` 之後加 **`↓ 影片`**,獨立按鈕。
  **不做成 Drop 那種 checkbox**:影片流程有進度、要數十秒到數分鐘、
  需要可取消,和「按一下就下載」的既有匯出行為不同。
- 按下開小面板:解析度(1080p / 720p)、每頁秒數(估算值 or 固定 N 秒)、
  是否含頁碼頁尾、輸出格式(依瀏覽器能力自動選 mp4 / webm)。
- 進度條 + 取消鈕;完成直接下載。無 WebCodecs 的瀏覽器改走錄影式,
  面板要先講清楚「會跳出分頁授權、需要即時播完」。
- 簡報模式內可加一個「錄製這份」入口,但走的是同一條 render-video
  流程(仍然錄匯出的 deck,不是錄當下畫面)。

### 5.5 分期

1. **Phase 1(約 1 天)**:`timeline.ts` + `deckStage.ts` + `recordDeck.ts`
   + `?render` 模式 → Chrome 上先能出 mp4(錄影式,即時)。
2. **Phase 2(1–2 週)**:`renderFrames.ts` 離線逐幀,比即時快、無彈窗;
   Phase 1 的 UI 與 fallback 原封不動保留。

## 6. 參考資料(查證來源)

- WebCodecs 支援度:digitalsamba.com/blog/webcodecs-api-explained、
  testmuai.com/learning-hub/webcodecs-browser-support
- Element/Region Capture:developer.chrome.com/docs/web-platform/element-capture、
  developer.chrome.com/docs/web-platform/region-capture
- MediaRecorder MP4:chromestatus.com/feature/5163469011943424
- WebCodecs→MP4 實作:npmjs.com/package/mp4-muxer、
  devtails.xyz/adam/how-to-save-html-canvas-to-mp4-using-web-codecs-api、
  webcodecsfundamentals.org/basics/muxing
- 背景節流與 Worker 解法:medium.com/@chemsabd(OffscreenCanvas + WebCodecs)
