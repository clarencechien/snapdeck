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

/**
 * 只放行看得懂的連結協定,其餘一律當成沒有連結(文字留著)。
 *
 * `blocks.tsx` 把 `s.link` 原樣放進 `<a href>`,而 React 18 的 production build
 * 對 `javascript:` 只在 dev 警告、不擋。實務上那條路目前走不通 ——
 * `rel="noreferrer"` 隱含 `noopener`,新分頁是沒有 creator 的 opaque origin,
 * 規範上 `javascript:` 的跨源導航不執行,現代瀏覽器都是這樣。
 * 但那是**零層次防禦**:它靠的是別人的實作細節,而不是這裡做了什麼。
 *
 * 白名單放在 IR,不放在渲染端:IR 會流進頁面 view、slide、單檔 HTML 匯出、
 * Drop zip 與 pptx —— 在出口擋要擋五次,在入口擋只要一次。
 */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** `data:image/png;base64,…`。只給 `<img src>` 用 —— 見 safeUrl 的 forImage。 */
const DATA_IMAGE = /^data:image\/[a-z0-9.+-]+[;,]/i;

/**
 * @param forImage `<img src>` 另外放行 `data:image/*`。內嵌圖片是 Markdown
 *   的正當寫法(單檔匯出要自足時尤其如此),而以 `<img>` 載入的 SVG 不會執行腳本。
 *   `<a href>` 不放行:那是一個可以導航過去的文件。
 */
export function safeUrl(url: string | null | undefined, forImage = false): string | undefined {
  if (!url) return undefined;
  const raw = url.trim();
  if (!raw) return undefined;
  if (forImage && DATA_IMAGE.test(raw)) return raw;
  // 純片段與相對路徑沒有協定,交給 URL 解析時用一個假的 base 補上。
  try {
    const resolved = new URL(raw, "https://snapdeck.invalid/");
    return SAFE_SCHEMES.has(resolved.protocol) ? raw : undefined;
  } catch {
    return undefined;
  }
}

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
        case "link": {
          // 不合法的協定 → 連結整個拿掉,文字照樣顯示。
          const link = safeUrl(n.url);
          walk(n.children as PhrasingContent[], link ? { ...fmt, link } : { ...fmt, link: undefined });
          break;
        }
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

/** 數值欄位的合法開頭:選配比較/範圍符號與約量詞,接著必須出現數字 */
const STAT_START_RE = /^[<>≤≥≈~±]?\s*(?:約|近|逾|超過)?\s*(?:NT\$|US\$|[$€£¥])?\d/;
/** 欄位分隔:全形逗號(，)/全形分號(；)/半形分號一律是;
    半形逗號後面接數字時視為千分位(10,000),不是分隔 */
const FIELD_SEP_RE = /，|；|;|,(?![0-9])/;

/** design rule 5(v4,使用者定案):**第一個逗號前的全部就是大字**。
    數值可含比較符號(< 500ms)、範圍(20-30%)、任意單位(129 KB)、
    +(10,000+ 小時)——不再用單位白名單去猜。
    格式:`數值,標籤,補充`;數值 ≤14 字、標籤 ≤16 字、全段 ≤40 字;
    千分位逗號(數字間的半形逗號)不視為欄位分隔。
    無逗號:整段即數值。超出上限 → 維持一般段落(graceful degradation)。 */
function detectStat(text: InlineText): { value: string; label: string; caption?: string } | null {
  const plain = plainText(text).trim();
  const len = (s: string) => [...s.replace(/\s/g, "")].length;
  if (len(plain) > 40) return null;

  const sep1 = plain.search(FIELD_SEP_RE);
  const value = (sep1 === -1 ? plain : plain.slice(0, sep1)).trim();
  if (!STAT_START_RE.test(value)) return null;
  if (len(value) > 14) return null;
  if (sep1 === -1) return { value, label: "" };

  const rest = plain.slice(sep1 + 1).trim();
  const sep2 = rest.search(FIELD_SEP_RE);
  const label = (sep2 === -1 ? rest : rest.slice(0, sep2)).trim();
  const caption = sep2 === -1 ? "" : rest.slice(sep2 + 1).trim();
  if (len(label) > 16) return null;
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
        // 同一組白名單:<img src> 吃到 javascript: 不會執行,但 IR 不該把它帶下去。
        const url = safeUrl(img.url, true);
        if (!url) return { kind: "para", text: [{ text: img.alt ?? "" }] };
        return { kind: "image", url, alt: img.alt ?? undefined };
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

export function inferLayout(blocks: Block[]): LayoutIntent {
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
  let pendingSlideHint: import("./types").SlideHint | undefined;
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
        case "slide": {
          // v2:雙態控制,掛在下一個 block(同 emphasis 模式)
          const v = (d.value ?? "keep").trim().replace(/^["'「]|["'」]$/g, "");
          if (v.toLowerCase() === "keep" || v === "") pendingSlideHint = { kind: "keep" };
          else if (v.toLowerCase() === "skip") pendingSlideHint = { kind: "skip" };
          else pendingSlideHint = { kind: "custom", text: v };
          break;
        }
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
        if (pendingSlideHint) {
          (block as { slideHint?: import("./types").SlideHint }).slideHint = pendingSlideHint;
          pendingSlideHint = undefined;
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

/**
 * BCP-47 的形狀:主語言 2–3 個字母,後面接任意數量的 subtag。
 *
 * lang 跟其他 meta 不一樣 —— 它是**唯一會被匯出器拼進 HTML 屬性**的欄位
 * (`<html lang="…">`),而 frontmatter 是攻擊者控制得到的:
 * `lang: 'x"><script>…</script><x a="'` 是合法的 YAML。站內用 React 渲染,
 * 不碰 lang,所以 SPA 本身沒事;但單檔 HTML 匯出與 Drop 模式的 index.html
 * 會原封不動帶著它,受害者按下「下載 HTML」就把攻擊者的 script 帶回家。
 *
 * 白名單比逃逸更可靠:語言標記本來就只有這個形狀,不符的東西沒有任何理由
 * 出現在那裡。匯出端的屬性逃逸是第二道,不是第一道。
 */
const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function buildMeta(frontmatter: Record<string, unknown>): SlideDocMeta {
  const get = (k: string) => {
    const v = frontmatter[k];
    if (v == null) return undefined;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };
  const lang = get("lang");
  return {
    title: get("title"),
    author: get("author"),
    date: get("date"),
    template: get("template") ?? "clean-light",
    lang: lang && BCP47.test(lang) ? lang : "zh-TW",
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
