# MD Profile v1 — 類通用 Markdown 規格(唯一合約)

> 本規格同時約束:人類作者、LLM(經 SKILL.md / prompt.md)、parser、linter、三個 renderer。
> 最高原則:**文件在 GitHub、Obsidian 或任何標準 Markdown viewer 打開,必須是一份正常、可讀、無雜訊的 Markdown。**

## 1. 基底語法

- CommonMark + GFM(表格、刪除線、task list)。
- 貼上容錯(app 行為,非文件合法性的一部分):包住整份文件的外層 code fence、frontmatter 前的空行/BOM,貼上時自動剝除。
- 專屬資訊只允許存在於兩處:**YAML frontmatter** 與 **HTML 註解 directive**。兩者在一般 viewer 中皆為隱形或無害。
- 禁止:自創語法、行內 HTML(註解除外)、依賴縮排的排版技巧。

## 2. Frontmatter(文件層級,全部選填)

```yaml
---
title: 2026 Q3 邊緣運算產品線提案     # 出現於 title slide 與頁面標題
author: Clarence                     # title slide 副行
date: 2026-07-13                     # title slide 副行
template: clean-light                # 缺省時由 app 端選擇,不影響文件合法性
lang: zh-TW                          # 影響字型 fallback 與行高規則
---
```

規則:未知欄位 → linter 警告(不報錯);frontmatter 存在即產生 title slide。

## 3. 分頁規則(由弱到強)

1. **H1、H2 開頭** → 開新 slide(H1 通常是章節、H2 是內容頁,但不強制)。
2. **`---`(thematic break)** → 強制分頁(在一般 viewer 是一條水平線,無害)。
3. 單獨 H1 且該頁無其他內容 → 章節頁(`section` layout)。

作者心智模型:「一個 H2 就是一頁」。內容太多時用 `---` 手動拆頁。

## 4. Directive 詞彙表 v1(共 6 個,凍結)

全部為 HTML 註解,獨立成行。格式:`<!-- 關鍵字: 值 -->` 或 `<!-- 關鍵字 -->`。

| Directive | 位置 | 作用 | 範例 |
|---|---|---|---|
| `layout` | slide 開頭(heading 之後) | 覆蓋自動推斷的版面。合法值:`title` `section` `content` `two-col` `big-stat` `quote` `cards` `diagram` | `<!-- layout: two-col -->` |
| `split` | two-col 頁內容中 | 標記左右欄分界(僅在 `layout: two-col` 頁內合法) | `<!-- split -->` |
| `notes` | slide 任意處 | 講者備註,進 HTML notes 面板與 pptx speaker notes | `<!-- notes: 這頁停留久一點,帶討論 -->` |
| `emphasis` | 任一 block 前一行 | 該 block 視覺強調(callout/主色框) | `<!-- emphasis -->` |
| `fit` | slide 開頭 | 本頁允許自動縮字級以塞入(明示放棄溢版警告) | `<!-- fit -->` |
| `skip` | slide 開頭 | 本頁不進 slide/pptx 輸出(頁面 view 仍顯示;用於附錄、參考段) | `<!-- skip -->` |

規則:
- 未知 directive → linter 報錯。
- directive 大小寫不敏感;值不加引號。
- 一頁多個 `layout` → 取第一個,其餘警告。

## 5. 內容約定(design rules 的觸發形狀)

作者(或 LLM)以自然 Markdown 寫出以下形狀,renderer 自動升級版面,**不需要任何 directive**:

| 你寫的 | Renderer 做的 |
|---|---|
| ≥3 項、每項「**粗體詞**:說明」或「**粗體詞** — 說明」的清單 | 卡片排列(cards) |
| 有序清單 ≤5 項 | 步驟條(steps) |
| 以數字/百分比/金額開頭的段落(全段 ≤40 字;數字可帶單位與 +,整組成為大字;第一個逗號前為標籤 ≤16 字、之後為小字補充) | 大數字版面(big-stat) |
| 連續 ≥2 段上述數字短句 | KPI 看板(多個 stat tiles 並排) |
| blockquote(可尾接 `— 出處`) | 引言版面(quote) |
| ```` ```mermaid ```` code block | 圖表(SVG/PNG),配色跟隨 template |
| 單獨 H1 一頁 | 章節分隔頁(section) |

directive 只在自動推斷不符期望時才使用——**先靠形狀,後靠 directive**。

## 6. 各輸出的行為差異(語意一致、呈現各異)

| 元素 | 頁面 view | slide mode | pptx |
|---|---|---|---|
| `skip` 頁 | 顯示 | 隱藏 | 隱藏 |
| `notes` | 不顯示 | notes 面板(`s` 鍵) | speaker notes |
| 長表格 | 完整 | 自動縮/警告 | `addTable` + 縮字級 |
| 外部圖片 URL | 顯示 | 顯示 | 內嵌下載(失敗則佔位框 + 警告) |

## 7. 合法文件最小範例

```markdown
---
title: 範例文件
template: clean-light
---

# 第一章

## 現況

- **成本**:季度雲端支出成長 42%
- **延遲**:P95 回應時間 2.1 秒
- **維運**:每週平均 3 起告警疲勞事件

<!-- notes: 三個痛點各停 20 秒 -->

## 提案

<!-- layout: two-col -->

方案 A:全面上雲

<!-- split -->

方案 B:邊緣 + 雲混合
```

## 8. Linter 規則摘要

錯誤(阻擋):未知 directive;`split` 出現在非 two-col 頁;frontmatter YAML 解析失敗;mermaid block 語法無法解析。
警告(不阻擋):未知 frontmatter 欄位;一頁多個 `layout`;單頁內容塊 >8(建議拆頁);圖片為外部 URL(pptx 端有失敗風險)。
