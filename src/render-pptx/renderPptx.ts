// renderPptx:IR + template config → pptxgenjs。
// 遵守 HANDOFF §7 坑清單:LAYOUT_WIDE 先設、色碼無 #、options 物件不重用、
// bullet:true 不手打「•」、breakLine 除最後一項、addNotes、margin:0。
// 文字全部為原生文字框(可編輯)。

import pptxgen from "pptxgenjs";
import type { Block, InlineText, ListItem, Slide, SlideDoc } from "../ir/types";
import type { LayoutSpec, TemplateConfig } from "../templates";
import { plainText } from "../ir/types";

type TextRun = { text: string; options?: Record<string, unknown> };

export type DiagramRenderer = (
  source: string
) => Promise<{ dataUrl: string; width: number; height: number } | null>;

export type RenderPptxOptions = {
  renderDiagram?: DiagramRenderer;
};

function pptFont(css: string): string {
  // CSS font stack → 單一字型名(pptx 只吃一個);挑第一個,去引號
  const first = css.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || "Arial";
}

function inlineToRuns(text: InlineText, baseColor: string): TextRun[] {
  return text.map((s) => ({
    text: s.text,
    options: {
      bold: !!s.bold,
      italic: !!s.italic,
      strike: !!s.strike,
      color: baseColor,
      ...(s.link ? { hyperlink: { url: s.link } } : {}),
      ...(s.code ? { fontFace: "Courier New" } : {}),
    },
  }));
}

/** 確定性溢版估算:HTML 端的量測不可得時(或匯出時),依內容量選字級縮放 */
export function estimateFontScale(slide: Slide): number {
  let weight = 0;
  for (const b of slide.blocks) {
    switch (b.kind) {
      case "heading":
        break;
      case "para":
        weight += Math.ceil(plainText(b.text).length / 40) + 1;
        break;
      case "list":
        weight += b.items.length * 1.5;
        break;
      case "table":
        weight += (b.rows.length + 1) * 1.2;
        break;
      case "code":
        weight += b.value.split("\n").length;
        break;
      case "quote":
        weight += 3;
        break;
      case "stat":
        weight += 4;
        break;
      case "diagram":
      case "image":
        weight += 8;
        break;
    }
  }
  if (weight > 22) return 0.72;
  if (weight > 15) return 0.85;
  return 1;
}

type Ctx = {
  pres: pptxgen;
  template: TemplateConfig;
  opts: RenderPptxOptions;
};

function colorOf(t: TemplateConfig, key: LayoutSpec["bg"]): string {
  return t.colors[key];
}

function addHeading(
  s: pptxgen.Slide,
  slide: Slide,
  spec: LayoutSpec,
  t: TemplateConfig,
  scale: number
) {
  const heading = slide.blocks.find((b) => b.kind === "heading") as
    | Extract<Block, { kind: "heading" }>
    | undefined;
  if (!heading) return;
  s.addText(inlineToRuns(heading.text, colorOf(t, spec.titleColor)) as never, {
    x: spec.titleBox.x,
    y: spec.titleBox.y,
    w: spec.titleBox.w,
    h: spec.titleBox.h,
    fontSize: Math.round(spec.titleFontPt * scale),
    fontFace: pptFont(t.fonts.display),
    bold: true,
    align: spec.align === "center" ? "center" : "left",
    valign: "top",
    margin: 0,
  });
}

function listToRuns(items: ListItem[], color: string, mutedColor: string): TextRun[] {
  const runs: TextRun[] = [];
  items.forEach((it, idx) => {
    const isLast = idx === items.length - 1;
    if (it.term) {
      runs.push({
        text: it.term,
        options: { bold: true, color, bullet: true, paraSpaceAfter: 2 },
      });
      runs.push({
        text: it.desc ? plainText(it.desc) : "",
        options: {
          color: mutedColor,
          breakLine: !isLast,
          bullet: false,
          indentLevel: 1,
          paraSpaceAfter: 8,
        },
      });
    } else {
      const inner = inlineToRuns(it.text, color);
      inner.forEach((r, ri) => {
        const isLastRun = ri === inner.length - 1;
        runs.push({
          text: r.text,
          options: {
            ...r.options,
            ...(ri === 0 ? { bullet: true } : {}),
            breakLine: isLastRun ? !isLast : false,
            paraSpaceAfter: 8,
          },
        });
      });
      if (it.children?.length) {
        // 巢狀清單:縮排一階
        it.children.forEach((child, ci) => {
          runs.push({
            text: plainText(child.text),
            options: {
              color,
              bullet: true,
              indentLevel: 1,
              breakLine: !(isLast && ci === it.children!.length - 1),
              paraSpaceAfter: 4,
            },
          });
        });
      }
    }
  });
  return runs;
}

