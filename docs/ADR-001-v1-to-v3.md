# ADR-001:SnapDeck 從「簡報層」演進為「單一 MD 母體、多態投影」平台(v1 → v2 → v3)

- 狀態:Accepted(v2 進行中)
- 日期:2026-07-17
- 決策者:Clarence
- 相關文件:`HANDOFF-snapdeck-v2.md`、`docs/STATUS.md`、v1 原始 HANDOFF

---

## 背景與脈絡

SnapDeck v1(Phase 1,v0.6.0 已結案)的定位是 **Markdown 的「分享與簡報層」**:一份「類通用 MD」→ 網頁閱讀頁 / HTML slide / 可編輯 pptx。核心原則:MD 為 SoT,其餘皆為投影;runtime 確定性、零 LLM;純前端、內容不離開瀏覽器。

在 v1 結案後的一系列討論中,產品的想像空間被反覆推演,並收斂出一組彼此關聯的結論。本 ADR 記錄這條推演路徑,以及它如何決定 v2/v3 的架構,避免未來重走已經走過的死路。

### 被評估並否決的方向(死路存證)

1. **CodiMD clone / 用 PocketBase 自建內部 MD 筆記工具**
   - 否決理由:與 SnapDeck「不做編輯器」的創始洞察衝突;version/備份/多租戶/SSO 這些需求,若 SoT 是 git 裡的 .md,GitLab 已全數現貨提供(project/group 權限即租戶隔離,自建反而是安全深水區)。真正該寫的只有「一層薄 viewer + `?src=` 載入口」,而那層小到不值得當產品。
   - 結論:**buy(GitLab + 既有 SnapDeck)完勝 build**;若需 web 編輯體驗,自架 HedgeDoc 一天可驗。

2. **通用「輕量 app 產生器」(Glide 式,吃 MD + AI 生 mini app:記帳/旅遊手冊等)**
   - 否決理由:no-code app builder 的結構性死法——越好用,user 越快撞天花板然後搬走,留下最難養的非技術低付費使用者;AI 時代更糟,因為「一句話生 app」已被基礎模型內建,中間層存在理由蒸發。
   - 關鍵分野:**「一次性產出物」(slide/blog/單頁)vs「有狀態的工具」(記帳/追蹤)**。後者是墳場,AI 也救不了;前者是 SnapDeck 哲學的自然延伸。

### 被採納並沉澱為架構的洞察

- **意圖澄清而非生產**:0→1 之間 user 真正缺的是「先看到一個東西,才知道要不要」。產品補的是「意圖顯影」,不是成品交付。因此保真度應停在「結構真、內容真、樣式統一」——fu 來自「這是我的內容長出來的樣子」,而非漂亮空殼。
- **空白框是關上的門**:開場應以引導式提問取代空白輸入框。
- **LLM 完全外部化**:不做 BYOK、不代管金鑰、不承擔 API 成本。產品交給 user 一份 meta-prompt,user 帶去問**自己的** LLM 直到意圖 stable,再把 md 帶回來 render。產品本體因此縮為「三份 prompt(開場引導 / 意圖澄清 / eject 接手)+ 確定性 render 引擎」,可做成 **freeware、幾乎零維護包袱**。
- **eject 是一等公民,不是逃生門**:撞到天花板不是搬走,而是把 md + 一份接手 prompt 交給 Claude Code 繼續長。SoT 是可帶走的 md,這道「門」取代了 no-code 的「天花板」。
- **統合洞察(本 ADR 的核心決策)**:slide 是「呈現/發表場合的終點」,其餘皆為「文件」;而**文件能自動回到 slide**。深入後確立真正的統一軸是 **密度**,而非並列的格式。

## 決策

**將 SnapDeck 從「MD → 簡報層」重構為「單一密集 MD 母體 → 多態投影」平台。**

統一模型:
- **SoT = 一份文件級密度的 MD**(完整句子、完整資料、可獨立閱讀)。
- **文件態(密集)= 主**:依「資訊形狀」分為(最終)五種 render target——blog / cv / travel guide / dashboard / landing。
- **發表態(稀疏)= 從**:slide / pptx,由文件態經**確定性摘要投影**降密度而來。
- **開發態出口**:eject 為 md + 接手 prompt,交 Claude Code。

**方向性原則(不可違反)**:密度只能單向自動降階。文件 → slide 是摘要(可自動、確定性);slide → 文件是擴寫(需補內容,不自動化)。因此**母體必須夠肥**,一切引導(意圖澄清 prompt)以「產出文件密度」為目標。

