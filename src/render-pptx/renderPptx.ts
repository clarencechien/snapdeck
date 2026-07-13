// renderPptx:IR + template config → pptxgenjs。
// 遵守 HANDOFF §7 坑清單:LAYOUT_WIDE 先設、色碼無 #、options 物件不重用、
// bullet:true 不手打「•」、breakLine 除最後一項、addNotes、margin:0。
// 文字全部為原生文字框(可編輯);裝飾一律取 template 色票,零硬編碼色。

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

const PAGE_W = 13.33;
const PAGE_H = 7.5;

function pptFont(css: string): string {
  const first = css.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || "Arial";
}

/** 兩色線性混合(6 碼 hex,無 #),t=0 → a、t=1 → b。確定性,取代 transparency。 */
export function mixHex(a: string, b: string, t: number): string {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16));
  return pa
    .map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
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

export { estimateFontScale } from "../ir/weight";
import { estimateFontScale, isSparse } from "../ir/weight";

/** 與 addBlocks 的實際排版常數一致的高度估算(供稀疏頁垂直置中用) */
function estimateBlockHeight(block: Block, scale: number): number {
  switch (block.kind) {
    case "heading":
      return 0;
    case "para": {
      const lines = Math.max(1, Math.ceil(plainText(block.text).length / 55));
      const h = 0.34 * lines * scale + 0.15;
      return ("emphasis" in block && block.emphasis ? h + 0.3 : h) + 0.25;
    }
    case "list": {
      const lineCount = block.items.reduce(
        (n, it) => n + (it.term ? 2 : 1) + (it.children?.length ?? 0),
        0
      );
      return lineCount * 0.34 * scale + 0.2 + 0.2;
    }
    case "quote":
      return 1.7 + 0.25;
    case "code":
      return block.value.split("\n").length * 0.24 * scale + 0.3 + 0.25;
    case "table":
      return (block.rows.length + 1) * 0.34 + 0.2 + 0.2;
    case "stat":
      return 2.6 + 0.2;
    case "image":
      return 3.5 + 0.2;
    case "diagram":
      return 3.4 + 0.2;
    default:
      return 0.5;
  }
}

type Ctx = {
  pres: pptxgen;
  template: TemplateConfig;
  opts: RenderPptxOptions;
  docTitle: string;
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
  // 標題左側的 accent 短欄(內容頁的視覺錨點)
  s.addShape("rect", {
    x: spec.titleBox.x,
    y: spec.titleBox.y + 0.06,
    w: 0.12,
    h: 0.52,
    fill: { color: t.colors.accent },
  });
  s.addText(inlineToRuns(heading.text, colorOf(t, spec.titleColor)) as never, {
    x: spec.titleBox.x + 0.3,
    y: spec.titleBox.y,
    w: spec.titleBox.w - 0.3,
    h: spec.titleBox.h,
    fontSize: Math.round(spec.titleFontPt * scale),
    fontFace: pptFont(t.fonts.display),
    bold: true,
    align: spec.align === "center" ? "center" : "left",
    valign: "top",
    margin: 0,
  });
}

/** 內容頁頁腳:hairline + 文件標題 + 頁碼 */
function addFooter(s: pptxgen.Slide, ctx: Ctx, spec: LayoutSpec, pageNo: number, total: number) {
  const t = ctx.template;
  const bg = colorOf(t, spec.bg);
  const fg = colorOf(t, spec.fg);
  const hairline = mixHex(bg, fg, 0.25);
  const faint = mixHex(bg, fg, 0.55);
  s.addShape("rect", {
    x: 0.7,
    y: PAGE_H - 0.52,
    w: PAGE_W - 1.4,
    h: 0.012,
    fill: { color: hairline },
  });
  s.addText(ctx.docTitle, {
    x: 0.7,
    y: PAGE_H - 0.46,
    w: 6.0,
    h: 0.3,
    fontSize: 9,
    fontFace: pptFont(t.fonts.body),
    color: faint,
    align: "left",
    valign: "middle",
    margin: 0,
  });
  s.addText(`${pageNo} / ${total}`, {
    x: PAGE_W - 1.9,
    y: PAGE_H - 0.46,
    w: 1.2,
    h: 0.3,
    fontSize: 9,
    fontFace: pptFont(t.fonts.body),
    color: faint,
    align: "right",
    valign: "middle",
    margin: 0,
  });
}