async function addBlocks(
  s: pptxgen.Slide,
  blocks: Block[],
  box: { x: number; y: number; w: number; h: number },
  spec: LayoutSpec,
  ctx: Ctx,
  scale: number
) {
  const t = ctx.template;
  const fg = colorOf(t, spec.fg);
  const muted = t.colors.muted;
  const accent = t.colors.accent;
  const primary = t.colors.primary;
  const bodyPt = Math.round(spec.bodyFontPt * scale);
  const bodyFont = pptFont(t.fonts.body);

  let y = box.y;
  const each = blocks.filter((b) => b.kind !== "heading");

  for (const block of each) {
    if (y >= box.y + box.h - 0.3) break; // 保底:不畫出安全區外
    const remaining = box.y + box.h - y;

    switch (block.kind) {
      case "para": {
        const lines = Math.max(1, Math.ceil(plainText(block.text).length / 55));
        const h = Math.min(remaining, 0.34 * lines * scale + 0.15);
        const runs = inlineToRuns(block.text, block.emphasis ? primary : fg);
        if (block.emphasis) {
          s.addShape("rect", {
            x: box.x,
            y,
            w: box.w,
            h: h + 0.15,
            fill: { color: accent, transparency: 88 },
            line: { color: accent, width: 1 },
          });
        }
        s.addText(runs as never, {
          x: box.x + (block.emphasis ? 0.15 : 0),
          y,
          w: box.w - (block.emphasis ? 0.3 : 0),
          h: h + (block.emphasis ? 0.15 : 0),
          fontSize: bodyPt,
          fontFace: bodyFont,
          align: spec.align === "center" ? "center" : "left",
          valign: "top",
          margin: 0,
        });
        y += h + 0.25;
        break;
      }
      case "list": {
        const runs = listToRuns(block.items, fg, fg);
        const lineCount = block.items.length * (block.shape === "cards" ? 2 : 1.2);
        const h = Math.min(remaining, lineCount * 0.32 * scale + 0.2);
        s.addText(runs as never, {
          x: box.x,
          y,
          w: box.w,
          h,
          fontSize: bodyPt,
          fontFace: bodyFont,
          valign: "top",
          margin: 0,
        });
        y += h + 0.2;
        break;
      }
      case "quote": {
        const h = Math.min(remaining, 1.6);
        s.addShape("rect", {
          x: box.x,
          y,
          w: 0.06,
          h,
          fill: { color: accent },
        });
        s.addText(
          [
            { text: plainText(block.text), options: { italic: true, color: fg } },
            ...(block.cite
              ? [
                  {
                    text: `\n— ${block.cite}`,
                    options: { color: muted, fontSize: Math.round(bodyPt * 0.8) },
                  },
                ]
              : []),
          ] as never,
          {
            x: box.x + 0.25,
            y,
            w: box.w - 0.25,
            h,
            fontSize: Math.round(bodyPt * 1.15),
            fontFace: bodyFont,
            valign: "middle",
            margin: 0,
          }
        );
        y += h + 0.25;
        break;
      }
      case "code": {
        const lines = block.value.split("\n");
        const h = Math.min(remaining, lines.length * 0.24 * scale + 0.3);
        s.addShape("rect", {
          x: box.x,
          y,
          w: box.w,
          h,
          fill: { color: t.colors.onSurface },
        });
        s.addText(block.value, {
          x: box.x + 0.15,
          y: y + 0.1,
          w: box.w - 0.3,
          h: h - 0.2,
          fontSize: Math.max(10, Math.round(bodyPt * 0.75)),
          fontFace: "Courier New",
          color: t.colors.surface,
          valign: "top",
          margin: 0,
        });
        y += h + 0.25;
        break;
      }
      case "table": {
        const headerRow = block.header.map((c) => ({
          text: plainText(c),
          options: {
            bold: true,
            color: t.colors.onPrimary,
            fill: { color: primary },
            fontSize: Math.round(bodyPt * 0.8),
          },
        }));
        const bodyRows = block.rows.map((row) =>
          row.map((c) => ({
            text: plainText(c),
            options: { color: fg, fontSize: Math.round(bodyPt * 0.8) },
          }))
        );
        s.addTable([headerRow, ...bodyRows] as never, {
          x: box.x,
          y,
          w: box.w,
          fontFace: bodyFont,
          border: { type: "solid", color: t.colors.muted, pt: 0.5 },
          margin: 0.05,
          valign: "middle",
        });
        y += Math.min(remaining, (block.rows.length + 1) * 0.32 + 0.2) + 0.2;
        break;
      }
      case "stat": {
        const h = Math.min(remaining, 2.4);
        s.addText(block.value, {
          x: box.x,
          y,
          w: box.w,
          h: h * 0.62,
          fontSize: Math.round(66 * scale),
          fontFace: pptFont(t.fonts.display),
          bold: true,
          color: primary,
          align: "center",
          valign: "bottom",
          margin: 0,
        });
        s.addText(block.label, {
          x: box.x,
          y: y + h * 0.62,
          w: box.w,
          h: h * 0.38,
          fontSize: Math.round(20 * scale),
          fontFace: bodyFont,
          color: muted,
          align: "center",
          valign: "top",
          margin: 0,
        });
        y += h + 0.2;
        break;
      }
      case "image": {
        // 外部 URL 失敗風險由 linter 警告;此處直接嘗試置入
        const h = Math.min(remaining, 3.5);
        try {
          s.addImage({ path: block.url, x: box.x, y, w: box.w, h, sizing: { type: "contain", w: box.w, h } });
        } catch {
          s.addText(`[圖片:${block.alt ?? block.url}]`, {
            x: box.x,
            y,
            w: box.w,
            h: 0.5,
            fontSize: bodyPt,
            color: muted,
            margin: 0,
          });
        }
        y += h + 0.2;
        break;
      }
      case "diagram": {
        const h = Math.min(remaining, 4.6);
        let placed = false;
        if (ctx.opts.renderDiagram) {
          try {
            const png = await ctx.opts.renderDiagram(block.source);
            if (png) {
              // 依 SVG bbox 等比縮入安全區
              const ratio = png.width / png.height;
              let w = box.w;
              let hh = w / ratio;
              if (hh > h) {
                hh = h;
                w = hh * ratio;
              }
              s.addImage({
                data: png.dataUrl,
                x: box.x + (box.w - w) / 2,
                y,
                w,
                h: hh,
              });
              y += hh + 0.2;
              placed = true;
            }
          } catch {
            // fallthrough to placeholder
          }
        }
        if (!placed) {
          s.addShape("rect", {
            x: box.x,
            y,
            w: box.w,
            h: 1.2,
            fill: { color: t.colors.muted, transparency: 85 },
            line: { color: t.colors.muted, width: 1, dashType: "dash" },
          });
          s.addText("[mermaid 圖表:於瀏覽器匯出時嵌入]", {
            x: box.x,
            y,
            w: box.w,
            h: 1.2,
            fontSize: bodyPt,
            color: muted,
            align: "center",
            valign: "middle",
            margin: 0,
          });
          y += 1.4;
        }
        break;
      }
      default:
        break;
    }
  }
}

