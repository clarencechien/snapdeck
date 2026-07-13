---
name: mdshare-authoring
description: 產出符合 SnapDeck(MD Share & Present)Profile v1 的類通用 Markdown。當使用者要求產生可用於該工具的簡報/分享文件、或要求「轉成可簡報的 MD」時使用。輸出必須在任何標準 Markdown viewer 中呈現為正常文件,同時攜帶隱形的版面資訊。
---

# SnapDeck(MD Share & Present)撰寫技能

你要產出的是一份**類通用 Markdown**:在 GitHub/Obsidian 打開是正常文件,貼進 SnapDeck 後自動變成有設計感的頁面、slide 與 pptx。

## 核心規則(依序,違反前面的規則即失敗)

1. **只用標準 CommonMark + GFM。** 專屬資訊只能放 YAML frontmatter 與 HTML 註解。絕不使用行內 HTML、自創語法。
2. **一個 H2 = 一頁 slide。** H1 = 章節分隔頁(單獨一行,該頁不放其他內容)。內容太多用 `---` 拆頁。
3. **每頁最多一個重點。** 單頁內容塊 ≤ 6(heading 不計)。寧可多頁,不可擠一頁。
4. **先靠形狀,後靠 directive。** 下表的內容形狀會被自動升級版面,優先用形狀表達;只在推斷會出錯時才下 directive。

## 會被自動升級的內容形狀(優先使用)

| 想要的版面 | 就這樣寫 |
|---|---|
| 卡片(3–4 張) | 清單,每項 `**粗體詞**:一句話說明`,恰好 3–4 項 |
| 步驟條 | 有序清單 1.–5.,每項一短句 |
| 大數字頁 | 獨立一段,固定格式 `數值,標籤,補充(可省)`:數值可帶單位與 +(`10,000+ 小時`)整組成大字;標籤 ≤16 字;全段 ≤40 字 |
| KPI 看板 | 連續 2–4 段上述三欄位格式,各自成段(段間空行),自動排成並列數字卡 |
| 引言頁 | blockquote,尾行 `— 出處` |
| 圖表頁 | ```` ```mermaid ```` code block(flowchart/sequence/gantt) |
| 章節頁 | 單獨一個 H1 |

## Directive 詞彙表(只有這 6 個,不可自創)

```
<!-- notes: ... -->        講者備註(不會出現在畫面上)— 每頁建議
<!-- layout: two-col -->   兩欄對照 — 只有素材本身是左右對照(方案A/B、
                           做/不做)才用,整份 ≤1 頁;大數字絕不放欄內
<!-- split -->             two-col 頁的左右欄分界(只能出現在 two-col 頁)
<!-- emphasis -->          下一個區塊視覺強調 — 整份最多 1–2 處
<!-- fit -->               本頁允許縮字級塞入 — 只給拆不開的密集表格
<!-- skip -->              本頁不進 slide/pptx(附錄用)
<!-- layout: X -->         覆蓋版面推斷(title/section/content/two-col/
                           big-stat/quote/cards/diagram)— 推斷錯了才用
```

## 輸出骨架

```markdown
---
title: <文件標題>
author: <作者,可省>
date: <YYYY-MM-DD,可省>
template: clean-light
lang: zh-TW
---

# <第一章名>

## <第一頁標題>

<內容,套用上方形狀>

<!-- notes: <這頁的講稿提示> -->

## <第二頁標題>
...
```

## 正例

```markdown
## 為什麼是現在

- **成本**:雲端支出年增 42%,已達損益兩平臨界
- **法規**:資料在地化要求 2027 生效
- **技術**:邊緣端推論延遲已低於 50ms

<!-- notes: 三個驅動力,法規那條是硬deadline -->
```

(三項粗體詞清單 → 自動變三張卡片,零 directive。)

```markdown
## 兩個關鍵數字

12 萬,新增會員

78%,新戶留存率,較上季 71% 明顯提升
```

(連續三欄位數字段 → 自動排成 KPI 看板;單獨一段則成大數字頁。)

## 反例(不要這樣寫)

```markdown
## 為什麼是現在
<div class="cards">           ← 行內 HTML,任何 viewer 都會壞
<!-- layout: cards -->        ← 多餘,形狀已能觸發
- 成本: 雲端支出年增42%,已達損益兩平臨界,而且維運人力吃緊,加上... ← 一項塞三件事
<!-- highlight -->            ← 自創 directive,linter 直接報錯
```

## 交付前自檢

- [ ] 拿掉所有 HTML 註解後,文件仍是一份完整可讀的 Markdown?
- [ ] 每個 H2 頁的內容塊 ≤ 6?
- [ ] 只用了詞彙表內的 6 個 directive?
- [ ] `split` 只出現在 `layout: two-col` 的頁?
- [ ] 講稿放 `notes` 而不是正文?
- [ ] 關鍵數據用了 `數值,標籤,補充` 三欄位格式,而不是埋在段落裡?
