// 頁面 view:Notion page 質感 — 窄欄、大標題、舒適行高。
// skip 頁仍顯示(PROFILE §6)。

import type { SlideDoc } from "../ir/types";
import type { TemplateConfig } from "../templates";
import { BodyBlocks } from "./SlideView";

export function PageView({ doc, template }: { doc: SlideDoc; template: TemplateConfig }) {
  return (
    <article className="sd-page">
      {doc.meta.title ? (
        <header className="sd-page-header">
          <h1 className="sd-page-title">{doc.meta.title}</h1>
          <div className="sd-page-meta">
            {[doc.meta.author, doc.meta.date].filter(Boolean).join(" · ")}
          </div>
        </header>
      ) : null}
      {doc.slides
        .filter((s) => s.layout !== "title")
        .map((slide, i) => (
          <section key={i} className={`sd-page-section${slide.skip ? " sd-page-skip" : ""}`}>
            {slide.skip ? <div className="sd-skip-tag">附錄(不進簡報)</div> : null}
            {slide.layout === "two-col" && slide.columns ? (
              <>
                <BodyBlocks
                  blocks={slide.blocks.filter((b) => b.kind === "heading")}
                  template={template}
                  context="page"
                />
                <div className="sd-page-two-col">
                  <div>
                    <BodyBlocks blocks={slide.columns[0]} template={template} context="page" />
                  </div>
                  <div>
                    <BodyBlocks blocks={slide.columns[1]} template={template} context="page" />
                  </div>
                </div>
              </>
            ) : (
              <BodyBlocks blocks={slide.blocks} template={template} context="page" />
            )}
          </section>
        ))}
    </article>
  );
}
