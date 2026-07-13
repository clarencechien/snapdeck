# HANDOFF — MD Share & Present:Phase 0 + Phase 1 實作交接

> 給 Claude Code:這份文件是完整實作指南。目標是交付 PRD 的 Phase 0(規格)+ Phase 1(純前端 MVP)。
> 本套件內含:本文件、`spec/PROFILE.md`(MD Profile v1 規格,**唯一合約**)、`skill/SKILL.md`(LLM 產出技能)、`prompt.md`(web 使用者可貼上的 prompt)、`examples/`(黃金樣本 ×3,另需補齊至 10 份,見 M0)。

---

## 1. 產品一句話

**Markdown 的「分享與簡報層」,不是編輯器。** 使用者貼上一份「類通用 Markdown」,十秒內得到:有設計感的網頁 view、可全螢幕簡報的 HTML slide mode、可編輯且套用 template 的 pptx 下載。

## 2. 不可妥協的設計原則(實作時的裁決依據)

1. **MD 是唯一 SoT**;HTML 頁面、slide、pptx 都是投影。三者只求語意一致,不求像素一致。
2. **類通用 MD(graceful degradation)**:文件在 GitHub/Obsidian 打開必須是正常 Markdown。本產品的專屬資訊只能放 frontmatter 與 HTML 註解 directive。任何實作若導致 MD 在一般 viewer 出現可見雜訊,即為 bug。
3. **Runtime 零 LLM**:parser → IR → renderer 全程確定性。同輸入必同輸出、可離線、可 snapshot test。
4. **純前端**:單一靜態站(Vite build 產物),可丟任何內網 web server。無後端、無帳號、無遠端儲存。文件內容不得離開瀏覽器。
5. **Directive 詞彙表凍結在 v1 的 6 個**(見 PROFILE.md)。實作中若覺得需要新 directive,先用現有語彙 + design rules 解決;真的不行,記入 `DECISIONS.md` 留待 v2,不得私自擴充。

## 3. 技術選型(已定案)

| 項目 | 選擇 | 備註 |
|---|---|---|
| 建置 | Vite + TypeScript + React | SPA、靜態輸出 |
| Editor | CodeMirror 6(markdown mode) | 貼上點,不是寫作點;不做協作 |
| MD 解析 | unified / remark(remark-parse + remark-frontmatter + remark-gfm) | directive 從 HTML 註解 node 解析,自寫小 plugin |
| Slide runtime | **自製**(不用 reveal.js) | IR 已承擔語意結構;自製輕量:全螢幕、方向鍵/空白鍵翻頁、Esc 退出、`?p=N` 深連結、speaker notes 面板(`s` 鍵) |
| pptx | pptxgenjs(瀏覽器內執行,`writeFile()` 觸發下載) | 注意 §7 的坑清單 |
| 圖表 | mermaid(瀏覽器內 render SVG) | pptx 端 SVG→PNG 轉換走 canvas |
| 樣式 | CSS custom properties,全部顏色/字型/間距吃 template config | 禁止硬編碼色票 |
| 測試 | Vitest;golden samples 做 IR snapshot 測試;pptx 輸出做結構斷言(JSZip 解包驗 XML) | |

## 4. 架構與資料流

```
MD 字串
  → parse(remark)→ mdast + frontmatter + directive 註解
  → buildIR()     → SlideDoc(IR,見下)
  → renderPage(ir, templateConfig)   → React 頁面 view
  → renderSlides(ir, templateConfig) → React slide mode
  → renderPptx(ir, templateConfig)   → pptxgenjs → .pptx 下載
```

### IR 型別(起點定義,可增欄位、不可改語意)

```ts
type SlideDoc = {
  meta: { title?: string; author?: string; date?: string;
          template: string; lang: "zh-TW" | "en" | string };
  slides: Slide[];
};

type Slide = {
  layout: LayoutIntent;          // 明示 directive 或 design rules 推斷
  layoutSource: "directive" | "inferred";
  blocks: Block[];               // split 之後為 [left, right] 兩組時見 columns
  columns?: [Block[], Block[]];
  notes?: string;
  headingPath: string[];         // 供頁碼/導覽
};

type LayoutIntent =
  | "title" | "section" | "content" | "two-col"
  | "big-stat" | "quote" | "cards" | "diagram";

type Block =
  | { kind: "heading"; depth: 1|2|3; text: InlineText }
  | { kind: "para"; text: InlineText; emphasis?: boolean }
  | { kind: "list"; ordered: boolean; items: ListItem[]; shape?: "plain"|"cards"|"steps" }
  | { kind: "quote"; text: InlineText; cite?: string }
  | { kind: "code"; lang?: string; value: string }
  | { kind: "table"; header: InlineText[]; rows: InlineText[][] }
  | { kind: "image"; url: string; alt?: string }
  | { kind: "diagram"; engine: "mermaid"; source: string; svg?: string }
  | { kind: "stat"; value: string; label: string };   // design rules 從 para/list 升格
```

