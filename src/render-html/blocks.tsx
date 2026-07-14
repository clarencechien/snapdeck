// Block → React。頁面 view 與 slide mode 共用,以 context prop 區分密度。

import { useEffect, useState } from "react";
import type { Block, InlineText, ListItem } from "../ir/types";
import type { TemplateConfig } from "../templates";
import { renderMermaid } from "./mermaid";
import { statSizeTier } from "../ir/weight";

export function Inline({ text }: { text: InlineText }) {
  return (
    <>
      {text.map((s, i) => {
        let el: React.ReactNode = s.text;
        if (s.code) el = <code>{el}</code>;
        if (s.bold) el = <strong>{el}</strong>;
        if (s.italic) el = <em>{el}</em>;
        if (s.strike) el = <del>{el}</del>;
        if (s.link)
          el = (
            <a href={s.link} target="_blank" rel="noreferrer">
              {el}
            </a>
          );
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

function MermaidBlock({ source, template }: { source: string; template: TemplateConfig }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSvg(null);
    setErr(null);
    renderMermaid(source, template)
      .then((s) => alive && setSvg(s))
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [source, template]);
  if (err) return <pre className="sd-diagram-error">mermaid 解析失敗:{err}</pre>;
  if (!svg) return <div className="sd-diagram-loading">圖表繪製中…</div>;
  return <div className="sd-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Cards({ items }: { items: ListItem[] }) {
  return (
    <div className="sd-cards" data-count={items.length}>
      {items.map((it, i) => (
        <div className="sd-card" key={i}>
          {it.term ? (
            <>
              <div className="sd-card-term">{it.term}</div>
              <div className="sd-card-desc">{it.desc ? <Inline text={it.desc} /> : null}</div>
            </>
          ) : (
            <div className="sd-card-desc">
              <Inline text={it.text} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Steps({ items }: { items: ListItem[] }) {
  return (
    <ol className="sd-steps">
      {items.map((it, i) => (
        <li key={i}>
          <span className="sd-step-num">{i + 1}</span>
          <span className="sd-step-text">
            <Inline text={it.text} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function PlainList({ items, ordered }: { items: ListItem[]; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="sd-list">
      {items.map((it, i) => (
        <li key={i}>
          {it.checked != null ? (
            <input type="checkbox" checked={it.checked} readOnly className="sd-task" />
          ) : null}
          <Inline text={it.text} />
          {it.children?.length ? <PlainList items={it.children} ordered={false} /> : null}
        </li>
      ))}
    </Tag>
  );
}

export function BlockView({
  block,
  template,
  context,
}: {
  block: Block;
  template: TemplateConfig;
  context: "page" | "slide";
}) {
  const emphasisCls = "emphasis" in block && block.emphasis ? " sd-emphasis" : "";
  switch (block.kind) {
    case "heading": {
      const Tag = (`h${block.depth}` as unknown) as "h1";
      return (
        <Tag className={`sd-heading sd-h${block.depth}${emphasisCls}`}>
          <Inline text={block.text} />
        </Tag>
      );
    }
    case "para":
      return (
        <p className={`sd-para${emphasisCls}`}>
          <Inline text={block.text} />
        </p>
      );
    case "list":
      if (block.shape === "cards" && context === "slide")
        return (
          <div className={emphasisCls || undefined}>
            <Cards items={block.items} />
          </div>
        );
      if (block.shape === "steps" && context === "slide")
        return (
          <div className={emphasisCls || undefined}>
            <Steps items={block.items} />
          </div>
        );
      return (
        <div className={emphasisCls || undefined}>
          <PlainList items={block.items} ordered={block.ordered} />
        </div>
      );
    case "quote":
      return (
        <blockquote className={`sd-quote${emphasisCls}`}>
          <p>
            <Inline text={block.text} />
          </p>
          {block.cite ? <cite>— {block.cite}</cite> : null}
        </blockquote>
      );
    case "code":
      return (
        <pre className={`sd-code${emphasisCls}`}>
          <code>{block.value}</code>
        </pre>
      );
    case "table":
      return (
        <div className={`sd-table-wrap${emphasisCls}`}>
          <table className="sd-table">
            <thead>
              <tr>
                {block.header.map((h, i) => (
                  <th key={i}>
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return <img className={`sd-image${emphasisCls}`} src={block.url} alt={block.alt ?? ""} />;
    case "diagram":
      return <MermaidBlock source={block.source} template={template} />;
    case "stat":
      return (
        <div className={`sd-stat${emphasisCls}`}>
          <div className={`sd-stat-value sd-stat-t${statSizeTier(block.value)}`}>
            {block.value}
          </div>
          {block.label ? <div className="sd-stat-label">{block.label}</div> : null}
          {block.caption ? <div className="sd-stat-caption">{block.caption}</div> : null}
        </div>
      );
    default:
      return null;
  }
}
