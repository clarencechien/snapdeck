// 單頁 slide 渲染:固定 1280×720 設計面,CSS transform 縮放至容器。
// 溢版偵測與降級(design rule 8):字級縮一級 → 再縮 → 警示 badge。

import { useLayoutEffect, useRef, useState } from "react";
import type { Slide } from "../ir/types";
import type { TemplateConfig } from "../templates";
import { BlockView } from "./blocks";

const FONT_SCALES = [1, 0.85, 0.72];

export function SlideSurface({
  slide,
  template,
  pageNo,
  total,
}: {
  slide: Slide;
  template: TemplateConfig;
  pageNo?: number;
  total?: number;
}) {
  const spec = template.layouts[slide.layout];
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scaleIdx, setScaleIdx] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  // 內容變動時重新量測
  useLayoutEffect(() => {
    setScaleIdx(0);
    setOverflowing(false);
  }, [slide, template]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => {
      const over = el.scrollHeight > el.clientHeight + 4;
      if (over && scaleIdx < FONT_SCALES.length - 1) {
        setScaleIdx((i) => i + 1);
      } else {
        setOverflowing(over);
      }
    };
    // mermaid 等非同步內容:觀察尺寸變化
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const t = setTimeout(check, 50);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [slide, template, scaleIdx]);

  const heading = slide.blocks.find((b) => b.kind === "heading");
  const body = slide.blocks.filter((b) => b !== heading);
  const fontScale = FONT_SCALES[scaleIdx];
  const showBadge = overflowing && !slide.fit;

  const bgColor = `#${template.colors[spec.bg]}`;
  const fgColor = `#${template.colors[spec.fg]}`;
  const titleColor = `#${template.colors[spec.titleColor]}`;

  return (
    <div
      className={`sd-slide sd-layout-${slide.layout}`}
      style={
        {
          background: bgColor,
          color: fgColor,
          "--sd-slide-title-color": titleColor,
          "--sd-slide-fg": fgColor,
          "--sd-slide-font-scale": String(fontScale),
        } as React.CSSProperties
      }
    >
      {heading ? (
        <div className="sd-slide-title" style={{ color: titleColor }}>
          <BlockView block={heading} template={template} context="slide" />
        </div>
      ) : null}
      <div className="sd-slide-body" ref={bodyRef}>
        {slide.layout === "two-col" && slide.columns ? (
          <div className="sd-two-col">
            <div className="sd-col">
              {slide.columns[0].map((b, i) => (
                <BlockView key={i} block={b} template={template} context="slide" />
              ))}
            </div>
            <div className="sd-col">
              {slide.columns[1].map((b, i) => (
                <BlockView key={i} block={b} template={template} context="slide" />
              ))}
            </div>
          </div>
        ) : (
          body.map((b, i) => <BlockView key={i} block={b} template={template} context="slide" />)
        )}
      </div>
      {showBadge ? <div className="sd-overflow-badge">內容過多,建議用 --- 拆頁</div> : null}
      {pageNo != null && total != null && slide.layout !== "title" ? (
        <div className="sd-page-no">
          {pageNo} / {total}
        </div>
      ) : null}
    </div>
  );
}

/** 縮放外框:把 1280×720 設計面等比縮進任意容器 */
export function ScaledSlide(props: React.ComponentProps<typeof SlideSurface>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setScale(Math.min(rect.width / 1280, rect.height / 720));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);
  return (
    <div className="sd-slide-scaler" ref={wrapRef}>
      <div
        style={{
          width: 1280,
          height: 720,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          left: "50%",
          top: "50%",
          translate: `${-640 * scale}px ${-360 * scale}px`,
        }}
      >
        <SlideSurface {...props} />
      </div>
    </div>
  );
}
