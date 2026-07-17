// v2 摘要投影層(HANDOFF-snapdeck-v2 §4):DocIR → SlideIR 的確定性降密度。
// 「文件 → slide 是摘要,可自動;slide → 文件是擴寫,不自動。」
// 必須確定性(同輸入同輸出)、零 LLM。規則迭代記 DECISIONS.md。
//
// 規則 v1(先中先贏):
// 1. heading / 形狀 block(list/quote/code/table/image/diagram/stat)原樣保留
//    ——它們本來就是 slide 密度,v1 design rules 繼續作用。
// 2. <!-- slide: keep -->  → 該 block 全量進 slide。
//    <!-- slide: skip -->  → 該 block 不進 slide(只存在文件態)。
//    <!-- slide: 自訂字串 --> → 以該字串取代此 block 的 slide 呈現。
// 3. 一般段落(para)→ 取第一句;第一句過長(>60 字)截為 48 字 + …。
// 4. 連續 ≥3 個一般段落 → 收斂為項目清單(各取第一句,≤5 條;
//    emphasis 段與帶 hint 的段不參與收斂)。
// 5. 投影後重推 layout(directive 指定者除外);溢版降級沿用既有機制。

import type { Block, InlineText, Slide, SlideDoc } from "./types";
import { plainText } from "./types";
import { inferLayout } from "./buildIR";

const MAX_SENTENCE = 60;
const TRUNCATE_AT = 48;
const MAX_CONVERGED_BULLETS = 5;
const CONVERGE_THRESHOLD = 3;

/** 取第一句:全形句號/問號/驚嘆號直接斷;半形 .!? 僅在後接空白或行尾時斷
    (避免切壞 3.5、e.g.、URL)。無句號 → 整段。過長 → 截斷加省略號。 */
export function firstSentence(text: string): string {
  const t = text.trim();
  let end = -1;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "。" || ch === "!" || ch === "?") {
      end = i;
      break;
    }
    if ((ch === "." || ch === "!" || ch === "?") && (i === t.length - 1 || /\s/.test(t[i + 1]))) {
      end = i;
      break;
    }
  }
  let s = end === -1 ? t : t.slice(0, end + 1);
  if ([...s].length > MAX_SENTENCE) {
    s = [...s].slice(0, TRUNCATE_AT).join("") + "…";
  }
  return s;
}

function isPlainPara(b: Block): boolean {
  return b.kind === "para" && !b.emphasis && !b.slideHint;
}

function summarizeBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];

    // 規則 2:明確標記優先
    if (b.slideHint) {
      if (b.slideHint.kind === "skip") {
        i++;
        continue;
      }
      if (b.slideHint.kind === "custom") {
        out.push({ kind: "para", text: [{ text: b.slideHint.text }], emphasis: b.emphasis });
        i++;
        continue;
      }
      // keep:全量
      out.push(b);
      i++;
      continue;
    }

    // 規則 4:連續一般段落收斂為清單
    if (isPlainPara(b)) {
      let j = i;
      while (j < blocks.length && isPlainPara(blocks[j])) j++;
      const run = blocks.slice(i, j) as Extract<Block, { kind: "para" }>[];
      if (run.length >= CONVERGE_THRESHOLD) {
        const items = run.slice(0, MAX_CONVERGED_BULLETS).map((p) => ({
          text: [{ text: firstSentence(plainText(p.text)) }] as InlineText,
        }));
        out.push({ kind: "list", ordered: false, items, shape: "plain" });
      } else {
        // 規則 3:各自取第一句
        for (const p of run) {
          const s = firstSentence(plainText(p.text));
          out.push(
            s === plainText(p.text).trim() ? p : { kind: "para", text: [{ text: s }] }
          );
        }
      }
      i = j;
      continue;
    }

    // emphasis 段:保留但仍取第一句(強調句通常已短;過長仍需降密度)
    if (b.kind === "para") {
      const plain = plainText(b.text).trim();
      const s = firstSentence(plain);
      out.push(s === plain ? b : { kind: "para", text: [{ text: s }], emphasis: b.emphasis });
      i++;
      continue;
    }

    // 規則 1:heading 與形狀 block 原樣
    out.push(b);
    i++;
  }
  return out;
}

function summarizeSlide(slide: Slide): Slide {
  const blocks = summarizeBlocks(slide.blocks);
  const next: Slide = { ...slide, blocks };

  if (slide.columns) {
    next.columns = [summarizeBlocks(slide.columns[0]), summarizeBlocks(slide.columns[1])];
  }
  // 規則 5:投影後重推 layout。例外:directive 指定者不動;
  // title 頁是 buildIR 由 frontmatter 特建(inferLayout 推不回來),不重推。
  if (slide.layoutSource !== "directive" && slide.layout !== "title") {
    next.layout = inferLayout(blocks);
  }
  return next;
}

/** DocIR(文件密度)→ SlideIR(簡報密度)。slide/pptx/deck 一律吃本函式的輸出。 */
export function summarizeDoc(doc: SlideDoc): SlideDoc {
  return { ...doc, slides: doc.slides.map(summarizeSlide) };
}