### Design rules v1(確定性,實作在 `buildIR` 的 shape-detection pass)

依序套用,先中先贏:

1. **frontmatter 存在 → 第一頁為 `title` layout**(title/author/date)。
2. **H1 或 H2 開頭 → 新 slide**;`---`(thematic break)→ 強制分頁。單獨一個 H1 且該頁無其他內容 → `section` layout。
3. **`<!-- layout: X -->` directive → 覆蓋一切推斷**。
4. **清單 shape 偵測**:≥3 個項目且每項符合「**粗體詞**:說明」或「**粗體詞** — 說明」→ `shape: "cards"`,slide layout 升為 `cards`;有序清單且項目 ≤5 → `shape: "steps"`。
5. **big-stat 偵測**:段落以數字/百分比/金額開頭且全段 ≤ 20 字(如「37% 的工單…」)→ 升格為 `stat` block;若該頁 stat ≥1 且其他內容少 → layout `big-stat`。
6. **blockquote → `quote` block**;若整頁只有 quote → layout `quote`。
7. **mermaid code block → `diagram` block**;整頁以 diagram 為主 → layout `diagram`。
8. **溢版降級**:HTML 端以 DOM 量測;超出安全區 → 依序嘗試 (a) 字級縮一級 (b) 卡片轉直排 (c) 加「內容過多」警示 badge(不自動拆頁,拆頁是作者的決定)。pptx 端沿用 HTML 量測結果選定的字級。

### Template config(內建 2 套 + schema)

```ts
type TemplateConfig = {
  id: string; name: string;
  page:  { widthIn: 13.33; heightIn: 7.5 };            // LAYOUT_WIDE
  colors: { primary: string; onPrimary: string; surface: string;
            onSurface: string; accent: string; muted: string }; // 6 碼 hex,無 #
  fonts:  { display: string; body: string; mono: string };      // 中文 fallback 必填
  layouts: Record<LayoutIntent, LayoutSpec>;           // 每個 intent 的座標/樣式配置
  mermaidTheme: Record<string, string>;                // 餵 themeVariables
};
```

內建兩套:`clean-light`(白底、單主色壓場)與 `midnight`(深底、title/section 深色、content 淺色的三明治結構)。所有顏色集中在 config,CSS 端轉為 custom properties,pptxgenjs 端直接取用。

## 5. 里程碑(建議依序,各自可驗收)

### M0 — 規格落地與樣本補齊(Phase 0 收尾)
- 熟讀 `spec/PROFILE.md`,實作 **profile linter**(CLI + 站內即時):驗 frontmatter schema、directive 詞彙合法性、`<!-- split -->` 只出現在 two-col 頁等。
- 依 PROFILE.md 補齊黃金樣本至 10 份(現有 3 份為風格錨點),新增場景:季度 OKR 回顧、系統架構提案(重 mermaid)、事故複盤、產品 roadmap、教學講義、一頁備忘(短文件)、中英混排技術規格。每份樣本必須通過 linter。
- 驗收:`npm run lint:samples` 全綠。

### M1 — Parser + IR
- remark pipeline + directive 解析 plugin + `buildIR()` 含 design rules 1–7。
- 驗收:10 份樣本的 IR snapshot 測試建立且通過;人工抽查 layout 推斷符合直覺。

### M2 — HTML 頁面 view + slide mode
- 頁面 view(Notion page 質感:窄欄、大標題、舒適行高)與 slide mode(自製 runtime)。
- 編輯器三欄體驗:左 CodeMirror、右 preview(頁面/slide 切換)、頂欄 template 切換 + Export 按鈕。
- 溢版量測與降級(design rule 8)。
- 驗收:10 份樣本可完整簡報;鍵盤操作齊全;template 即時切換。

### M3 — pptx export
- `renderPptx()`:每個 LayoutIntent 對應一個 pptxgenjs 佈局函式;文字全部為原生文字框(可編輯);表格用 `addTable`;speaker notes 用 `addNotes`。
- 輸出驗證:JSZip 解包斷言(slide 數、notes 存在、無非法色碼)。
- 驗收:10 份樣本輸出的 pptx 在 PowerPoint/LibreOffice 開啟零損毀、文字可編輯、無溢版;`soffice --headless --convert-to pdf` 可作 CI 冒煙測試。

