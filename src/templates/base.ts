// 共用 layout 幾何(LAYOUT_WIDE 13.33×7.5)。五套 template 共用座標,
// 只在「哪些頁走深色」與字級上分歧。

import type { LayoutIntent } from "../ir/types";
import type { ColorKey, LayoutSpec } from "./types";

type Tone = "dark" | "light";

export type ToneMap = {
  title: Tone;
  section: Tone;
  quote: Tone;
  /** 深色頁的標題顏色(midnight 用 accent 提亮,其他用 onPrimary) */
  darkTitleColor?: ColorKey;
};

const GEO = {
  title: {
    titleBox: { x: 1.2, y: 2.55, w: 10.93, h: 1.7 },
    bodyBox: { x: 1.2, y: 4.35, w: 10.93, h: 1.0 },
    titleFontPt: 44,
    bodyFontPt: 18,
  },
  section: {
    titleBox: { x: 1.2, y: 3.05, w: 10.0, h: 1.5 },
    bodyBox: { x: 1.2, y: 4.65, w: 10.0, h: 1.0 },
    titleFontPt: 40,
    bodyFontPt: 18,
  },
  content: {
    titleBox: { x: 0.7, y: 0.5, w: 11.93, h: 1.0 },
    bodyBox: { x: 0.7, y: 1.75, w: 11.93, h: 5.15 },
    titleFontPt: 30,
    bodyFontPt: 17,
  },
  "big-stat": {
    titleBox: { x: 0.7, y: 0.5, w: 11.93, h: 1.0 },
    bodyBox: { x: 1.2, y: 2.3, w: 10.93, h: 3.9 },
    titleFontPt: 26,
    bodyFontPt: 20,
  },
  quote: {
    titleBox: { x: 0.7, y: 0.5, w: 11.93, h: 1.0 },
    bodyBox: { x: 1.6, y: 2.1, w: 10.13, h: 3.7 },
    titleFontPt: 26,
    bodyFontPt: 26,
  },
} as const;

function tone(t: Tone, darkTitleColor: ColorKey): Pick<LayoutSpec, "bg" | "fg" | "titleColor"> {
  return t === "dark"
    ? { bg: "primary", fg: "onPrimary", titleColor: darkTitleColor }
    : { bg: "surface", fg: "onSurface", titleColor: "primary" };
}

export function standardLayouts(tones: ToneMap): Record<LayoutIntent, LayoutSpec> {
  const darkTitle = tones.darkTitleColor ?? "onPrimary";
  const light = tone("light", darkTitle);
  const content: LayoutSpec = { ...light, ...GEO.content, align: "left" };
  return {
    title: { ...tone(tones.title, darkTitle), ...GEO.title, align: "left" },
    section: { ...tone(tones.section, darkTitle), ...GEO.section, align: "left" },
    content,
    "two-col": { ...content },
    "big-stat": { ...light, ...GEO["big-stat"], align: "center" },
    quote: { ...tone(tones.quote, darkTitle), ...GEO.quote, align: "center" },
    cards: { ...content },
    diagram: { ...content, bodyBox: { x: 0.7, y: 1.75, w: 11.93, h: 5.3 } },
  };
}
