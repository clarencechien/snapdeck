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
import { ScaledSlide } from "../render-html/SlideView";
import { renderPptx } from "../render-pptx/renderPptx";
import { renderMermaid, svgToPngDataUrl } from "../render-html/mermaid";
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

const DEFAULT_MD = examples[0]?.content ?? "# SnapDeck\n\n## 貼上你的 Markdown\n";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function App() {
  const [md, setMd] = useState<string>(DEFAULT_MD);
  const [templateOverride, setTemplateOverride] = useState<string | "auto">("auto");
  const [previewMode, setPreviewMode] = useState<"page" | "slides">("slides");
  const [presenting, setPresenting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lintOpen, setLintOpen] = useState(false);

  const debouncedMd = useDebounced(md, 200);

  const { doc, lintResult } = useMemo(() => {
    const parsed = parseMarkdown(debouncedMd);
    return { doc: buildIR(parsed), lintResult: lint(parsed) };
  }, [debouncedMd]);

  const template = getTemplate(
    templateOverride === "auto" ? doc.meta.template : templateOverride
  );

  // ---- CodeMirror ----
  const editorHost = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!editorHost.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: DEFAULT_MD,
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
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ---- export ----
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
      const name = (doc.meta.title ?? "snapdeck").replace(/[\\/:*?"<>|]/g, "_");
      await pres.writeFile({ fileName: `${name}.pptx` });
      showToast("pptx 已下載");
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

  if (presenting) {
    return (
      <div style={templateCssVars(template) as React.CSSProperties}>
        <SlideMode doc={doc} template={template} onExit={() => setPresenting(false)} />
      </div>
    );
  }

  return (
    <div className="app" style={templateCssVars(template) as React.CSSProperties}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span> SnapDeck
          <span className="brand-tag">寫作即排版,貼上即上台</span>
        </div>
        <div className="topbar-actions">
          <select
            className="ctrl"
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
          <select
            className="ctrl"
            value={templateOverride}
            onChange={(e) => setTemplateOverride(e.target.value as never)}
            title="Template"
          >
            <option value="auto">Template:跟隨文件({doc.meta.template})</option>
            {Object.values(templates).map((t) => (
              <option key={t.id} value={t.id}>
                Template:{t.name}
              </option>
            ))}
          </select>
          <button className="ctrl" onClick={copyPrompt} title="複製給 LLM 的產生指令">
            ✨ AI 產生
          </button>
          <button
            className={`ctrl lint-btn ${errors.length ? "lint-err" : warnings.length ? "lint-warn" : "lint-ok"}`}
            onClick={() => setLintOpen((v) => !v)}
          >
            {errors.length ? `✗ ${errors.length} 錯誤` : warnings.length ? `⚠ ${warnings.length}` : "✓ Lint"}
          </button>
          <button
            className="ctrl primary"
            onClick={() => setPresenting(true)}
            disabled={!presentableSlides.length}
          >
            ▶ 簡報
          </button>
          <button className="ctrl primary" onClick={exportPptx} disabled={exporting}>
            {exporting ? "匯出中…" : "⬇ 匯出 pptx"}
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
                {m.severity === "error" ? "✗" : "⚠"} {m.line ? `L${m.line} ` : ""}
                [{m.rule}] {m.message}
              </div>
            ))
          )}
        </div>
      )}

      <main className="panes">
        <section className="pane pane-editor">
          <div className="pane-head">Markdown(貼上點,不是寫作點)</div>
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
            <span className="pane-note">
              {presentableSlides.length} 頁
              {doc.slides.length !== presentableSlides.length
                ? `(+${doc.slides.length - presentableSlides.length} 附錄)`
                : ""}
            </span>
          </div>
          <div className="preview-scroll">
            {previewMode === "page" ? (
              <PageView doc={doc} template={template} />
            ) : (
              <div className="thumbs">
                {presentableSlides.map((slide, i) => (
                  <div className="thumb" key={i}>
                    <ScaledSlide
                      slide={slide}
                      template={template}
                      pageNo={i + 1}
                      total={presentableSlides.length}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