**不變式(繼承 v1)**:MD 為唯一 SoT;runtime 確定性、零 LLM(LLM 只在 user 端的 authoring 階段,經外部化的 meta-prompt);純前端、內容不離開瀏覽器;directive 詞彙表克制,新增需存證。

## 演進路徑

### v1(已結案)— 簡報層
MD → 閱讀頁 / slide / pptx;5 套 template、mermaid、分享連結、零知識短連結、Drop mode。閱讀頁此時是「slide 內容的攤平」,尚非正式文件態。

### v2(進行中)— 文件態(Blog)+ 雙態一次 render 的 PoC
- 新增**摘要投影層**(DocIR → SlideIR,確定性),把資料流從「MD→分頁」反轉為「密集 MD →(文件態主 / slide 態從)」。
- 將既有全版閱讀頁升級為正式 **Blog 文件態** renderer。
- 一份夠具體的 md **一次 render 出 blog + slide 兩態**(態切換 UI)。
- 產出 **blog 意圖澄清 meta-prompt**(user 帶去自己的 LLM)。
- 新增唯一 directive family `slide:`(keep/skip/自訂要點),控制單段在兩態的呈現。
- 定性:**v2 是 next-gen 五態架構的 PoC**——只驗 blog 一種文件態,把「文件↔slide 雙態同源」這條核心鏈路跑通。

### v3(規劃)— 完整 next-gen:五態 + 意圖引導 + eject
- 補齊其餘四種文件態:cv / travel guide / dashboard / landing(按「資訊形狀」而非「用途」定義,五種形狀覆蓋無限用途)。
- 處理 **cv/dashboard 的單頁綜覽特性**:此二者價值在「一屏綜覽/對比」,回 slide 屬降級,支援但非主打;blog/landing/travel guide 回 slide 則自然無損。
- **資料輸入管道**:csv / 資料串 → 由 user 端 thinking model 經 meta-prompt 萃取 → dashboard 文件態(資料綁定;若需輕互動則劃紅線交 eject)。
- **進站給驚喜、出站給精確**:進站以「五態縮圖同屏」讓 user 眼睛挑(0→1 的 fu);出站以 `primary:` frontmatter 明確指定主態,供 eject 給 Claude Code 的接手 prompt 使用。
- **eject 接手 prompt** 成為一等交付物。
- 商業形態:freeware、零維護;護城河集中在**三份 prompt 的品質**(尤其意圖澄清 meta-prompt)與確定性 render 的美感,而非生成品質(不與 v0/Lovable 在生成品質上正面競爭)。

## 後果

### 正面
- SnapDeck 既有能力(IR、slide/pptx renderer、design rules、template、mermaid)**全部被納入而非取代**;v2/v3 是在同一棵 IR 上加 render target,純加法、不動核心。
- 產品敘事收斂為一句:**「一份 MD → 五種閱讀態 + 一種發表態 + 一個開發態出口」**,user 只寫一次內容。
- 零後端、零金鑰託管、可 freeware;隱私天然(LLM 在 user 端)。
- 以 eject 取代天花板,結構上免疫 no-code app builder 的死法。

### 負面 / 風險
- **全部價值壓在三份 prompt 上**,尤其意圖澄清 meta-prompt——它是唯一護城河,也是唯一會失敗的地方(要同時做到蘇格拉底提問 + 格式合約 + 收斂訊號,且跨不同 LLM 穩定)。
- **跨 app 往返摩擦**:「複製 prompt → 去自己的 LLM → 帶 md 回來」可能成為新的「關上的門」,尤其對非技術大眾;需保留站內引導/貼 md 的降級路徑。
- **密度依賴**:若 user 產出的 md 不夠密集,雙態同源會失衡(slide 尚可、blog 單薄);引導成敗決定體驗成敗。
- **prompt-to-mockup 賽道擁擠**(v0/Lovable/bolt);差異化必須釘死在「MD 為 SoT、可帶走、可 eject、freeware」,不可漂移到比拚生成品質。

## 備註

本 ADR 為 v1→v3 的方向性主檔。個別實作裁決記於 `DECISIONS.md`;v2 的「做什麼」記於 `HANDOFF-snapdeck-v2.md`。未來若 v3 的某項(如資料輸入、eject prompt)複雜到需獨立決策,另開 ADR-002+ 並在此回鏈。
