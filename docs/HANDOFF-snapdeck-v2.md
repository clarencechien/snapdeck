# HANDOFF — SnapDeck v2:文件態(Blog)+ 雙態一次 render

> 給 Claude Code:這是接手 SnapDeck v2 第一里程碑的實作交接。
> 搭配 `ADR-001-v1-to-v3.md` 一起讀(那份說明「為什麼」,這份說明「做什麼」)。
> 對象 repo:`clarencechien/snapdeck`(現況 v0.6.0,Phase 1 已結案,見 `docs/STATUS.md`)。
> **v2 不是新專案,是在現有 IR 上多掛一個 render target,並把既有的「全版閱讀頁」升級為正式的文件態。**

---

## 0. 一句話

同一份**夠具體的 MD**,一次 render 出兩種東西:**Blog 文件態**(密集、可獨立閱讀)與 **Slide 發表態**(稀疏、從文件摘要而來)。v2 先只做 Blog 這一種文件態,把 blog↔slide 的雙態鏈路打通,作為 next-gen 五態架構的 PoC。

## 1. 現況盤點(接手前先確認)

repo 已具備,**直接復用、不要重寫**:
- **Parser + IR**:`remark`(remark-parse + frontmatter + gfm)→ IR(Slide Tree)。這是雙態共用的基礎。
- **Slide renderer**:HTML slide mode + pptx(pptxgenjs),含 design rules、溢版偵測、5 套 template。
- **全版閱讀(blog 式)+ 單檔 HTML 匯出**(STATUS 的 D16):**這就是文件態的雛形**,v2 的工作是把它從「slide 內容的攤平顯示」升級為「以文件為母體的正式 render target」。
- profile linter、6 個 directive、localStorage、分享連結、Drop mode。

**接手第一步**:讀 `docs/STATUS.md` 與 repo 的 IR 型別定義、既有全版閱讀元件,確認下面的設計與現況一致;若 repo 用語與本文件不同,以 repo 為準,並在 `DECISIONS.md` 記下對應。

## 2. v2 的核心觀念轉變(務必內化)

v1 的心智模型是「**MD → 分頁 → 簡報**」,slide 是主體、閱讀頁是附帶。
v2 反轉為「**密集 MD(母體)→ 文件態(主)+ slide 發表態(從)**」。

關鍵是**密度不對稱**:
- 文件態 = 密集(完整句子、完整段落、可獨立閱讀)。
- slide 態 = 稀疏(要點、關鍵句)。
- **文件 → slide 是「摘要」(降密度),可自動;slide → 文件是「擴寫」,不可自動。**
- 因此 **SoT 必須是文件級密度的 MD**;slide 從它派生。這決定了 v2 的資料流方向與 prompt 引導方向。

一份 MD 若只寫了 slide 級的要點,它撐不起 blog——所以意圖澄清 prompt(§6)的職責,是引導 user 的 LLM 產出**文件密度**的母體。

## 3. 資料流(v2)

```
夠具體的密集 MD(user 帶 LLM 產出)
        │
        ▼
   parse → IR(共用,既有)
        │
        ├──► DocRenderer(Blog)   ← v2 新增:文件態,密集全量呈現
        │
        └──► SlideRenderer         ← 既有:對 IR 做「摘要投影」後分頁
                └─ 摘要投影 = DocIR → SlideIR 的降密度轉換(v2 新增這層)
```

要點:
- **一次 parse,兩個 renderer 吃同一棵 IR。** 不做兩份 MD、不做兩次解析。
- Blog renderer 直接吃完整 IR。
- Slide renderer 前面插一個 **摘要投影層(summarizer,確定性,非 LLM)**:把文件密度的 IR 降成 slide 密度的 SlideIR,再走既有 slide 分頁與 render。

## 4. 摘要投影層(v2 唯一的新演算法,確定性)

這是「文件自動變 slide」的核心,**必須是確定性規則,不接 LLM**(維持 v1 的 runtime 零 LLM 原則):

輸入:DocIR(文件態的完整 IR)。輸出:SlideIR(既有 slide 分頁引擎吃的形狀)。

規則 v1(先中先贏,可在 DECISIONS.md 迭代):
1. **分頁錨點**:H1 → 章節頁(section);H2 → 新 slide。文件裡 H2 之下的長內容,在 slide 態只取「摘要投影」。
2. **段落 → 要點**:文件態的完整段落,在 slide 態取該段第一句或 frontmatter/directive 指定的要點;連續多段 → 收斂為項目清單(≤5 條)。
3. **保留既有形狀升級**:文件裡「**粗體詞**:說明」清單、數字開頭段落、blockquote、mermaid 等,沿用 v1 design rules(卡片/大數字/引言/圖)。
4. **明確標記優先**:若某段帶 `<!-- slide: keep -->` 全量帶入 slide;帶 `<!-- slide: skip -->` 不進 slide(只存在於文件態);帶 `<!-- slide: "自訂要點" -->` 用該字串當這頁的 slide 內容。
5. **溢版**:摘要後仍套用既有 slide 溢版偵測與降級。

> directive 擴充:v2 只新增一個 directive family `slide:`(值:`keep` / `skip` / 任意字串),用來讓作者/LLM 精準控制「這段在文件態顯示什麼、在 slide 態摘要成什麼」。**不得新增其他 directive**(維持 v1 的詞彙表克制原則);若覺得需要,記入 DECISIONS.md 待 v3 評估。

## 5. Blog 文件態 renderer(v2 主要交付)

