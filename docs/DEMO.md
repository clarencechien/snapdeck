# 3 分鐘操作示範腳本

> 目標:展示「貼上 → 簡報 → 換 template → 下載 pptx」全流程 < 3 分鐘。

**0:00 — 開場(15s)**
打開 SnapDeck。左邊是貼上點(不是寫作點),右邊即時 preview。
「假設你剛用 Claude 寫完一份週報 Markdown。」

**0:15 — 貼上(20s)**
頂欄「載入範例…」選 `01-weekly-report`(或直接把自己的 MD 貼進左欄)。
右欄立刻長出投影片:frontmatter 變成 title 頁;「**粗體詞**:說明」×3 的
清單自動變三張卡片;「96% 試產良率…」自動變大數字頁 —— 全程零標記。
指一下右上角「✓ Lint」:這份文件通過 profile linter。

**0:35 — 簡報(40s)**
按「▶ 簡報」進全螢幕。方向鍵翻兩頁,按 `s` 打開 speaker notes 面板
(講稿藏在 MD 的 `<!-- notes: -->` 註解裡,GitHub 上看不見)。
指網址列的 `?p=3`:這一頁可以直接深連結分享。Esc 退出。

**1:15 — 換 template(20s)**
頂欄 Template 切到 Midnight。整份 deck 變色:title/section 深底、
內容頁淺底,連 mermaid 圖表都跟著換配色 —— 顏色全部來自 template config,
內容一個字沒動。

**1:35 — 頁面 view(15s)**
preview 切「頁面」:同一份 MD 的 Notion 質感閱讀版,附錄(skip 頁)
在這裡看得到、但不進簡報。

**1:50 — 下載 pptx(40s)**
按「⬇ 匯出 pptx」,幾秒內下載完成。用 PowerPoint 打開:
每一頁都是**原生文字框**,點進標題改兩個字 —— 主管要改就讓他改。
mermaid 圖是嵌入的高解析 PNG,speaker notes 在備忘稿欄位裡。

**2:30 — 收尾(30s)**
「寫作即排版,貼上即上台。」文件本體始終是一份正常的 Markdown ——
在 GitHub 上看是乾淨的文件,貼進 SnapDeck 就是一場簡報。
要讓 AI 代寫?按「✨ AI 產生」複製 prompt,貼給任何 LLM 即可。
