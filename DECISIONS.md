# DECISIONS — 實作期間的裁決記錄

依 HANDOFF 要求,記錄所有偏離交接文件的裁決與理由。Directive 詞彙表**沒有**任何擴充。

## D1:chunk 尾端的 slide 級 directive 歸屬下一頁

黃金樣本 01/02 的慣例是把 `<!-- skip -->` 寫在下一頁標題「前」(空行相隔),
但 H2 會開新 chunk,directive 會落在前一頁。裁決:chunk 結尾的 slide 級
directive(`skip`/`fit`/`layout`)讓渡給下一頁;`notes`/`emphasis`/`split`
不讓渡(`notes` 常見寫在頁尾、屬於當頁)。樣本是規格的一部分,以樣本為準。

## D2:headingPath 含當頁自身的 heading

IR 的 `headingPath` 定義為「到這一頁為止」的章節路徑,包含當頁 H1/H2 本身
(section 頁的 path = 自己的章名)。供頁碼/導覽用,語意不受影響。

## D3:pptx 端溢版縮放改用確定性內容量估算

HANDOFF rule 8 寫「pptx 端沿用 HTML 量測結果選定的字級」。實作上匯出時
preview 未必掛載對應 slide 的 DOM(縮圖有縮放、頁面 view 無固定框),
沿用量測值會讓輸出依 UI 狀態而變,違反「同輸入必同輸出」。裁決:
`estimateFontScale()` 以 block 內容量做確定性估算(同一輸入永遠同輸出),
HTML 端仍用真實 DOM 量測 + ResizeObserver 降級(縮字級 → 警示 badge)。

## D4:mermaid 關閉 htmlLabels

mermaid flowchart 預設用 `foreignObject` 畫 label,SVG→canvas→PNG 時
無法繪製(pptx 路徑整張圖消失)。裁決:`htmlLabels: false` 全域關閉,
label 走 SVG `<text>`,HTML 與 pptx 兩端一致。rasterize 前並以 viewBox
改寫 svg 的 width/height(mermaid 預設 useMaxWidth 會輸出 100% 寬)。

## D5:CLI linter 不驗 mermaid 語法

PROFILE §8 把「mermaid block 語法無法解析」列為錯誤。mermaid 解析需要
DOM,CLI(node)端不引入 jsdom 以保持 linter 輕量。裁決:CLI linter 略過
mermaid 語法檢查;站內 preview 即時 render,語法錯誤以紅字錯誤塊呈現在
該頁位置(等效於站內即時檢查)。若未來需要 CI 驗證,可加 headless 瀏覽器跑。

## D6:pptx 驗證以 JSZip 結構斷言 + XML well-formed 為準

HANDOFF M3 建議 `soffice --headless --convert-to pdf` 做 CI 冒煙測試。
本開發容器的 LibreOffice 損壞(連 txt 都無法載入),無法作為驗證手段。
裁決:驗證採 (a) JSZip 解包斷言(slide 數、skip 排除、notes 進 XML、
色碼 6 碼 hex、LAYOUT_WIDE 畫布)+ (b) 全部 XML part 過 xmllint
well-formed(手動驗證過瀏覽器實際匯出檔,44 parts 全過)。soffice 冒煙
測試留給有健康 LibreOffice 的 CI 環境。

## D7:內建 template 擴充為 5 套(v0.2)

v0.1 依 HANDOFF 出 2 套;使用者回饋要求「至少五種可直接選」,擴充為
`clean-light`、`midnight`、`craft`(暖紙 serif)、`forest`(松綠蜜金)、
`boardroom`(藏青金 serif)。共用 layout 幾何抽到 `templates/base.ts`
(standardLayouts),template 之間只分歧在色票、字型與深淺色頁的分佈,
維持「所有顏色集中在 config」的原則。

## D9:使用者內容持久化到 localStorage(v0.2)

