// 內容量估算:確定性,HTML(稀疏頁置中判斷)與 pptx(字級縮放、垂直置中)共用。

import type { Slide } from "./types";
import { plainText } from "./types";

export function contentWeight(slide: Slide): number {
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
  return weight;
}

/** 確定性溢版估算:依內容量選字級縮放(見 DECISIONS.md D3) */
export function estimateFontScale(slide: Slide): number {
  const weight = contentWeight(slide);
  if (weight > 22) return 0.72;
  if (weight > 15) return 0.85;
  return 1;
}

/** stat 大字的字級檔位:0 = 短(最大)、1 = 中、2 = 長(最小)。
    HTML 與 pptx 共用,確保兩端一致。 */
export function statSizeTier(value: string): 0 | 1 | 2 {
  const n = [...value.replace(/\s/g, "")].length;
  if (n <= 6) return 0;
  if (n <= 10) return 1;
  return 2;
}

/** 內容稀疏(垂直置中門檻);diagram/image 頁另有專屬置中規則 */
export function isSparse(slide: Slide): boolean {
  const hasHeavy = slide.blocks.some((b) => b.kind === "diagram" || b.kind === "image");
  return !hasHeavy && contentWeight(slide) <= 7;
}