把既有「全版閱讀頁」升級為正式文件態,要求:
- **資訊形狀**:長文流(標題階層 + 完整段落 + 內文圖 + 表格 + mermaid + callout/emphasis)。這是五種文件態裡最基礎、最泛用的一種。
- **排版品質對標**:Notion page / 高完成度部落格。窄閱讀欄(measure ~65–75 字元)、清楚的標題階層、舒適行高、圖表置中、程式碼區塊樣式、blockquote 樣式。
- **吃 template config**:沿用 v1 的 5 套 template 的色票與字型(文件態與 slide 態視覺同源);顏色/字型一律走 CSS custom properties,不硬編碼。
- **mermaid**:文件態內嵌 SVG(既有能力)。
- **輸出**:(a) 站內文件態 preview;(b) 既有單檔 HTML 匯出升級為文件態版型(CSS + mermaid SVG 全內嵌、零外部依賴,可寄信/丟靜態空間)。

## 6. 意圖澄清 meta-prompt(v2 交付,先只做 blog 版)

產出一份 `prompts/blog-intent.md`:user 複製後帶去**自己的 LLM**(非 BYOK、不經本服務),被一步步引導,產出「文件密度」的 blog 級 MD,再貼回 SnapDeck 一次 render 出 blog + slide。

這份 prompt 必須同時做兩件事(它本質是 v1 `SKILL.md` 的對話版 + blog 特化):
1. **蘇格拉底式提問澄清意圖**:這篇給誰看?最想讓人記住哪一件事?是知識整理、故事、還是說服?需要幾個章節?——**一次一個問題,逼出母體**。
2. **格式合約**:引導產出的 MD 必須符合 SnapDeck profile(frontmatter + 6 個既有 directive + 新增的 `slide:` family),且達到**文件密度**(每個 H2 之下有可獨立閱讀的完整段落,不是要點)。
3. **收斂訊號**:引導到最後,LLM 主動輸出一個以 ```md fence 包裹的定型區塊 + 一句「意圖已收斂,複製上方 md 回到 SnapDeck」。讓「stable」是設計出來的終點線,不是 user 憑感覺判斷。**注意**:既有貼上流程已能自動剝除 fence(STATUS D18),與此相容。

驗收這份 prompt 的方式:拿去 Claude 與一個非 thinking 模型(如 Gemini 一般版,對照 STATUS D20 的既有實測)各跑一次,產出的 md 直接貼進 SnapDeck,blog 態要能獨立閱讀、slide 態要能簡報,兩者同源無矛盾。

## 7. UI 改動(最小)

- preview 區頂欄新增**態切換**:`文件` / `簡報`(沿用既有 template 色點切換的位置與互動)。預設落在**文件態**(v2 的主體)。
- 貼上/載入一份夠具體的 md 後,**同時**可切看兩態——這一刻(「原來我的內容可以同時是這兩種樣子」)就是要給 user 的 0→1 fu,是 v2 體驗的核心,務必順暢無延遲。
- Export 選單新增:文件態單檔 HTML(升級既有匯出);slide/pptx 維持既有。
- 站內「AI 產生」入口新增一顆「引導我寫 blog」→ 複製 `prompts/blog-intent.md`(runtime 仍零 LLM)。

## 8. 里程碑

- **M1 — 摘要投影層**:DocIR → SlideIR 的確定性 summarizer + `slide:` directive。既有 slide/pptx 全部改成吃「投影後的 SlideIR」,現有 6 份黃金樣本的 slide 輸出不得退化(snapshot 對照)。
- **M2 — Blog 文件態 renderer**:升級全版閱讀為正式文件態 + 文件態 HTML 匯出。
- **M3 — 態切換 UI + 雙態一次 render**:一份 md 同時出 blog + slide,頂欄切換,零延遲。
- **M4 — blog 意圖 meta-prompt** + 站內入口 + 端到端驗收。

## 9. 驗收(v2 完成定義)

- [ ] 一份文件密度的 md,一次 render 同時得到可獨立閱讀的 blog 與可簡報的 slide,兩者同源、無矛盾。
- [ ] 摘要投影層為確定性(同輸入同輸出),runtime 零 LLM 呼叫。
- [ ] 既有 6 份黃金樣本的 slide/pptx 輸出無退化(snapshot 通過);另新增 ≥3 份 blog 密度樣本(知識整理 / 故事 / 說服各一)。
- [ ] `slide:` 為 v2 唯一新增 directive;無其他詞彙擴充(否則記 DECISIONS.md)。
- [ ] blog 意圖 meta-prompt 在 Claude 與一個非 thinking 模型上都能引導出合規、文件密度的 md。
- [ ] 文件態單檔 HTML 匯出零外部依賴。
- [ ] `npm run build` 仍為單一靜態站;`npm test` 全綠(含新增 summarizer 測試)。

## 10. 明確非目標(v2 不做,留給 v3+)

- 其餘四種文件態(cv / travel guide / dashboard / landing)——v2 只驗 blog。
- cv/dashboard 的「單頁綜覽」形狀與其回 slide 的降級處理。
- csv/資料串輸入 → dashboard 的資料萃取。
- 五態縮圖同屏挑選、`primary:` frontmatter 指定主態。
- 任何 runtime LLM、任何後端、任何持久化超出既有 localStorage。
- eject-to-Claude-Code 的接手 prompt(v3;v2 先把雙態鏈路跑通)。

## 11. 交付物

1. 更新後的 repo(summarizer + blog 文件態 + 態切換 UI + `prompts/blog-intent.md`)。
2. `DECISIONS.md` 追加 v2 段:所有偏離本文件的裁決與理由。
3. `docs/STATUS.md` 追加 v2 結案對照表。
4. ≥3 份 blog 密度黃金樣本(進 test fixtures)。