async function addCardsSlide(s: pptxgen.Slide, slide: Slide, spec: LayoutSpec, ctx: Ctx, scale: number) {
  const t = ctx.template;
  addHeading(s, slide, spec, t, scale);
  const list = slide.blocks.find((b) => b.kind === "list" && b.shape === "cards") as
    | Extract<Block, { kind: "list" }>
    | undefined;
  const others = slide.blocks.filter((b) => b.kind !== "heading" && b !== list);
  const box = { ...spec.bodyBox };

  let y = box.y;
  if (others.length) {
    await addBlocks(s, others, { ...box, h: 1.2 }, spec, ctx, scale);
    y += 1.3;
  }
  if (list) {
    const n = list.items.length;
    const cols = n <= 3 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const gap = 0.25;
    const cardW = (box.w - gap * (cols - 1)) / cols;
    const cardH = Math.min(2.2, (box.y + box.h - y - gap * (rows - 1)) / rows);
    list.items.forEach((it, i) => {
      const cx = box.x + (i % cols) * (cardW + gap);
      const cy = y + Math.floor(i / cols) * (cardH + gap);
      s.addShape("roundRect", {
        x: cx,
        y: cy,
        w: cardW,
        h: cardH,
        rectRadius: 0.08,
        fill: { color: t.colors.surface },
        line: { color: t.colors.primary, width: 1 },
        shadow: { type: "outer", color: t.colors.muted, blur: 6, offset: 2, angle: 90, opacity: 0.25 },
      });
      s.addText(it.term ?? plainText(it.text), {
        x: cx + 0.15,
        y: cy + 0.12,
        w: cardW - 0.3,
        h: 0.45,
        fontSize: Math.round(16 * scale),
        fontFace: pptFont(t.fonts.display),
        bold: true,
        color: t.colors.primary,
        margin: 0,
        valign: "top",
      });
      if (it.desc) {
        s.addText(plainText(it.desc), {
          x: cx + 0.15,
          y: cy + 0.6,
          w: cardW - 0.3,
          h: cardH - 0.75,
          fontSize: Math.round(13 * scale),
          fontFace: pptFont(t.fonts.body),
          color: t.colors.onSurface,
          margin: 0,
          valign: "top",
        });
      }
    });
  }
}

