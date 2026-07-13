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

## D7:v1 先內建 2 套 template(規格允許 2–3)

`clean-light` 與 `midnight`(title/section 深、content 淺的三明治結構),
足以展示「同一份 MD 換 template」;第三套等 Phase 2 template config
schema 穩定後再加。

## D8:表格 pptx 高度交給 addTable 自動配置

pptxgenjs `addTable` 只給 `w` 不鎖 `h`,行高自動長;generator 只以估算值
推進後續 block 的 y 座標。避免鎖死高度造成文字被裁切(可編輯性優先)。