function listToRuns(
  items: ListItem[],
  color: string,
  termColor: string,
  ordered: boolean
): TextRun[] {
  const runs: TextRun[] = [];
  const bullet = ordered ? { type: "number" } : true;
  items.forEach((it, idx) => {
    const isLast = idx === items.length - 1;
    if (it.term) {
      runs.push({
        text: `${it.term}`,
        options: { bold: true, color: termColor, bullet, paraSpaceAfter: 2 },
      });
      runs.push({
        text: it.desc ? plainText(it.desc) : "",
        options: {
          color,
          breakLine: !isLast,
          bullet: false,
          indentLevel: 1,
          paraSpaceAfter: 10,
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
            ...(ri === 0 ? { bullet } : {}),
            breakLine: isLastRun ? !isLast : false,
            paraSpaceAfter: 10,
          },
        });
      });
      if (it.children?.length) {
        it.children.forEach((child, ci) => {
          runs.push({
            text: plainText(child.text),
            options: {
              color,
              bullet: true,
              indentLevel: 1,
              breakLine: !(isLast && ci === it.children!.length - 1),
              paraSpaceAfter: 6,
            },
          });
        });
      }
    }
  });
  return runs;
}

import { groupStatRuns } from "../ir/group";
import type { StatBlock } from "../ir/group";

const STAT_GRID_H = 2.1;