v0.1 的簡報模式用 early-return 卸載整棵編輯器,退出後 CodeMirror 以預設
範例重建,使用者貼上的內容遺失(實測重現)。修法:(a) 簡報模式改為
overlay,editor 常駐不卸載;(b) 內容與 template 選擇 debounce 寫入
localStorage,重新整理後還原。localStorage 僅存於本機瀏覽器,不違反
「文件內容不得離開瀏覽器」原則。

## D10:pptx 裝飾以混色取代透明度

裝飾層(幽靈章節序號、emphasis 面板、表格斑馬紋、hairline)需要低對比
色。pptxgenjs 的 fill transparency 在部分渲染器上表現不一,改用確定性
的兩色線性混合(mixHex),輸出檔案內全部是實色 6 碼 hex,規避相容性風險。

## D11:黃金樣本集更換為外部通用領域 ×6(v0.2)

v0.1 的 10 份樣本部分內容貼近使用者進行中的專案,有洩密疑慮;且數量
偏多。裁決:整組更換為 6 份、全部虛構的外部通用場景——產(製造月報,
含 gantt)、銷(連鎖銷售 QBR)、人(HR 半年報,含招募漏斗 flowchart)、
發(通知系統重構,flowchart + sequence + two-col)、財(年度財務健診,
含 pie chart)+ 本產品自身的規劃文件。形狀覆蓋面不變(cards、steps、
big-stat、quote、table、two-col、emphasis、skip、fit、四種 mermaid),
仍全數通過 linter 並作為 IR snapshot 與 pptx 結構測試的 fixtures。
HANDOFF 原文的「10 份」要求以此裁決取代;docs/HANDOFF.md 保留原文
作為歷史文件。

## D12:stat 規則 v2 — 標籤 + 補充說明、KPI 看板(v0.3)

原 rule 5「≤20 字」是斷崖:21 字的數字句默默退化成普通段落,作者難以
察覺(使用者實際踩到)。裁決:
- 無逗號:≤20 字 → 大數字頁(同 v1)。
- 有逗號:全段 ≤40 字且「數值+標籤」≤20 字 → 逗號前為標籤、逗號後為
  小字補充說明(caption)。
- 連續 ≥2 段數字短句 → KPI 看板(stat tiles 並排),HTML 與 pptx 同構。
超出上限仍退化為段落(graceful degradation 原則不變)。PROFILE §5、
SKILL.md、prompt.md 同步更新;stat 單位表補齊常見量詞(家/店/筆/名…)。

## D13:稀疏頁與圖表頁垂直置中(v0.3)

內容量(contentWeight)≤7 的內容頁、big-stat 頁、整頁單張 diagram,
內容改為安全區垂直置中,避免「上重下空」。HTML 用 flex(注意不可加
align-items:center,會令 diagram 失去 stretch 縮成迷你圖——已踩過);
pptx 用與排版常數一致的高度估算把起始 y 置中。門檻與估算皆確定性。

## D14:mermaid 頁面層文字色與 pie 色盤(v0.3)

診斷:diagram 一律渲染在淺色 content 頁上,但深色系 template 的
primaryTextColor(節點內文字)是近白色,mermaid 的 pie 標題/圖例等
「畫在頁面背景上的文字」預設繼承它 → 白字隱形(使用者回報)。裁決:
五套 template 的 mermaidTheme 顯式補齊 textColor / pieTitleTextColor /
pieLegendTextColor(深色)與 pieSectionTextColor(依切片深淺),並給
每套 template 一組 pie1–pie6 專屬色盤,切片不再單色糊成一團。

## D15:share link 走 URL hash fragment(v0.4)

仿 PlantUML 的內容進網址:`#s=1.<base64url(deflate-raw(JSON{m,t}))>`。
裁決要點:
- 用 **hash fragment 而非 query string**——fragment 不會隨請求送到
  伺服器、不進 access log,守住「內容不出瀏覽器」;也避開 server 端
  URL 長度限制。
