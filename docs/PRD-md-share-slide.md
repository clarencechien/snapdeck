# PRD — MD Share & Present(暫名)

版本:v0.1 草稿
日期:2026-07-13
狀態:內部討論用

---

## 1. 一句話定位

**Markdown 的「分享與簡報層」,不是編輯器。** 使用者(人或 LLM)在任何地方寫好一份「類通用 Markdown」,貼進來十秒內得到:一份有設計感的網頁、一組可直接開會的 HTML slide、一份套用企業官方 template 且可編輯的 pptx。

## 2. 問題陳述

- 每個人都有慣用的 editor(VS Code、Obsidian、Vim、LLM 對話),市場不缺編輯器,缺的是「寫完之後」到「拿去分享/報告」之間的最後一哩。
- 現有工具的落差:
  - **HackMD / CodiMD**:協作編輯器為核心,slide mode(reveal.js)陽春,無企業 template pptx 輸出;OSS 版(CodiMD)維護狀態不佳。
  - **Marp / Slidev**:面向工程師的 slide 工具,pptx 輸出是整頁圖片(不可編輯),企業場景不可用;需要學專屬語法。
  - **Notion**:分享頁體驗好,但內容被鎖進平台,無 slide/pptx,無法自架。
- 企業內部場景的硬需求:(1) 輸出的 pptx 必須**可編輯**(主管一定會改兩個字再轉發);(2) 必須套**公司官方 template**;(3) 內網/資安環境,資料不可外流,需可自架或純前端。

## 3. 目標用戶與場景

| 用戶 | 場景 |
|---|---|
| 企業內部工程師/PM | 用 LLM 或 editor 產出週報、提案、技術說明 → 需要在會議上快速呈現,或轉成主管要的 pptx |
| LLM 工作流 | Claude/GPT 依 skill 產出合規 MD → 一鍵變成可分享的頁面與簡報 |
| 內部知識分享者 | 把筆記變成看起來「正式」的頁面連結傳給同事 |

非目標用戶:需要精雕細琢每頁動畫與版面的設計師、需要即時多人協作編輯的團隊(那是 HackMD 的戰場)。

## 4. 核心設計原則

1. **MD 是唯一 SoT。** HTML 頁面、HTML slide、pptx 都只是同一份 MD 的投影。不追求投影之間像素一致,只追求語意一致。
2. **類通用 MD(graceful degradation)。** 文件在 GitHub、Obsidian、任何 MD viewer 打開都是一份正常的 Markdown。本產品專屬的資訊只放在兩個隱形位置:frontmatter(文件層級)與 HTML 註解 directive(頁面/區塊層級,如 `<!-- layout: two-col -->`),其餘一律標準 CommonMark。
3. **Render engine 是確定性的,LLM 只在 build-time 介入。** Runtime 渲染(MD → IR → HTML/pptx)完全不依賴 LLM:同一份輸入永遠得到同一份輸出、可離線、可 diff、可測試。LLM 只出現在兩個一次性時機:
   - **Template onboarding**:分析企業 pptx、產出 template config 與 design rules;
   - **Authoring(選配)**:協助作者產出 MD 與 directive(以 skill 形式)。
4. **Client-side first。** Tier-1 是純靜態站,所有解析、渲染、pptx 產出都在瀏覽器完成,資料不出瀏覽器。Server 能力(高保真 .potx 填充、PlantUML 等)是 Tier-2 選配。
5. **設計感內建,不靠使用者。** 版面美感來自 design rules(內容形狀偵測 + layout 池自動選擇),使用者只寫內容。

## 5. 系統架構總覽

```
                    ┌────────────────────────────────────┐
   類通用 MD  ──►   │  Parser (remark/unified)            │
  (SoT, 含隱形      │  MD + frontmatter + directive 註解  │
   directive)       └──────────────┬─────────────────────┘
                                   ▼
                    ┌────────────────────────────────────┐
                    │  IR:Slide Tree                     │
                    │  每頁 = layout intent + 內容塊       │
                    │  (heading/list/stat/quote/diagram) │
                    └──────┬──────────────────┬──────────┘
                           ▼                  ▼
                ┌──────────────────┐  ┌──────────────────┐
                │ HTML Renderer     │  │ PPTX Renderer     │
                │ 頁面 view +       │  │ pptxgenjs +       │
                │ slide mode        │  │ template config   │
                └──────────────────┘  └──────────────────┘
                           ▲                  ▲
                           └────────┬─────────┘
                              Template Config
                       (色票/字型/logo/layout 座標/
                        design rules — JSON)
                                    ▲
                     ┌──────────────┴──────────────┐
                     │ Template 萃取 Plugin(build-time)│
                     │ 企業 .pptx/.potx → 解析 theme/    │
                     │ layout XML + LLM 語意分類與規則生成 │
                     └─────────────────────────────┘
```