function addStatGrid(
  s: pptxgen.Slide,
  stats: StatBlock[],
  box: { x: number; y: number; w: number },
  ctx: Ctx,
  spec: LayoutSpec,
  scale: number
) {
  const t = ctx.template;
  const bg = colorOf(t, spec.bg);
  const fg = colorOf(t, spec.fg);
  const n = stats.length;
  const cols = Math.min(n, n === 4 ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const gap = 0.3;
  const tileW = (box.w - gap * (cols - 1)) / cols;
  const tileH = STAT_GRID_H / rows - (rows > 1 ? gap / 2 : 0);
  stats.forEach((st, i) => {
    const cx = box.x + (i % cols) * (tileW + gap);
    const cy = box.y + Math.floor(i / cols) * (tileH + gap);
    s.addShape("roundRect", {
      x: cx,
      y: cy,
      w: tileW,
      h: tileH,
      rectRadius: 0.07,
      fill: { color: mixHex(bg, "FFFFFF", 0.5) },
      line: { color: mixHex(bg, fg, 0.14), width: 1 },
    });
    s.addShape("rect", {
      x: cx + 0.22,
      y: cy + 0.22,
      w: 0.45,
      h: 0.055,
      fill: { color: t.colors.accent },
    });
    s.addText(st.value, {
      x: cx + 0.2,
      y: cy + 0.3,
      w: tileW - 0.4,
      h: tileH * 0.52,
      fontSize: Math.round(38 * scale),
      fontFace: pptFont(t.fonts.display),
      bold: true,
      color: t.colors.primary,
      align: "left",
      valign: "bottom",
      margin: 0,
    });
    s.addText(st.label + (st.caption ? `\n${st.caption}` : ""), {
      x: cx + 0.2,
      y: cy + tileH * 0.56 + 0.28,
      w: tileW - 0.4,
      h: tileH * 0.44 - 0.3,
      fontSize: Math.round(12.5 * scale),
      fontFace: pptFont(t.fonts.body),
      color: mixHex(bg, fg, 0.66),
      align: "left",
      valign: "top",
      margin: 0,
    });
  });
}

async function addBlocks(
  s: pptxgen.Slide,
  blocks: Block[],
  box: { x: number; y: number; w: number; h: number },
  spec: LayoutSpec,
  ctx: Ctx,
  scale: number,
  center = false
) {
  const t = ctx.template;
  const bg = colorOf(t, spec.bg);
  const fg = colorOf(t, spec.fg);
  const muted = mixHex(bg, fg, 0.62);
  const accent = t.colors.accent;
  const primary = t.colors.primary;
  const termColor = spec.bg === "primary" ? t.colors.accent : primary;
  const bodyPt = Math.round(spec.bodyFontPt * scale);
  const bodyFont = pptFont(t.fonts.body);

  const items = groupStatRuns(blocks.filter((b) => b.kind !== "heading"));

  let y = box.y;
  // 稀疏頁垂直置中:估算總高,置於安全區中央
  if (center) {
    const total = items.reduce(
      (sum, it) =>
        sum + (it.type === "stat-grid" ? STAT_GRID_H + 0.2 : estimateBlockHeight(it.block, scale)),
      0
    );
    if (total < box.h * 0.85) y = box.y + (box.h - total) / 2;
  }

  for (const item of items) {
    if (item.type === "stat-grid") {
      if (y >= box.y + box.h - 0.3) break;
      addStatGrid(s, item.stats, { x: box.x, y, w: box.w }, ctx, spec, scale);
      y += STAT_GRID_H + 0.2;
      continue;
    }
    const block = item.block;
    if (y >= box.y + box.h - 0.3) break;
    const remaining = box.y + box.h - y;

    switch (block.kind) {
      case "para": {
        const lines = Math.max(1, Math.ceil(plainText(block.text).length / 55));
        const h = Math.min(remaining, 0.34 * lines * scale + 0.15);
        const runs = inlineToRuns(block.text, block.emphasis ? fg : fg);
        if (block.emphasis) {
          const panelH = h + 0.3;
          s.addShape("rect", {
            x: box.x,
            y,
            w: box.w,
            h: panelH,
            fill: { color: mixHex(bg, accent, 0.14) },
          });
          s.addShape("rect", {
            x: box.x,
            y,
            w: 0.07,
            h: panelH,
            fill: { color: accent },
          });
          s.addText(runs as never, {
            x: box.x + 0.3,
            y: y + 0.15,
            w: box.w - 0.6,
            h,
            fontSize: bodyPt,
            fontFace: bodyFont,
            align: spec.align === "center" ? "center" : "left",
            valign: "top",
            margin: 0,
          });
          y += panelH + 0.25;
        } else {
          s.addText(runs as never, {
            x: box.x,
            y,
            w: box.w,
            h,
            fontSize: bodyPt,
            fontFace: bodyFont,
            align: spec.align === "center" ? "center" : "left",
            valign: "top",
            margin: 0,
          });
          y += h + 0.25;
        }
        break;
      }
      case "list": {
        const runs = listToRuns(block.items, fg, termColor, block.ordered);
        const lineCount = block.items.reduce(
          (n, it) => n + (it.term ? 2 : 1) + (it.children?.length ?? 0),
          0
        );
        const h = Math.min(remaining, lineCount * 0.34 * scale + 0.2);
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
        const h = Math.min(remaining, 1.7);
        s.addShape("rect", {
          x: box.x,
          y,
          w: 0.06,
          h,
          fill: { color: accent },
        });
        s.addText(
          [
            {
              text: plainText(block.text),
              options: { italic: true, color: fg, fontFace: pptFont(t.fonts.display) },
            },
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
            x: box.x + 0.3,
            y,
            w: box.w - 0.3,
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
        s.addShape("roundRect", {
          x: box.x,
          y,
          w: box.w,
          h,
          rectRadius: 0.06,
          fill: { color: mixHex(t.colors.onSurface, "000000", 0.2) },
        });
        s.addText(block.value, {
          x: box.x + 0.2,
          y: y + 0.12,
          w: box.w - 0.4,
          h: h - 0.24,
          fontSize: Math.max(10, Math.round(bodyPt * 0.72)),
          fontFace: "Courier New",
          color: mixHex(t.colors.surface, "FFFFFF", 0.5),
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
            fontSize: Math.round(bodyPt * 0.78),
          },
        }));
        const altFill = mixHex(bg, primary, 0.05);
        const bodyRows = block.rows.map((row, ri) =>
          row.map((c) => ({
            text: plainText(c),
            options: {
              color: fg,
              fontSize: Math.round(bodyPt * 0.78),
              ...(ri % 2 === 1 ? { fill: { color: altFill } } : {}),
            },
          }))
        );
        s.addTable([headerRow, ...bodyRows] as never, {
          x: box.x,
          y,
          w: box.w,
          fontFace: bodyFont,
          border: { type: "solid", color: mixHex(bg, fg, 0.2), pt: 0.5 },
          margin: 0.07,
          valign: "middle",
        });
        y += Math.min(remaining, (block.rows.length + 1) * 0.34 + 0.2) + 0.2;
        break;
      }
      case "stat": {
        const h = Math.min(remaining, 2.6);
        s.addText(block.value, {
          x: box.x,
          y,
          w: box.w,
          h: h * 0.55,
          fontSize: Math.round(72 * scale),
          fontFace: pptFont(t.fonts.display),
          bold: true,
          color: termColor,
          align: "center",
          valign: "bottom",
          margin: 0,
        });
        s.addShape("rect", {
          x: box.x + box.w / 2 - 0.7,
          y: y + h * 0.59,
          w: 1.4,
          h: 0.06,
          fill: { color: accent },
        });
        s.addText(
          [
            { text: block.label, options: { color: muted } },
            ...(block.caption
              ? [
                  {
                    text: `\n${block.caption}`,
                    options: {
                      color: mixHex(bg, fg, 0.48),
                      fontSize: Math.round(14 * scale),
                    },
                  },
                ]
              : []),
          ] as never,
          {
            x: box.x,
            y: y + h * 0.65,
            w: box.w,
            h: h * 0.35,
            fontSize: Math.round(20 * scale),
            fontFace: bodyFont,
            align: "center",
            valign: "top",
            margin: 0,
          }
        );
        y += h + 0.2;
        break;
      }
      case "image": {
        const h = Math.min(remaining, 3.5);
        try {
          s.addImage({
            path: block.url,
            x: box.x,
            y,
            w: box.w,
            h,
            sizing: { type: "contain", w: box.w, h },
          });
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
              const ratio = png.width / png.height;
              let w = box.w;
              let hh = w / ratio;
              if (hh > h) {
                hh = h;
                w = hh * ratio;
              }
              // 整頁只有這張圖 → 垂直置中於安全區
              const lone = items.length === 1;
              const yPos = lone ? box.y + Math.max(0, (box.h - hh) / 2) : y;
              s.addImage({
                data: png.dataUrl,
                x: box.x + (box.w - w) / 2,
                y: yPos,
                w,
                h: hh,
              });
              y = yPos + hh + 0.2;
              placed = true;
            }
          } catch {
            // fallthrough to placeholder
          }
        }
        if (!placed) {
          s.addShape("roundRect", {
            x: box.x,
            y,
            w: box.w,
            h: 1.2,
            rectRadius: 0.06,
            fill: { color: mixHex(bg, fg, 0.06) },
            line: { color: mixHex(bg, fg, 0.3), width: 1, dashType: "dash" },
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

async function addCardsSlide(
  s: pptxgen.Slide,
  slide: Slide,
  spec: LayoutSpec,
  ctx: Ctx,
  scale: number
) {
  const t = ctx.template;
  addHeading(s, slide, spec, t, scale);
  const list = slide.blocks.find((b) => b.kind === "list" && b.shape === "cards") as
    | Extract<Block, { kind: "list" }>
    | undefined;
  const others = slide.blocks.filter((b) => b.kind !== "heading" && b !== list);
  const box = { ...spec.bodyBox };
  const bg = colorOf(t, spec.bg);
  const fg = colorOf(t, spec.fg);

  let y = box.y;
  if (others.length) {
    await addBlocks(s, others, { ...box, h: 1.2 }, spec, ctx, scale);
    y += 1.3;
  }
  if (list) {
    const n = list.items.length;
    const cols = n <= 3 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const gap = 0.3;
    const cardW = (box.w - gap * (cols - 1)) / cols;
    const cardH = Math.min(2.3, (box.y + box.h - y - gap * (rows - 1)) / rows);
    const cardFill = mixHex(bg, "FFFFFF", 0.55);
    const cardLine = mixHex(bg, fg, 0.16);
    list.items.forEach((it, i) => {
      const cx = box.x + (i % cols) * (cardW + gap);
      const cy = y + Math.floor(i / cols) * (cardH + gap);
      s.addShape("roundRect", {
        x: cx,
        y: cy,
        w: cardW,
        h: cardH,
        rectRadius: 0.07,
        fill: { color: cardFill },
        line: { color: cardLine, width: 1 },
        shadow: {
          type: "outer",
          color: mixHex(bg, fg, 0.5),
          blur: 7,
          offset: 2,
          angle: 90,
          opacity: 0.22,
        },
      });
      // 卡片頂部 accent 條
      s.addShape("rect", {
        x: cx + 0.18,
        y: cy + 0.2,
        w: 0.5,
        h: 0.06,
        fill: { color: t.colors.accent },
      });
      s.addText(it.term ?? plainText(it.text), {
        x: cx + 0.18,
        y: cy + 0.34,
        w: cardW - 0.36,
        h: 0.5,
        fontSize: Math.round(16 * scale),
        fontFace: pptFont(t.fonts.display),
        bold: true,
        color: t.colors.primary,
        margin: 0,
        valign: "top",
      });
      if (it.desc) {
        s.addText(plainText(it.desc), {
          x: cx + 0.18,
          y: cy + 0.88,
          w: cardW - 0.36,
          h: cardH - 1.04,
          fontSize: Math.round(13 * scale),
          fontFace: pptFont(t.fonts.body),
          color: fg,
          margin: 0,
          valign: "top",
        });
      }
    });
  }
}

async function renderSlide(
  ctx: Ctx,
  slide: Slide,
  pageNo: number,
  total: number,
  sectionNo: number
) {
  const { pres, template: t } = ctx;
  const spec = t.layouts[slide.layout];
  const s = pres.addSlide();
  const bg = colorOf(t, spec.bg);
  const fg = colorOf(t, spec.fg);
  s.background = { color: bg };
  const scale = slide.fit ? Math.min(estimateFontScale(slide), 0.85) : estimateFontScale(slide);

  switch (slide.layout) {
    case "title": {
      // 左側 accent 色帶(全高)+ 主色細帶,建立版面錨點
      s.addShape("rect", { x: 0, y: 0, w: 0.26, h: PAGE_H, fill: { color: t.colors.accent } });
      s.addShape("rect", {
        x: 0.26,
        y: 0,
        w: 0.07,
        h: PAGE_H,
        fill: { color: mixHex(bg, fg, 0.18) },
      });
      const heading = slide.blocks.find((b) => b.kind === "heading");
      const rest = slide.blocks.filter((b) => b !== heading);
      // overline 小標
      s.addText("SNAPDECK", {
        x: spec.titleBox.x,
        y: spec.titleBox.y - 0.55,
        w: 6,
        h: 0.35,
        fontSize: 11,
        fontFace: pptFont(t.fonts.body),
        color: t.colors.accent,
        charSpacing: 4,
        bold: true,
        margin: 0,
        valign: "middle",
      });
      if (heading && heading.kind === "heading") {
        s.addText(inlineToRuns(heading.text, colorOf(t, spec.titleColor)) as never, {
          x: spec.titleBox.x,
          y: spec.titleBox.y,
          w: spec.titleBox.w,
          h: spec.titleBox.h,
          fontSize: spec.titleFontPt,
          fontFace: pptFont(t.fonts.display),
          bold: true,
          align: "left",
          valign: "bottom",
          margin: 0,
        });
      }
      s.addShape("rect", {
        x: spec.titleBox.x + 0.02,
        y: spec.titleBox.y + spec.titleBox.h + 0.22,
        w: 1.8,
        h: 0.07,
        fill: { color: t.colors.accent },
      });
      for (const b of rest) {
        if (b.kind === "para") {
          s.addText(plainText(b.text), {
            x: spec.bodyBox.x,
            y: spec.bodyBox.y + 0.15,
            w: spec.bodyBox.w,
            h: spec.bodyBox.h,
            fontSize: spec.bodyFontPt,
            fontFace: pptFont(t.fonts.body),
            color: mixHex(bg, fg, 0.6),
            align: "left",
            valign: "top",
            margin: 0,
          });
        }
      }
      break;
    }
    case "section": {
      // 幽靈章節序號(底色與前景的低對比混色,右側超大字)
      s.addText(String(sectionNo).padStart(2, "0"), {
        x: PAGE_W - 5.4,
        y: 1.3,
        w: 4.7,
        h: 4.8,
        fontSize: 220,
        fontFace: pptFont(t.fonts.display),
        bold: true,
        color: mixHex(bg, fg, 0.12),
        align: "right",
        valign: "middle",
        margin: 0,
      });
      s.addText(`SECTION ${String(sectionNo).padStart(2, "0")}`, {
        x: spec.titleBox.x + 0.02,
        y: spec.titleBox.y - 0.6,
        w: 5,
        h: 0.35,
        fontSize: 12,
        fontFace: pptFont(t.fonts.body),
        color: t.colors.accent,
        charSpacing: 4,
        bold: true,
        margin: 0,
        valign: "middle",
      });
      const heading = slide.blocks.find((b) => b.kind === "heading");
      if (heading && heading.kind === "heading") {
        s.addText(inlineToRuns(heading.text, colorOf(t, spec.titleColor)) as never, {
          x: spec.titleBox.x,
          y: spec.titleBox.y,
          w: spec.titleBox.w,
          h: spec.titleBox.h,
          fontSize: spec.titleFontPt,
          fontFace: pptFont(t.fonts.display),
          bold: true,
          align: "left",
          valign: "top",
          margin: 0,
        });
      }
      s.addShape("rect", {
        x: spec.titleBox.x + 0.02,
        y: spec.titleBox.y + spec.titleBox.h + 0.15,
        w: 1.3,
        h: 0.07,
        fill: { color: t.colors.accent },
      });
      break;
    }
    case "two-col": {
      addHeading(s, slide, spec, t, scale);
      const box = spec.bodyBox;
      const colW = (box.w - 0.6) / 2;
      const [left, right] = slide.columns ?? [
        slide.blocks.filter((b) => b.kind !== "heading"),
        [],
      ];
      await addBlocks(s, left, { x: box.x, y: box.y, w: colW, h: box.h }, spec, ctx, scale);
      await addBlocks(
        s,
        right,
        { x: box.x + colW + 0.6, y: box.y, w: colW, h: box.h },
        spec,
        ctx,
        scale
      );
      s.addShape("rect", {
        x: box.x + colW + 0.28,
        y: box.y + 0.1,
        w: 0.014,
        h: box.h - 0.5,
        fill: { color: mixHex(bg, fg, 0.2) },
      });
      break;
    }
    case "cards":
      await addCardsSlide(s, slide, spec, ctx, scale);
      break;
    case "quote": {
      addHeading(s, slide, spec, t, scale);
      // 大引號 + 置中引文
      const q = slide.blocks.find((b) => b.kind === "quote");
      const box = spec.bodyBox;
      s.addText("“", {
        x: box.x,
        y: box.y - 0.5,
        w: box.w,
        h: 1.2,
        fontSize: 120,
        fontFace: pptFont(t.fonts.display),
        bold: true,
        color: t.colors.accent,
        align: "center",
        valign: "top",
        margin: 0,
      });
      if (q && q.kind === "quote") {
        s.addText(
          [
            {
              text: plainText(q.text),
              options: { italic: true, color: fg, fontFace: pptFont(t.fonts.display) },
            },
            ...(q.cite
              ? [
                  {
                    text: `\n\n— ${q.cite}`,
                    options: { color: mixHex(bg, fg, 0.6), fontSize: 16, italic: false },
                  },
                ]
              : []),
          ] as never,
          {
            x: box.x,
            y: box.y + 0.7,
            w: box.w,
            h: box.h - 0.7,
            fontSize: Math.round(spec.bodyFontPt * 1.05),
            fontFace: pptFont(t.fonts.display),
            align: "center",
            valign: "top",
            margin: 0,
          }
        );
      }
      break;
    }
    default: {
      // content / big-stat / diagram 共用縱向排版;稀疏頁與大數字頁垂直置中
      addHeading(s, slide, spec, t, scale);
      const center = slide.layout === "big-stat" || isSparse(slide);
      await addBlocks(s, slide.blocks, spec.bodyBox, spec, ctx, scale, center);
      break;
    }
  }

  if (slide.notes) s.addNotes(slide.notes);

  if (slide.layout !== "title" && slide.layout !== "section") {
    addFooter(s, ctx, spec, pageNo, total);
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
  const ctx: Ctx = { pres, template, opts, docTitle: doc.meta.title ?? "" };
  let n = 0;
  let sectionNo = 0;
  for (const slide of slides) {
    n += 1;
    if (slide.layout === "section") sectionNo += 1;
    await renderSlide(ctx, slide, n, slides.length, sectionNo);
  }
  return pres;
}
