# 結案狀態

## Phase 1(2026-07-13)

線上版本:https://snapdeck.ai-apps.work(Cloudflare Workers 直連 GitHub,push 即部署)

## 驗收對照(HANDOFF §6,含 DECISIONS 修訂)

| 條款 | 狀態 | 備註 |
|---|---|---|
| 黃金樣本在 GitHub render 無可見雜訊(directive 隱形) | ✅ | 6 份(產銷人發財 + 產品規劃,見 D11) |
| 樣本:HTML slide 可簡報、pptx 零損毀、文字可編輯 | ✅ | pptx 驗證方式見 D6 |
| 內建 template 切換即時生效於三種輸出 | ✅ | 5 套(D7),色點一鍵切換 |
| mermaid 三種輸出正確、配色跟隨 template | ✅ | flowchart/sequence/gantt/pie 實測(D4/D14) |
| 溢版偵測 + 自動降級 + 警示 badge | ✅ | HTML DOM 量測;pptx 確定性估算(D3) |
| profile linter(站內即時 + CLI) | ✅ | mermaid 語法檢查僅站內(D5) |
| 全程無網路呼叫(函式庫進 bundle) | ✅ | `#s=` 分享連結不經伺服器(D15);選配短連結只上傳密文(D21) |
| `npm run build` 單一靜態站 | ✅ | wrangler.jsonc assets-only |
| 貼上→可簡報 <10s、→pptx <30s | ✅ | 實測皆秒級 |

## 超出原始範圍的交付

- **5 套 template**(原規格 2 套):clean-light / midnight / craft / forest / boardroom
- **分享連結**(仿 PlantUML,零後端):編輯 / 閱讀頁 / 簡報第 N 頁三種模式(D15/D16)
- **全版閱讀(blog 式)+ 單檔 HTML 匯出**(D16)
- **KPI 看板與 stat 三欄位格式** `數值,標籤,補充`(D12/D19)
- **稀疏頁垂直置中**(D13)
- **LLM 產出鏈強化**:few-shot prompt、fence 包裹 + 貼上自動剝殼、directive 使用門檻(D17/D18/D20);Gemini 非 thinking 模型實測可一次產出合規文件
- **localStorage 持久化**(D9)
- **零知識短連結**(選配,D21):AES-GCM 客戶端加密 + KV 存密文,金鑰只在 fragment;~60 字元;未啟用自動退回長連結
- **Drop mode**(D22):雙模式簡報 zip(預設播放、可切閱讀,~3KB vanilla runtime)+ 半自動上 Cloudflare Drop(60 分鐘匿名臨時站)

## 已知限制(留待後續 phase)

- pptx 冒煙測試(soffice 轉 PDF)未進 CI:開發容器 LibreOffice 損壞,現以 JSZip 結構斷言 + xmllint 驗證(D6)
- CLI linter 不驗 mermaid 語法,站內即時檢查代替(D5)
- 企業 template 萃取(.pptx/.potx onboarding)= Phase 2
- Kroki/PlantUML、.potx 高保真填充 = Phase 4(短連結已以零知識模式內建,D21)

## 測試

`npm test`:64 tests(IR snapshot、design rules、linter、pptx 結構、share 編碼、貼上正規化、短連結加密);`npm run lint:samples`:6/6。

---

# v2 結案對照(2026-07-17,HANDOFF-snapdeck-v2 §9)

| 條款 | 狀態 | 備註 |
|---|---|---|
| 一份文件密度 md 一次 render 出可獨立閱讀的 blog + 可簡報的 slide,同源無矛盾 | ✅ | e2e 以 08-blog-story 驗證:skip 段只在文件態、段落自動取第一句、keep 段整句上台 |
| 摘要投影層確定性、runtime 零 LLM | ✅ | ir/summarize.ts;確定性測試(同輸入 deep-equal) |
| 既有樣本 slide/pptx 輸出無退化 | ✅ | 投影後 68 頁 layout 與原 IR 全等;投影 digest snapshot 固定 |
| `slide:` 為唯一新增 directive | ✅ | keep / skip / 自訂字串;無其他詞彙擴充 |
| ≥3 份 blog 密度樣本 | ✅ | 07 知識整理 / 08 故事復盤 / 09 說服(進 fixtures,9/9 過 linter) |
| blog 意圖 meta-prompt | ✅ | prompts/blog-intent.md(蘇格拉底提問 + 格式合約 + 收斂終點線);站內「AI 產生 → 引導我寫 blog」 |
| 文件態單檔 HTML 匯出零外部依賴 | ✅ | 沿用既有匯出(本就是文件態);Drop 檔閱讀模式同步吃完整 DocIR |
| build 單一靜態站、npm test 全綠 | ✅ | 93 tests(新增 summarizer 18 例 + 投影 snapshot ×9) |

v2 相關裁決:DECISIONS D24。方向文件:docs/ADR-001-v1-to-v3.md、docs/HANDOFF-snapdeck-v2.md。
