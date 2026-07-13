import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { parseMarkdown } from "../parser/parse";
import { lint } from "../parser/linter";
import { buildIR } from "../ir/buildIR";
import { templates, getTemplate, templateCssVars } from "../templates";
import { PageView } from "../render-html/PageView";
import { SlideMode } from "../render-html/SlideMode";
import { ScaledSlide, computeSectionNos } from "../render-html/SlideView";
import { renderPptx } from "../render-pptx/renderPptx";
import { renderMermaid, svgToPngDataUrl } from "../render-html/mermaid";
import { buildShareUrl, decodeShare, readShareHash, clearShareHash } from "./share";
import type { ShareView } from "./share";
import { exportHtml, downloadHtml } from "./exportHtml";
import promptText from "../../prompt.md?raw";

const exampleModules = import.meta.glob("../../examples/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const examples = Object.entries(exampleModules)
  .map(([path, content]) => ({
    id: path.split("/").pop()!.replace(".md", ""),
    content,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const FALLBACK_MD = examples[0]?.content ?? "# SnapDeck\n\n## 貼上你的 Markdown\n";

// 使用者內容不離開瀏覽器:localStorage 只存在本機
const LS_MD = "snapdeck:md";
const LS_TEMPLATE = "snapdeck:template";

function loadInitialMd(): string {
  try {
    return localStorage.getItem(LS_MD) ?? FALLBACK_MD;
  } catch {
    return FALLBACK_MD;
  }
}

function loadInitialTemplate(): string | "auto" {
  try {
    return localStorage.getItem(LS_TEMPLATE) ?? "auto";
  } catch {
    return "auto";
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function safeFilename(title: string | undefined, ext: string): string {
  return `${(title ?? "snapdeck").replace(/[\\/:*?"<>|]/g, "_")}.${ext}`;
}

export default function App() {
  const [md, setMd] = useState<string>(loadInitialMd);
  const [templateOverride, setTemplateOverride] = useState<string | "auto">(loadInitialTemplate);
  const [previewMode, setPreviewMode] = useState<"page" | "slides">("slides");
  const [presenting, setPresenting] = useState(false);
  const [reader, setReader] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lintOpen, setLintOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const debouncedMd = useDebounced(md, 200);

  const { doc, lintResult } = useMemo(() => {
    const parsed = parseMarkdown(debouncedMd);
    return { doc: buildIR(parsed), lintResult: lint(parsed) };
  }, [debouncedMd]);

  // 持久化:貼上的內容與 template 選擇存回本機
  useEffect(() => {
    try {
      localStorage.setItem(LS_MD, debouncedMd);
    } catch {
      /* 私密模式等情境:略過 */
    }
  }, [debouncedMd]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_TEMPLATE, templateOverride);
    } catch {
      /* ignore */
    }
  }, [templateOverride]);

  const template = getTemplate(
    templateOverride === "auto" ? doc.meta.template : templateOverride
  );

  // ---- CodeMirror(常駐掛載;簡報/閱讀模式是 overlay,不卸載 editor)----
  const editorHost = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!editorHost.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: loadInitialMd(),
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setMd(u.state.doc.toString());
          }),
        ],
      }),
      parent: editorHost.current,
    });
    viewRef.current = view;
    return () => view.destroy();
  }, []);

  const loadExample = useCallback((content: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // ---- share link:開啟 #s=… 連結時載入 MD + template,並依 v/p 進入
  //      對應檢視(閱讀頁/簡報)。監聽 hashchange:已開啟的分頁貼上分享
  //      網址(同頁 hash 變更、不觸發 reload)也要能載入。 ----
  useEffect(() => {
    let alive = true;
    const tryLoad = () => {
      const hash = readShareHash();
      if (!hash) return;
      decodeShare(hash.encoded).then((payload) => {
        if (!alive) return;
        clearShareHash();
        if (!payload) {
          showToast("分享連結無法解析(可能已毀損)");
          return;
        }
        loadExample(payload.md);
        setTemplateOverride(payload.template);
        if (hash.view === "present") {
          const url = new URL(window.location.href);
          url.searchParams.set("p", String(hash.presentPage ?? 1));
          window.history.replaceState(null, "", url.toString());
          setReader(false);
          setPresenting(true);
        } else if (hash.view === "page") {
          setReader(true);
          showToast("已開啟分享的閱讀頁");
          return;
        }
        showToast("已載入分享的內容");
      });
    };
    tryLoad();
    window.addEventListener("hashchange", tryLoad);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", tryLoad);
    };
  }, [loadExample, showToast]);

  const copyShareLink = useCallback(
    async (view: ShareView, presentPage?: number) => {
      setShareOpen(false);
      try {
        const url = await buildShareUrl(
          { md, template: templateOverride },
          { view, presentPage }
        );
        if (url.length > 32000) {
          showToast(`內容過長(連結 ${Math.round(url.length / 1000)}k 字元),部分通訊軟體可能截斷`);
        }
        await navigator.clipboard.writeText(url);
        const what =
          view === "page" ? "閱讀頁連結" : view === "present" ? `簡報連結(第 ${presentPage ?? 1} 頁)` : "編輯連結";
        showToast(`${what}已複製(${(url.length / 1000).toFixed(1)}k 字元,內容僅存在連結中)`);
      } catch (e) {
        showToast(`產生分享連結失敗:${(e as Error).message}`);
      }
    },
    [md, templateOverride, showToast]
  );

  // ---- exports ----
  const exportPptx = useCallback(async () => {
    setExporting(true);
    try {
      const pres = await renderPptx(doc, template, {
        renderDiagram: async (source) => {
          try {
            const svg = await renderMermaid(source, template);
            return await svgToPngDataUrl(svg);
          } catch {
            return null;
          }
        },
      });
      await pres.writeFile({ fileName: safeFilename(doc.meta.title, "pptx") });
      showToast("pptx 已下載");
    } catch (e) {
      showToast(`匯出失敗:${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [doc, template, showToast]);

  const exportHtmlFile = useCallback(async () => {
    setExporting(true);
    try {
      const html = await exportHtml(doc, template);
      downloadHtml(html, safeFilename(doc.meta.title, "html"));
      showToast("HTML 已下載(單一檔案,可直接寄出或放任何靜態空間)");
    } catch (e) {
      showToast(`匯出失敗:${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [doc, template, showToast]);

  const copyPrompt = useCallback(async () => {
    await navigator.clipboard.writeText(promptText);
    showToast("AI 產生 prompt 已複製,貼給任何 LLM 即可");
  }, [showToast]);

  const errors = lintResult.messages.filter((m) => m.severity === "error");
  const warnings = lintResult.messages.filter((m) => m.severity === "warning");
  const presentableSlides = doc.slides.filter((s) => !s.skip);
  const sectionNos = useMemo(() => computeSectionNos(presentableSlides), [presentableSlides]);

  return (
    <div className="app" style={templateCssVars(template) as React.CSSProperties}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 100 100">
              <rect width="100" height="100" rx="22" fill="currentColor" opacity="0.14" />
              <path d="M36 27 L76 50 L36 73 Z" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">SnapDeck</span>
          <span className="brand-tag">寫作即排版,貼上即上台</span>
        </div>
        <div className="topbar-actions">
          <select
            className="ctrl select"
            value=""
            onChange={(e) => {
              const ex = examples.find((x) => x.id === e.target.value);
              if (ex) loadExample(ex.content);
            }}
          >
            <option value="" disabled>
              載入範例…
            </option>
            {examples.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.id}
              </option>
            ))}
          </select>
          <button className="ctrl ghost" onClick={copyPrompt} title="複製給 LLM 的產生指令,貼給任何模型即可產出合規 MD">
            ✦ AI 產生
          </button>
          <div className="share-wrap">
            <button
              className="ctrl ghost"
              onClick={() => setShareOpen((v) => !v)}
              title="把目前的 MD + template 壓縮進網址(仿 PlantUML);內容只存在連結中、不經任何伺服器"
            >
              ⛓ 分享 ▾
            </button>
            {shareOpen && (
              <div className="share-menu" onMouseLeave={() => setShareOpen(false)}>
                <button onClick={() => copyShareLink("editor")}>
                  <b>編輯連結</b>
                  <span>對方開啟後進編輯器,可續改</span>
                </button>
                <button onClick={() => copyShareLink("page")}>
                  <b>閱讀頁連結</b>
                  <span>開啟即是 blog 式全版閱讀頁</span>
                </button>
                <button onClick={() => copyShareLink("present", 1)}>
                  <b>簡報連結</b>
                  <span>開啟直接進入全螢幕簡報</span>
                </button>
              </div>
            )}
          </div>
          <button
            className={`ctrl ghost lint-btn ${errors.length ? "lint-err" : warnings.length ? "lint-warn" : "lint-ok"}`}
            onClick={() => setLintOpen((v) => !v)}
            title="Profile linter 檢查結果"
          >
            {errors.length ? `✗ ${errors.length} 錯誤` : warnings.length ? `△ ${warnings.length} 警告` : "✓ Lint"}
          </button>
          <span className="topbar-sep" />
          <button
            className="ctrl primary"
            onClick={() => setPresenting(true)}
            disabled={!presentableSlides.length}
          >
            ▶ 簡報
          </button>
          <button className="ctrl primary outline" onClick={exportPptx} disabled={exporting}>
            {exporting ? "匯出中…" : "↓ pptx"}
          </button>
          <button className="ctrl primary outline" onClick={exportHtmlFile} disabled={exporting}>
            ↓ HTML
          </button>
        </div>
      </header>

      {lintOpen && (
        <div className="lint-panel">
          {lintResult.messages.length === 0 ? (
            <div className="lint-line lint-line-ok">✓ 通過 profile linter,無錯誤無警告</div>
          ) : (
            lintResult.messages.map((m, i) => (
              <div key={i} className={`lint-line lint-line-${m.severity}`}>
                {m.severity === "error" ? "✗" : "△"} {m.line ? `L${m.line} ` : ""}
                [{m.rule}] {m.message}
              </div>
            ))
          )}
        </div>
      )}

      <main className="panes">
        <section className="pane pane-editor">
          <div className="pane-head">
            <span className="pane-label">Markdown</span>
            <span className="pane-note">貼上點,不是寫作點 · 自動存在本機</span>
          </div>
          <div className="editor-host" ref={editorHost} />
        </section>
        <section className="pane pane-preview">
          <div className="pane-head">
            <div className="seg">
              <button
                className={previewMode === "page" ? "seg-on" : ""}
                onClick={() => setPreviewMode("page")}
              >
                頁面
              </button>
              <button
                className={previewMode === "slides" ? "seg-on" : ""}
                onClick={() => setPreviewMode("slides")}
              >
                投影片
              </button>
            </div>
            <div className="tpl-picker" role="radiogroup" aria-label="Template">
              <button
                className={`tpl-auto ${templateOverride === "auto" ? "tpl-on" : ""}`}
                onClick={() => setTemplateOverride("auto")}
                title={`跟隨文件 frontmatter(${doc.meta.template})`}
              >
                Auto
              </button>
              {Object.values(templates).map((t) => (
                <button
                  key={t.id}
                  className={`tpl-swatch ${templateOverride === t.id ? "tpl-on" : ""}`}
                  onClick={() => setTemplateOverride(t.id)}
                  title={t.name}
                  aria-label={`Template ${t.name}`}
                >
                  <span
                    className="tpl-dot"
                    style={{
                      background: `linear-gradient(135deg, #${t.colors.primary} 0 55%, #${t.colors.accent} 55% 100%)`,
                    }}
                  />
                </button>
              ))}
            </div>
            <span className="pane-note">
              {previewMode === "page" ? (
                <button className="mini-btn" onClick={() => setReader(true)} title="全版閱讀(blog 式)">
                  ⤢ 全版閱讀
                </button>
              ) : null}
              {presentableSlides.length} 頁
              {doc.slides.length !== presentableSlides.length
                ? ` +${doc.slides.length - presentableSlides.length} 附錄`
                : ""}
              {" · "}
              {template.name}
            </span>
          </div>
          <div className="preview-scroll">
            {previewMode === "page" ? (
              <PageView doc={doc} template={template} />
            ) : (
              <div className="thumbs">
                {presentableSlides.map((slide, i) => (
                  <div className="thumb" key={i}>
                    <div className="thumb-no">{i + 1}</div>
                    <div className="thumb-frame">
                      <ScaledSlide
                        slide={slide}
                        template={template}
                        pageNo={i + 1}
                        total={presentableSlides.length}
                        sectionNo={sectionNos[i]}
                        docTitle={doc.meta.title}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 全版閱讀(blog 式)— overlay,editor 不卸載 */}
      {reader ? (
        <div className="sd-reader" style={templateCssVars(template) as React.CSSProperties}>
          <div className="reader-bar">
            <div className="brand">
              <span className="brand-mark" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 100 100">
                  <rect width="100" height="100" rx="22" fill="currentColor" opacity="0.14" />
                  <path d="M36 27 L76 50 L36 73 Z" fill="currentColor" />
                </svg>
              </span>
              <span className="brand-name">SnapDeck</span>
            </div>
            <div className="reader-actions">
              <button className="ctrl ghost" onClick={() => copyShareLink("page")}>
                ⛓ 分享此頁
              </button>
              <button className="ctrl ghost" onClick={exportHtmlFile} disabled={exporting}>
                ↓ HTML
              </button>
              <button
                className="ctrl primary"
                onClick={() => {
                  setReader(false);
                  setPresenting(true);
                }}
                disabled={!presentableSlides.length}
              >
                ▶ 簡報
              </button>
              <button className="ctrl ghost" onClick={() => setReader(false)}>
                ✎ 編輯
              </button>
            </div>
          </div>
          <div className="reader-scroll">
            <PageView doc={doc} template={template} />
            <div className="reader-foot">
              以 SnapDeck 製作 — 寫作即排版,貼上即上台
            </div>
          </div>
        </div>
      ) : null}

      {/* 簡報模式是 overlay:editor 不卸載,內容不會消失 */}
      {presenting ? (
        <SlideMode
          doc={doc}
          template={template}
          onExit={() => setPresenting(false)}
          onShare={(pageNo) => copyShareLink("present", pageNo)}
        />
      ) : null}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