- 壓縮用瀏覽器原生 CompressionStream("deflate-raw"),零依賴;版本
  前綴 `1.` 留升級空間;解不開回傳 null(顯示毀損提示,不丟例外)。
- 載入端同時處理「開新連結」與「已開啟分頁貼網址」(hashchange 不觸發
  reload,需監聽);載入後清掉 hash,留乾淨網址。
- PRD 把「分享短連結」列為 Phase 4(需要後端);此功能是無後端的
  URL 自含式分享,不衝突——長文件連結會變長(UI 超過 32k 字元時提示)。
PRD §9「分享基礎設施」的短連結仍留待 Phase 4。

## D16:share v2 緊湊格式、三種檢視模式、閱讀頁與 HTML 匯出(v0.4)

- **v2 格式**:`#s=2.<base64url(deflate-raw(template + "\\u0000" + md))>`,
  拆掉 v1 的 JSON 層(JSON 會把每個換行轉義成兩字元、加引號括號)。
  v1 連結仍可解碼,不失效。長度極限說明:壓縮已是瀏覽器原生 deflate 最緊,
  base64 的 33% 膨脹是 URL 安全字元集的固定成本;再縮只能上後端短連結
  (Phase 4)。
- **檢視模式**:`&v=page` 開啟即 blog 式全版閱讀頁;`&p=N` 開啟直接進
  全螢幕簡報第 N 頁(簡報中的「分享此頁」帶當前頁碼)。無參數 = 編輯器。
- **全版閱讀(reader)**:overlay 呈現(editor 不卸載),blog 式排版
  (窄欄 780px、17.5px/1.85 行高、放大標題階層)。
- **HTML 匯出**:離螢幕 render PageView → 等 React commit 與 mermaid
  SVG 到齊 → 序列化 DOM + 內嵌全部 bundle CSS + template 色票,產出
  單一自含 HTML(零外部請求)。教訓:React 18 createRoot 的 commit
  是非同步,序列化前必須等 `.sd-page` 出現,否則拿到空 body。

## D17:prompt.md 重寫為 few-shot 教材式(v0.4)

原 prompt 是純規則清單,非 thinking 模型產出品質差(使用者實測回饋)。
重寫原則(對齊 SKILL.md 的教法):
- **Do/Don't 對照**覆蓋實測常見失敗:數字埋段落、一頁塞爆、講稿進正文、
  手打「•」與 HTML、章節頁塞內容。
- **完整輸入→輸出範例**(few-shot):一段口語素材 → 整份合規輸出,
  對非 thinking 模型比規則更有效。範例經自家 parser/linter 驗證
  (lint PASS;觸發 title/section/big-stat 看板/cards/steps)。
- **輸出格式規則放最前且重複於結尾**(「第一行必須是 ---」「不要
  code fence 包住」),弱模型最常在這兩點翻車。
- 檔頭使用說明以 `<!-- PROMPT-START -->` 隔開,站內按鈕只複製本體,
  雜訊不進剪貼簿。

## D18:fence 包裹策略反轉 + 貼上正規化(v0.4)

