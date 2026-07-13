import type { TemplateConfig, LayoutSpec } from "./types";

const PAGE = { widthIn: 13.33, heightIn: 7.5 };

// 三明治結構:title/section 深底,content 淺底(HANDOFF §4)
const dark = {
  bg: "primary",
  fg: "onPrimary",
  titleColor: "accent",
  titleBox: { x: 1.2, y: 2.6, w: 10.93, h: 1.6 },
  bodyBox: { x: 1.2, y: 4.3, w: 10.93, h: 1.0 },
  titleFontPt: 44,
  bodyFontPt: 18,
  align: "left",
} satisfies LayoutSpec;

const light = {
  bg: "surface",
  fg: "onSurface",
  titleColor: "primary",
  titleBox: { x: 0.7, y: 0.45, w: 11.93, h: 1.0 },
  bodyBox: { x: 0.7, y: 1.7, w: 11.93, h: 5.3 },
  titleFontPt: 30,
  bodyFontPt: 17,
  align: "left",
} satisfies LayoutSpec;

export const midnight: TemplateConfig = {
  id: "midnight",
  name: "Midnight",
  page: PAGE,
  colors: {
    primary: "0F172A",
    onPrimary: "F1F5F9",
    surface: "F8FAFC",
    onSurface: "0F172A",
    accent: "38BDF8",
    muted: "64748B",
  },
  fonts: {
    display:
      "'Sora', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    body: "'Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: {
    title: { ...dark },
    section: {
      ...dark,
      titleBox: { x: 1.2, y: 3.0, w: 10.93, h: 1.5 },
      titleFontPt: 40,
    },
    content: { ...light },
    "two-col": { ...light },
    "big-stat": {
      ...light,
      bodyBox: { x: 1.2, y: 2.2, w: 10.93, h: 4.0 },
      titleFontPt: 26,
      bodyFontPt: 20,
      align: "center",
    },
    quote: {
      ...dark,
      titleColor: "onPrimary",
      bodyBox: { x: 1.6, y: 2.0, w: 10.13, h: 3.8 },
      bodyFontPt: 26,
      align: "center",
    },
    cards: { ...light },
    diagram: { ...light, bodyBox: { x: 0.7, y: 1.7, w: 11.93, h: 5.4 } },
  },
  mermaidTheme: {
    primaryColor: "#1E293B",
    primaryTextColor: "#F1F5F9",
    primaryBorderColor: "#38BDF8",
    lineColor: "#64748B",
    secondaryColor: "#334155",
    tertiaryColor: "#0F172A",
    fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
  },
};