async function renderSlide(ctx: Ctx, slide: Slide, pageNo: number, total: number) {
  const { pres, template: t } = ctx;
  const spec = t.layouts[slide.layout];
  const s = pres.addSlide();
  s.background = { color: colorOf(t, spec.bg) };
  const scale = slide.fit ? Math.min(estimateFontScale(slide), 0.85) : estimateFontScale(slide);

  switch (slide.layout) {
    case "title": {
      const heading = slide.blocks.find((b) => b.kind === "heading");
      const rest = slide.blocks.filter((b) => b !== heading);
      if (heading && heading.kind === "heading") {
        s.addText(inlineToRuns(heading.text, colorOf(t, spec.titleColor)) as never, {
          x: spec.titleBox.x,
          y: spec.titleBox.y,
          w: spec.titleBox.w,
          h: spec.titleBox.h,
          fontSize: spec.titleFontPt,
          fontFace: pptFont(t.fonts.display),
          bold: true,
          align: spec.align === "center" ? "center" : "left",
          valign: "bottom",
          margin: 0,
        });
      }
      // 主色飾條
      s.addShape("rect", {
        x: spec.titleBox.x,
        y: spec.titleBox.y + spec.titleBox.h + 0.15,
        w: 1.6,
        h: 0.08,
        fill: { color: t.colors.accent },
      });
      for (const b of rest) {
        if (b.kind === "para") {
          s.addText(plainText(b.text), {
            x: spec.bodyBox.x,
            y: spec.bodyBox.y,
            w: spec.bodyBox.w,
            h: spec.bodyBox.h,
            fontSize: spec.bodyFontPt,
            fontFace: pptFont(t.fonts.body),
            color: t.colors.muted,
            align: spec.align === "center" ? "center" : "left",
            valign: "top",
            margin: 0,
          });
        }
      }
      break;
    }
    case "section": {
      addHeading(s, slide, spec, t, 1);
      s.addShape("rect", {
        x: spec.titleBox.x,
        y: spec.titleBox.y + spec.titleBox.h + 0.1,
        w: 1.2,
        h: 0.08,
        fill: { color: t.colors.accent },
      });
      break;
    }
    case "two-col": {
      addHeading(s, slide, spec, t, scale);
      const box = spec.bodyBox;
      const colW = (box.w - 0.5) / 2;
      const [left, right] = slide.columns ?? [
        slide.blocks.filter((b) => b.kind !== "heading"),
        [],
      ];
      await addBlocks(s, left, { x: box.x, y: box.y, w: colW, h: box.h }, spec, ctx, scale);
      await addBlocks(
        s,
        right,
        { x: box.x + colW + 0.5, y: box.y, w: colW, h: box.h },
        spec,
        ctx,
        scale
      );
      // 中線
      s.addShape("line", {
        x: box.x + colW + 0.25,
        y: box.y + 0.1,
        w: 0,
        h: box.h - 0.4,
        line: { color: t.colors.muted, width: 0.75 },
      });
      break;
    }
    case "cards":
      await addCardsSlide(s, slide, spec, ctx, scale);
      break;
    default: {
      // content / big-stat / quote / diagram 共用縱向排版
      addHeading(s, slide, spec, t, scale);
      await addBlocks(s, slide.blocks, spec.bodyBox, spec, ctx, scale);
      break;
    }
  }

  if (slide.notes) s.addNotes(slide.notes);

  if (slide.layout !== "title" && slide.layout !== "section") {
    s.addText(`${pageNo} / ${total}`, {
      x: t.page.widthIn - 1.3,
      y: t.page.heightIn - 0.45,
      w: 1.0,
      h: 0.3,
      fontSize: 10,
      fontFace: pptFont(t.fonts.body),
      color: t.colors.muted,
      align: "right",
      margin: 0,
    });
  }
}

export async function renderPptx(
  doc: SlideDoc,
  template: TemplateConfig,
  opts: RenderPptxOptions = {}
): Promise<pptxgen> {
  // 一個輸出檔一個實例;LAYOUT_WIDE 必須在加任何 slide 前設定
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = doc.meta.title ?? "SnapDeck";
  if (doc.meta.author) pres.author = doc.meta.author;

  const slides = doc.slides.filter((s) => !s.skip);
  const ctx: Ctx = { pres, template, opts };
  let n = 0;
  for (const slide of slides) {
    n += 1;
    await renderSlide(ctx, slide, n, slides.length);
  }
  return pres;
}