關鍵資料結構:

- **MD Profile Spec**:定義合法的 frontmatter 欄位、directive 詞彙表(layout、emphasis、pagebreak 等)、內容塊約定。這份 spec 同時就是 LLM skill 的核心內容。
- **IR(Slide Tree)**:與呈現無關的語意結構。每個 slide node 帶 layout intent 與 typed content blocks。
- **Template Config(JSON)**:一家企業一份(或內建數份)。含色票、字型、資產(logo)、每個 layout intent 對應的座標配置、design rules(內容形狀 → layout 的選擇規則、字級縮放曲線、溢版降級策略)。

## 6. 分階段交付計畫

### Phase 0 — MD Profile Spec + Skill(規格先行)

**目標**:把「類通用 MD」定義成一份可執行的規格,讓人與 LLM 都能穩定產出。

範圍:
- MD Profile v1 規格文件:frontmatter schema、directive 詞彙表 v1(先收斂在 6–8 個:`layout`、`section`、`columns`、`emphasis`、`notes`、`pagebreak`)、分頁規則(`---` 與 H1/H2 的關係)。
- SKILL.md v1:教 LLM 依此 profile 產出 MD 的技能文件,含正反例。
- 10 份黃金樣本文件(週報、提案、技術分享、產品簡介等),作為後續所有 renderer 的驗收基準。

交付物:spec 文件、SKILL.md、golden samples。
驗收:同一份樣本在 GitHub 上看起來是正常 MD(directive 隱形);LLM 依 skill 產出的 MD 通過 profile linter。
非目標:任何 UI、任何 renderer。

### Phase 1 — MVP:純前端靜態站(核心體驗驗證)

**目標**:驗證「貼上 MD → 十秒拿到能開會的 slide 與可編輯 pptx」這個體驗是否成立。

範圍:
- 貼上式極簡 editor(CodeMirror + 即時 preview),定位是貼上點不是寫作點。
- Parser → IR → **HTML 頁面 view**(Notion page 質感)與 **HTML slide mode**(全螢幕、鍵盤翻頁、speaker notes)。
- **pptx export**:pptxgenjs 在瀏覽器內產出,可編輯的原生文字框與圖表。
- **內建 2–3 套通用 template config**(不含企業 template),展示同一份 MD 換 template 的效果。
- **Mermaid 支援**:code block 瀏覽器內 render 成 SVG;HTML 直接內嵌,pptx 端轉 PNG 置入;mermaid `themeVariables` 吃 template 色票,圖自動長成配套顏色。
- **確定性 design rules v1**(內建 template 附帶):內容形狀偵測(「粗體詞:說明」清單 → 卡片、數字開頭段落 → big-stat、blockquote → callout)、內容密度 → 自動選 layout、溢版偵測(DOM 量測)與自動降級/警告。
- 部署:單一靜態站,可丟任何內網 web server 自架。

交付物:可用的靜態站 + 內建 templates + design rules v1。
驗收:10 份黃金樣本全數通過——HTML slide 可直接簡報、pptx 在 PowerPoint 開啟無損毀、文字可編輯、無溢版;從貼上到下載 pptx 全程 < 30 秒。
非目標:帳號、儲存、分享連結、協作、企業 template。

### Phase 2 — 企業 Template 萃取 Plugin(enterprise onboarding)

**目標**:一家企業的官方 pptx,做一次性 onboarding,之後所有 MD 自動套用。

範圍:
- **自動萃取器**:解析 .pptx/.potx(theme1.xml 色票與字型、slideMaster/slideLayout 的 placeholder 幾何、media 資產)→ 產出 template config 骨架。約可自動完成八成。
- **LLM 輔助的語意標註與規則生成(build-time,一次性)**:
  - 自動 render 每個 layout 縮圖,LLM(或人)看圖將 layout 對應到 IR 的 layout intent(章節頁/兩欄/圖文/純標題…)。
  - LLM 依 template 的視覺特性產出這套 template 專屬的 design rules(主色運用比例、強調樣式、卡片風格),寫入 config。
  - **產出後的 config 是純 JSON,runtime 完全不需要 LLM。**
- Onboarding UI:上傳 pptx → 預覽萃取結果 → 人工微調 mapping → 存檔為 config。
- SVG/EMF 向量裝飾元素的處理:轉為點陣資產帶入 config(明示此限制)。

