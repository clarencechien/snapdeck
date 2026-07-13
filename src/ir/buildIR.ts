// buildIR:ParsedDoc → SlideDoc。
// Design rules v1(HANDOFF §4)全部實作於此,確定性、可 snapshot test。

import type {
  RootContent,
  PhrasingContent,
  Heading,
  List,
  ListItem as MdListItem,
  Blockquote,
  Table,
  Paragraph,
} from "mdast";
import type { ParsedDoc, ParsedNode, Directive } from "../parser/parse";
import { LAYOUT_VALUES } from "../parser/parse";
import { chunkSlides } from "../parser/chunk";
import type {
  Block,
  InlineText,
  LayoutIntent,
  ListItem,
  Slide,
  SlideDoc,
  SlideDocMeta,
} from "./types";
import { plainText } from "./types";

// ---------- inline ----------

export function toInline(nodes: PhrasingContent[]): InlineText {
  const out: InlineText = [];
  const walk = (
    ns: PhrasingContent[],
    fmt: { bold?: boolean; italic?: boolean; strike?: boolean; link?: string }
  ) => {
    for (const n of ns) {
      switch (n.type) {
        case "text":
          out.push({ text: n.value, ...fmt });
          break;
        case "strong":
          walk(n.children as PhrasingContent[], { ...fmt, bold: true });
          break;
        case "emphasis":
          walk(n.children as PhrasingContent[], { ...fmt, italic: true });
          break;
        case "delete":
          walk(n.children as PhrasingContent[], { ...fmt, strike: true });
          break;
        case "inlineCode":
          out.push({ text: n.value, code: true, ...fmt });
          break;
        case "link":
          walk(n.children as PhrasingContent[], { ...fmt, link: n.url });
          break;
        case "break":
          out.push({ text: "\n", ...fmt });
          break;
        case "image":
          // 行內圖片在文字流中以 alt 呈現;獨立成段的圖片會升為 image block
          if (n.alt) out.push({ text: n.alt, ...fmt });
          break;
        case "html":
          // 行內 HTML(profile 禁止)在 IR 中忽略,linter 另行警告
          break;
        default:
          break;
      }
    }
  };
  walk(nodes, {});
  // 合併相鄰同格式片段,讓 snapshot 穩定
  const merged: InlineText = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.bold === s.bold &&
      last.italic === s.italic &&
      last.code === s.code &&
      last.strike === s.strike &&
      last.link === s.link
    ) {
      last.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

// ---------- blocks ----------

const STAT_START_RE = /^(?:約|近|逾|超過)?\s*(?:NT\$|US\$|[$€£¥])?\d/;
const STAT_VALUE_RE =
  /^((?:約|近|逾|超過)?\s*(?:NT\$|US\$|[$€£¥])?\d[\d,.]*(?:\s*(?:%|萬|億|兆|k|K|M|B|倍|x|X|ms|s|hr|小時|天|週|個月|月|年|台|人|件|次|元|千元|萬元|分鐘|分|秒|家|店|間|支|筆|名|位|場|座|款)(?:以?[內上下])?)?)\s*[,,::]?\s*([\s\S]*)$/;

/** design rule 5(v2):數字開頭段落 → stat(value + label + 選配 caption)。
    無逗號:全段 ≤ 20 字成大數字。
    有逗號:第一子句為標籤(value+label ≤ 20 字)、其餘為補充說明,全段 ≤ 40 字。
    超出上限 → 維持一般段落(graceful degradation)。 */
function detectStat(text: InlineText): { value: string; label: string; caption?: string } | null {
  const plain = plainText(text).trim();
  if (!STAT_START_RE.test(plain)) return null;
  const len = (s: string) => [...s.replace(/\s/g, "")].length;
  if (len(plain) > 40) return null;
  const m = STAT_VALUE_RE.exec(plain);
  if (!m) return null;
  const value = m[1].trim();
  const rest = m[2].trim();
  const commaIdx = rest.search(/[,,;;]/);
  if (commaIdx === -1) {
    if (len(plain) > 20) return null;
    return { value, label: rest };
  }
  const label = rest.slice(0, commaIdx).trim();
  const caption = rest.slice(commaIdx + 1).trim();
  if (len(value + label) > 20) return null;
  return { value, label, ...(caption ? { caption } : {}) };
}

/** design rule 4:cards / steps 清單形狀偵測 */
function detectListShape(ordered: boolean, items: ListItem[]): "plain" | "cards" | "steps" {
  if (!ordered && items.length >= 3) {
    const allCardish = items.every((it) => {
      const spans = it.text;
      if (!spans.length || !spans[0].bold) return false;
      const rest = spans
        .slice(1)
        .map((s) => s.text)
        .join("");
      return /^\s*(?:[::]|[—–-]\s|\s[—–-]\s?)/.test(rest) || rest.trim() === "";
    });
    if (allCardish) return "cards";
  }
  if (ordered && items.length <= 5 && items.length >= 2) return "steps";
  return "plain";
}

function splitCardItem(it: ListItem): ListItem {
  const spans = it.text;
  if (spans.length && spans[0].bold) {
    const term = spans[0].text.trim();
    const restSpans = spans.slice(1).map((s) => ({ ...s }));
    if (restSpans.length) {
      restSpans[0].text = restSpans[0].text.replace(/^\s*(?:[::]|[—–-])\s*/, "");
    }
    return { ...it, term, desc: restSpans };
  }
  return it;
}

function toListItems(list: List): ListItem[] {
  return (list.children as MdListItem[]).map((li) => {
    let text: InlineText = [];
    const children: ListItem[] = [];
    for (const c of li.children) {
      if (c.type === "paragraph") {
        text = text.length ? text : toInline(c.children as PhrasingContent[]);
      } else if (c.type === "list") {
        children.push(...toListItems(c as List));
      }
    }
    const item: ListItem = { text };
    if (children.length) item.children = children;
    if (typeof li.checked === "boolean") item.checked = li.checked;
    return item;
  });
}

function quoteToBlock(q: Blockquote): Block {
  const paras: InlineText[] = [];
  for (const c of q.children) {
    if (c.type === "paragraph") paras.push(toInline(c.children as PhrasingContent[]));
  }
  let cite: string | undefined;
  const all: InlineText = [];
  for (const p of paras) {
    all.push(...p, { text: "\n" });
  }
  // 尾行「— 出處」→ cite
  const flat = plainText(all).trimEnd();
  const lines = flat.split("\n");
  const last = lines[lines.length - 1]?.trim();
  if (last && /^[—–-]{1,2}\s*/.test(last) && lines.length > 1) {
    cite = last.replace(/^[—–-]{1,2}\s*/, "");
    const bodyText = lines.slice(0, -1).join("\n").trim();
    return { kind: "quote", text: [{ text: bodyText }], cite };
  }
  return { kind: "quote", text: [{ text: flat }] };
}

function tableToBlock(t: Table): Block {
  const rows = t.children.map((row) => row.children.map((cell) => toInline(cell.children as PhrasingContent[])));
  return { kind: "table", header: rows[0] ?? [], rows: rows.slice(1) };
}

export function nodeToBlock(node: RootContent): Block | null {
  switch (node.type) {
    case "heading": {
      const h = node as Heading;
      const depth = Math.min(3, Math.max(1, h.depth)) as 1 | 2 | 3;
      return { kind: "heading", depth, text: toInline(h.children as PhrasingContent[]) };
    }
    case "paragraph": {
      const p = node as Paragraph;
      // 圖片獨立成段 → image block
      if (p.children.length === 1 && p.children[0].type === "image") {
        const img = p.children[0];
        return { kind: "image", url: img.url, alt: img.alt ?? undefined };
      }
      const text = toInline(p.children as PhrasingContent[]);
      const stat = detectStat(text);
      if (stat)
        return {
          kind: "stat",
          value: stat.value,
          label: stat.label,
          ...(stat.caption ? { caption: stat.caption } : {}),
        };
      return { kind: "para", text };
    }
    case "list": {
      const l = node as List;
      const items = toListItems(l);
      const shape = detectListShape(!!l.ordered, items);
      const finalItems = shape === "cards" ? items.map(splitCardItem) : items;
      return { kind: "list", ordered: !!l.ordered, items: finalItems, shape };
    }
    case "blockquote":
      return quoteToBlock(node as Blockquote);
    case "code": {
      if ((node.lang ?? "").toLowerCase() === "mermaid") {
        return { kind: "diagram", engine: "mermaid", source: node.value };
      }
      return { kind: "code", lang: node.lang ?? undefined, value: node.value };
    }
    case "table":
      return tableToBlock(node as Table);
    default:
      return null;
  }
}

// ---------- slides ----------

type RawSlide = {
  mdNodes: ParsedNode[];
  headingPath: string[];
};

function splitIntoSlides(nodes: ParsedNode[]): RawSlide[] {
  const slides: RawSlide[] = [];
  let h1 = "";
  let h2 = "";
  for (const chunk of chunkSlides(nodes)) {
    for (const pn of chunk) {
      if (pn.type === "md" && pn.node.type === "heading") {
        const depth = (pn.node as Heading).depth;
        if (depth > 2) continue;
        const text = plainText(toInline((pn.node as Heading).children as PhrasingContent[]));
        if (depth === 1) {
          h1 = text;
          h2 = "";
        } else {
          h2 = text;
        }
        break;
      }
    }
    slides.push({ mdNodes: chunk, headingPath: [h1, h2].filter(Boolean) });
  }
  return slides;
}

function inferLayout(blocks: Block[]): LayoutIntent {
  const nonHeading = blocks.filter((b) => b.kind !== "heading");
  const headings = blocks.filter((b) => b.kind === "heading");

  // rule 2:單獨 H1 且無其他內容 → section
  if (
    headings.length === 1 &&
    (headings[0] as Extract<Block, { kind: "heading" }>).depth === 1 &&
    nonHeading.length === 0
  ) {
    return "section";
  }

  // rule 4:cards 清單為主 → cards
  const cardLists = nonHeading.filter((b) => b.kind === "list" && b.shape === "cards");
  if (cardLists.length >= 1 && nonHeading.length <= 2) return "cards";

  // rule 5:stat 存在且其他內容少 → big-stat
  const stats = nonHeading.filter((b) => b.kind === "stat");
  if (stats.length >= 1 && nonHeading.length - stats.length <= 1) return "big-stat";

  // rule 6:整頁只有 quote → quote
  if (nonHeading.length >= 1 && nonHeading.every((b) => b.kind === "quote")) return "quote";

  // rule 7:整頁以 diagram 為主 → diagram
  const diagrams = nonHeading.filter((b) => b.kind === "diagram");
  if (diagrams.length >= 1 && nonHeading.length <= 2) return "diagram";

  return "content";
}

function buildSlide(raw: RawSlide): Slide {
  const blocks: Block[] = [];
  let layoutDirective: string | undefined;
  let notes: string[] = [];
  let skip = false;
  let fit = false;
  let pendingEmphasis = false;
  const splitIndices: number[] = [];

  for (const pn of raw.mdNodes) {
    if (pn.type === "directive") {
      const d: Directive = pn.directive;
      switch (d.keyword) {
        case "layout":
          if (!layoutDirective) layoutDirective = d.value?.toLowerCase();
          break;
        case "split":
          splitIndices.push(blocks.length);
          break;
        case "notes":
          if (d.value) notes.push(d.value);
          break;
        case "emphasis":
          pendingEmphasis = true;
          break;
        case "fit":
          fit = true;
          break;
        case "skip":
          skip = true;
          break;
      }
      continue;
    }
    if (pn.type === "md") {
      const block = nodeToBlock(pn.node);
      if (block) {
        if (pendingEmphasis) {
          (block as { emphasis?: boolean }).emphasis = true;
          pendingEmphasis = false;
        }
        blocks.push(block);
      }
    }
    // unknown-directive / html:IR 忽略,linter 報
  }

  let layout: LayoutIntent;
  let layoutSource: Slide["layoutSource"];
  if (layoutDirective && (LAYOUT_VALUES as readonly string[]).includes(layoutDirective)) {
    layout = layoutDirective as LayoutIntent;
    layoutSource = "directive";
  } else {
    layout = inferLayout(blocks);
    layoutSource = "inferred";
  }

  const slide: Slide = { layout, layoutSource, blocks, headingPath: raw.headingPath };

  if (layout === "two-col" && splitIndices.length) {
    const splitAt = splitIndices[0];
    const bodyStart = blocks.findIndex((b) => b.kind !== "heading");
    const start = bodyStart === -1 ? blocks.length : bodyStart;
    slide.columns = [blocks.slice(start, splitAt), blocks.slice(splitAt)];
  }

  if (notes.length) slide.notes = notes.join("\n");
  if (skip) slide.skip = true;
  if (fit) slide.fit = true;
  return slide;
}

// ---------- doc ----------

const KNOWN_META = ["title", "author", "date", "template", "lang"] as const;

export function buildMeta(frontmatter: Record<string, unknown>): SlideDocMeta {
  const get = (k: string) => {
    const v = frontmatter[k];
    if (v == null) return undefined;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };
  return {
    title: get("title"),
    author: get("author"),
    date: get("date"),
    template: get("template") ?? "clean-light",
    lang: get("lang") ?? "zh-TW",
  };
}

export function buildIR(doc: ParsedDoc): SlideDoc {
  const meta = buildMeta(doc.frontmatter);
  const slides: Slide[] = [];

  // design rule 1:frontmatter 存在 → 第一頁為 title layout
  if (Object.keys(doc.frontmatter).length > 0 && !doc.frontmatterError) {
    const blocks: Block[] = [];
    if (meta.title) blocks.push({ kind: "heading", depth: 1, text: [{ text: meta.title }] });
    const subline = [meta.author, meta.date].filter(Boolean).join(" · ");
    if (subline) blocks.push({ kind: "para", text: [{ text: subline }] });
    slides.push({
      layout: "title",
      layoutSource: "inferred",
      blocks,
      headingPath: [],
    });
  }

  for (const raw of splitIntoSlides(doc.nodes)) {
    const slide = buildSlide(raw);
    // 空頁(只有 directive、無任何 block)不輸出
    if (slide.blocks.length === 0 && !slide.notes) continue;
    slides.push(slide);
  }

  return { meta, slides };
}
