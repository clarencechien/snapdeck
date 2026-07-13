# SnapDeck

**寫作即排版,貼上即上台。** — 線上版:https://snapdeck.ai-apps.work(Phase 1 已結案,狀態見 [`docs/STATUS.md`](docs/STATUS.md))

SnapDeck 是 Markdown 的「分享與簡報層」,不是編輯器。貼上一份「類通用 Markdown」,十秒內得到:

- 有設計感的**網頁 view**(Notion page 質感)
- 可全螢幕簡報的 **HTML slide mode**(鍵盤翻頁、speaker notes、深連結)
- 套用 template、**文字可編輯**的 **pptx 下載**

內建 **5 套 template**(Clean Light / Midnight / Craft / Forest / Boardroom),
preview 頂欄色點一鍵切換,HTML、slide、pptx、mermaid 配色同步生效。
貼上的內容自動存在瀏覽器 localStorage(僅本機),重新整理不遺失。

**分享連結(仿 PlantUML)**:「⛓ 分享」把目前的 MD + template 以
deflate 壓縮 + base64url 編進網址的 hash fragment(`#s=2.…`),對方開
連結即還原內容。fragment 不會送出到伺服器、不進 access log——內容
只存在連結本身,沒有任何後端儲存。三種模式:**編輯連結**(進編輯器)、
**閱讀頁連結**(`&v=page`,開啟即 blog 式全版閱讀頁)、**簡報連結**
(`&p=N`,開啟直接進全螢幕簡報第 N 頁;簡報中也可一鍵分享目前頁)。

**零知識短連結(選配)**:長文件的 `#s=` 連結可達數千字元,通訊軟體
與縮址服務會截斷。分享選單勾「⚡ 產生短連結」→ 內容在瀏覽器內 AES-GCM
加密、只上傳**密文**到 Cloudflare KV,金鑰放在 URL fragment(不會隨
請求送出)——連結縮到約 60 字元,而**伺服器讀不到任何內容**。未設定
KV 時自動退回長連結;啟用兩分鐘搞定,見 [`docs/SHORTLINK.md`](docs/SHORTLINK.md)。

**全版閱讀與 HTML 匯出**:「⤢ 全版閱讀」進入 blog 式閱讀頁;
「↓ HTML」把閱讀頁匯出成單一自含 HTML 檔(CSS 與 mermaid SVG 全內嵌,
零外部依賴),可寄信、可丟任何靜態空間。

全程純前端:解析、渲染、pptx 產出都在瀏覽器完成,**文件內容不離開瀏覽器**、零網路呼叫(mermaid 等函式庫打包進 bundle)。

## 快速開始

```bash
npm install
npm run dev        # 開發模式
npm run build      # 產出單一靜態站到 dist/
npx serve dist     # 任何靜態伺服器皆可
```

測試與 lint:

```bash
npm test               # IR snapshot、linter、pptx 結構斷言
npm run lint:samples   # 黃金樣本過 profile linter
npm run typecheck
```

## 部署到 Cloudflare(連動 GitHub)

repo 已含 [`wrangler.jsonc`](wrangler.jsonc)(靜態資產 + 極薄 Worker:僅零知識短連結 API,未綁 KV 時等同純靜態站),Cloudflare 直連 GitHub 即可交付。

**Workers 流程(新版 dashboard 預設)**:Workers & Pages → Create → 連 GitHub repo,Build 設定:

- **Build command**:`npm run build`
- **Deploy command**:`npx wrangler deploy`
- **Non-production branch deploy command**:`npx wrangler versions upload`

**經典 Pages 流程**:Framework preset 選 Vite、Build command `npm run build`、輸出目錄 `dist`。

兩種流程之後每次 push 都自動重新部署。不需要任何環境變數或 server;也可自架:`npm run build` 後把 `dist/` 丟任何內網 web server。

## 怎麼寫(MD Profile v1)

規格全文見 [`spec/PROFILE.md`](spec/PROFILE.md)(唯一合約)。重點:

- 文件在 GitHub/Obsidian 打開必須是**正常 Markdown**;專屬資訊只放 YAML frontmatter 與 HTML 註解 directive(共 6 個:`layout` `split` `notes` `emphasis` `fit` `skip`)。
- **一個 H2 = 一頁**;單獨 H1 = 章節頁;`---` 強制分頁。
- **先靠形狀,後靠 directive**:「**粗體詞**:說明」×3 → 卡片;有序清單 ≤5 → 步驟條;`數值,標籤,補充(可省)` 三欄位格式 → 大數字頁(數值可帶單位與 +,如 `10,000+ 小時`);連續 2–4 段同格式 → KPI 看板;blockquote 尾行 `— 出處` → 引言頁;```mermaid → 圖表頁。
- **貼上容錯**:LLM 聊天介面複製來的內容若包在 ```` ```` ```` code fence 裡、或 frontmatter 前有空行,貼上時自動修正。

讓 LLM 代寫:站內「✨ AI 產生」按鈕會複製 [`prompt.md`](prompt.md),貼給任何 LLM 即可產出合規 MD;skill 版見 [`skill/SKILL.md`](skill/SKILL.md)。

## 專案結構

```
src/
  parser/        # remark pipeline、directive 解析、profile linter、分頁切塊
  ir/            # SlideDoc IR、buildIR、design rules(純函式)
  render-html/   # 頁面 view、slide runtime、溢版量測降級、mermaid
  render-pptx/   # pptxgenjs generator
  templates/     # 5 套 template(clean-light/midnight/craft/forest/boardroom)+ schema
  app/           # 編輯器 UI、分享連結、HTML/pptx export 流程
spec/PROFILE.md  # MD Profile v1(唯一合約)
skill/SKILL.md   # LLM 產出技能
prompt.md        # 「AI 產生」按鈕複製的 prompt
examples/        # 6 份黃金樣本:產、銷、人、發、財 + 產品規劃(= 測試 fixtures)
docs/            # HANDOFF、DEMO 腳本、STATUS(結案狀態)、SHORTLINK(短連結啟用)
DECISIONS.md     # 實作期間的裁決記錄
```

## 簡報模式操作

| 按鍵 | 動作 |
|---|---|
| →/↓/Space/Enter | 下一頁 |
| ←/↑/Backspace | 上一頁 |
| Home / End | 第一頁 / 最後一頁 |
| `s` | speaker notes 面板 |
| Esc | 離開 |
| 網址 `?p=N` | 深連結到第 N 頁 |

## 非目標(v1)

協作編輯、帳號/登入、雲端文件儲存(零知識短連結只存密文,不算)、reveal.js、企業 .potx 萃取(Phase 2)、Kroki/PlantUML(Phase 4)、runtime 呼叫 LLM、動畫轉場。