交付物:萃取 plugin(可為獨立工具或站內功能)+ config 格式 v2 + onboarding 流程。
驗收:拿 2–3 家真實企業 template 實測,黃金樣本套用後,輸出 pptx 被該企業使用者認可為「像我們公司的簡報」;onboarding 一套 template(含人工微調)< 1 小時。
非目標:掛回原 slide master 的高保真模式(Phase 4)。

### Phase 3 — LLM 藝術指導 Pass(authoring-time,選配)

**目標**:在確定性底座之上,提供選配的「AI 排版建議」,拉開與單純 MD render 的視覺差距。

範圍:
- LLM 讀整份 MD,**輸出的不是 HTML 而是 directive 註解**(這頁用 section-break、這清單升級 icon 卡片、這個數字全場放大),寫回 MD——產物仍是類通用 MD,可 diff、可撤銷、離線環境不依賴。
- 站內「AI 潤飾」按鈕(可設定走 API 或不啟用)+ SKILL.md v2(把藝術指導規則納入 skill,讓上游 LLM 產 MD 時一次到位)。
- Directive 詞彙表 v2 擴充(依 Phase 1/2 實測需求)。

交付物:AI 潤飾功能、SKILL.md v2、directive spec v2。
驗收:盲測中,潤飾後版本相對純規則版本的偏好率顯著較高;潤飾輸出 100% 通過 profile linter(LLM 只能寫合法 directive)。
非目標:LLM 直接產 HTML/pptx、runtime 依賴 LLM。

### Phase 4 — Server Tier(高保真與生態擴充)

**目標**:補齊純前端做不到的企業級能力。

範圍(依需求排優先序):
- **.potx 高保真填充**:server 端以「unzip → 填 slide XML → zip」方式直接在客戶 template 上生成,輸出 pptx 真正掛在客戶 slide master 之下(主題色/字型跟隨 master)。
- **Kroki 整合**:PlantUML、Graphviz、D2 等十餘種圖表格式(自架 container,內網可用)。
- 分享基礎設施:短連結/permalink、閱讀權限、版本快照。
- 部署形態:docker-compose 一鍵自架。

交付物:server 版(前端站 + API + Kroki)。
驗收:同一份 MD,client 版與 server 高保真版輸出語意一致;PlantUML 樣本在內網環境可渲染。
非目標:多人即時協作編輯(永久非目標)。

## 7. 成功指標

- **北極星**:每週「貼上 → 產出(present 或 export)」完成次數。
- Phase 1:貼上到可簡報 < 10 秒;貼上到下載 pptx < 30 秒;pptx 開啟零損毀率。
- Phase 2:企業 template onboarding < 1 小時/套;企業使用者對輸出的「像官方簡報」認可率。
- Phase 3:AI 潤飾採用率與盲測偏好率。
- 生態:依 SKILL.md 由 LLM 產出、直接通過 linter 的 MD 比例。

## 8. 風險與緩解

| 風險 | 緩解 |
|---|---|
| pptxgenjs 無法載入 .potx,企業 template 只能重實作為 config | 定位為 onboarding 成本(企業官方 template 通常 1–2 套/年);高保真需求由 Phase 4 server 路線承接 |
| pptxgenjs 已知坑多(色碼、畫布尺寸、chart 選項致檔案損毀) | 所有生成集中在單一 generator 層,配 golden-sample 回歸測試與輸出驗證 |
| HTML 與 pptx 版面不可能像素一致,使用者期望落差 | 產品敘事明確:directive 表達「意圖」,兩個 renderer 各自詮釋;不承諾一致 |
| 溢版(尤其 diagram) | 瀏覽器端 DOM/SVG 量測,export 前偵測、自動縮放/降級/警告 |
| 「為什麼不直接用 HackMD/Marp」的採用質疑 | 差異化釘死在三點:可編輯 pptx + 企業 template + 純前端可自架;MVP 驗收即以此三點為準 |
| directive 詞彙表膨脹成另一個 DSL | 詞彙表由 PRD 控管,v1 上限 8 個,新增需有兩個以上真實樣本佐證 |

## 9. 開放問題

1. 產品名稱與 OSS/商用授權策略(core OSS + 企業 plugin 商用?)。
2. Template config 的格式是否公開為開放規格(利於生態,但降低護城河)。
3. Phase 1 的 slide runtime 自製 vs 基於 reveal.js(自製控制力強、reveal 生態成熟)。
4. IR 是否對外暴露(利於第三方 renderer,但增加相容性負擔)。
5. 黃金樣本涵蓋語言:中英混排的字級與行高規則需要獨立驗證(客群以中文為主)。