D17 的 prompt 要求「不要用 code fence 包住輸出」——在 raw API 情境正確,
但聊天介面(Gemini/ChatGPT)會把裸 Markdown 渲染成排版後的文字,使用者
複製到的是渲染結果:frontmatter 變標題、`-` 變 `*`、結構全毀(實測回報)。
裁決:兩端一起改——
- prompt 要求整份輸出包在 ````markdown 區塊(聊天介面才有「一鍵複製
  原始碼」;四個反引號因內容可能含 ```mermaid);
- SnapDeck 貼上時自動剝掉外層 fence(parser 入口 normalizeMd:info 為
  空/markdown/md 才剝、內層 fence 不受影響、無 fence 原樣通過),並
  容錯 frontmatter 前的空行與 BOM。

## D19:stat 規則 v3 — 單位與 + 進大字(v0.4)

「10,000+ 小時,喜劇內容與旅遊節目總時數」被拆成大字 10,000、標籤
「+ 小時」(實測回報)。修正:value 納入尾隨的 +/單位(10,000+ 小時、
90 萬+ 整組成為大字);並修掉 value regex 吃掉「唯一逗號」導致其後
文字誤判的問題——改為統一規則:第一個逗號前為標籤(≤16 字)、之後
為小字補充,value ≤14 字、全段 ≤40 字,超限退化為段落。

## D20:directive 使用門檻(v0.4)

實測 Gemini 把「一段話 + 一個大數字」硬湊成 two-col——模型看到工具
清單就想全用。裁決:prompt/SKILL 的註解表加「使用門檻」欄,預設只用
notes;two-col 僅限素材本身是左右對照、整份 ≤1 頁、大數字絕不放欄內;
emphasis 整份 1–2 處;fit 只給拆不開的密集表格。修正後 Gemini 重跑
同素材,two-col 濫用消失,輸出一次合規(Phase 1 以此結案)。

## D21:零知識短連結(v0.5)

長連結(數千字元)會被通訊軟體與 bit.ly 類服務截斷;更換壓縮演算法
(Brotli WASM)僅省 15–25%,救不了場景。裁決:採 PrivateBin 模式——
瀏覽器內 AES-GCM 加密,KV 只存密文,金鑰放 URL fragment(不隨請求
送出),伺服器與營運者皆無法解密,守住「內容不給出去」;連結 ~60 字元。
邊界:密文 180 天過期(長連結永久有效且離線可解)、上限 100KB、
未做限流(公開部署可加 Cloudflare rate limiting)。部署為選配:
未綁 KV 時 API 回 503,前端自動退回 `#s=` 長連結,既有部署不受影響;
啟用步驟見 docs/SHORTLINK.md;/api/health 探針回 {worker,kv} 供確認
部署版本與 KV 綁定(實測使用者把 KV「名稱」填進 id 欄位 → 部署失敗
10042,config 與文件已加防呆)。壓縮天花板說明一併記錄:deflate-raw
已是瀏覽器原生最緊,base64 33% 膨脹是 URL 字元集固定成本。

## D22:Drop mode — 雙模式簡報 zip + 半自動上 Cloudflare Drop(v0.6)

Cloudflare Drop(2026-07-08 上線)無公開 API,採 DROP-MODE.md 方案 A:
- HTML 按鈕旁「Drop」勾選:未勾 = 原本閱讀版單檔;勾選 = 雙模式 deck
  (預設簡報播放、header bar 切閱讀)打包成含 index.html 的 zip
  (Drop 要求根目錄有 index.html;限制 60 分鐘/25MB/100MB/2000 檔,
  我們單檔 30–300KB 遠低於),並同步開啟 cloudflare.com/drop 分頁。
- Drop 分頁必須在使用者手勢內「同步」window.open,否則 popup blocker
  會擋——先開分頁再做非同步產檔。
- 播放 runtime 為 ~3KB vanilla JS(不帶 React):翻頁/點擊/transform
  縮放/?p=N/s 鍵 notes/全螢幕;slides 於匯出時離螢幕預渲染,等字級
  縮放收斂後序列化,兩端(站內/匯出檔)版面一致。
- 隱私:Drop 是三通道中唯一「內容明文存於第三方」者,tooltip 明示並
  導引敏感內容用零知識短連結。
- jszip 由 devDependencies 移入 dependencies(lazy import,不進首包)。

## D8:表格 pptx 高度交給 addTable 自動配置

pptxgenjs `addTable` 只給 `w` 不鎖 `h`,行高自動長;generator 只以估算值
推進後續 block 的 y 座標。避免鎖死高度造成文字被裁切(可編輯性優先)。