### M4 — Mermaid + 收尾
- mermaid render(SVG 內嵌 HTML;pptx 走 SVG→canvas→PNG→`addImage`,寬高依 SVG bbox 等比縮入安全區)。
- `themeVariables` 吃 template config 的 `mermaidTheme`(換 template,圖跟著換色)。
- 站內「AI 產生」入口:僅是一個複製 `prompt.md` 內容的按鈕(runtime 不接 LLM)。
- 驗收:含 mermaid 的樣本在三種輸出皆正確;PRD Phase 1 全部驗收條款通過(貼上→可簡報 <10s、→下載 pptx <30s)。

## 6. 驗收總表(= PRD Phase 1)

- [ ] 10 份黃金樣本在 GitHub render 下無可見雜訊(directive 隱形)
- [ ] 10 份樣本:HTML slide 可直接簡報、pptx 零損毀、文字可編輯、無溢版
- [ ] 內建 2 套 template,切換即時生效於三種輸出
- [ ] mermaid 三種輸出正確,配色跟隨 template
- [ ] 溢版偵測 + 自動降級 + 警示 badge
- [ ] profile linter(站內即時 + CLI)
- [ ] 全程無網路呼叫(mermaid 等函式庫打包進 bundle,不走 CDN)
- [ ] `npm run build` 產出單一靜態站,`npx serve dist` 即可用

## 7. pptxgenjs 已知坑(必讀,違反多數會直接損毀檔案)

- `pres.layout = "LAYOUT_WIDE"` 必須在加任何 slide 前設定(預設畫布是 10"×5.625",座標超界不會報錯、內容直接消失)。
- 色碼**不能帶 `#`、不能 8 碼**:`color: "FF0000"`。半透明用 `transparency: 0-100`(fill/image)或 `opacity`(shadow),兩者不可互換。
- pptxgenjs 會**就地修改傳入的 options 物件**(轉 EMU),同一個 shadow/options 物件不可重用於兩次 `add*` 呼叫。
- shadow `offset` 不可為負(向上投影用 `angle: 270` + 正 offset)。
- 清單:每項 `bullet: true`,**絕不**手打「•」;除最後一項外每項 `breakLine: true`;段距用 `paraSpaceAfter` 不用 `lineSpacing`。
- 一個輸出檔一個 `new pptxgen()` 實例,不可重用。
- 文字框有內建 padding,要與圖形對齊時設 `margin: 0`。
- speaker notes 一律 `slide.addNotes()`,不放文字框。
- 圖表能用 `addChart()` 原生做就原生做;stacked bar/column 的 `dataLabelPosition` 只能 `ctr`/`inEnd`/`inBase`(`outEnd` 會損毀檔案)。
- 產出後跑結構驗證(M3 的 JSZip 斷言),修 generator 不修輸出。

## 8. 專案結構建議

```
src/
  parser/        # remark pipeline、directive plugin、linter
  ir/            # 型別、buildIR、design rules(純函式,重點測試區)
  render-html/   # 頁面 view、slide runtime、溢版量測
  render-pptx/   # pptxgenjs generator(每個 LayoutIntent 一個模組)+ 輸出驗證
  templates/     # clean-light.ts、midnight.ts、schema
  app/           # editor UI、狀態、export 流程
spec/PROFILE.md  # 唯一合約(隨 repo 走)
skill/SKILL.md
prompt.md
examples/        # 10 份黃金樣本(= 測試 fixtures)
DECISIONS.md     # 實作期間的裁決記錄(含被否決的 directive 提案)
```

## 9. 明確的非目標(不要做)

協作編輯、帳號/登入、雲端儲存、分享短連結、reveal.js、PlantUML/Kroki、企業 .potx 萃取(Phase 2)、runtime 呼叫 LLM、動畫轉場(pptx 端一律無動畫)。

## 10. 完成後的交付物

1. 可 build 的 repo(結構如 §8),README 含自架說明(任意靜態伺服器)。
2. 10 份黃金樣本 + 全綠測試(IR snapshot、linter、pptx 結構斷言)。
3. `DECISIONS.md`:期間所有偏離本文件的裁決與理由。
4. 一段 3 分鐘內的操作示範腳本(文字即可):貼上樣本 → 簡報 → 換 template → 下載 pptx。
