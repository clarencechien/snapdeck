import type { TemplateConfig, LayoutSpec } from "./types";

const PAGE = { widthIn: 13.33, heightIn: 7.5 };

const base = {
  bg: "surface",
  fg: "onSurface",
  titleColor: "primary",
  titleBox: { x: 0.7, y: 0.45, w: 11.93, h: 1.0 },
  bodyBox: { x: 0.7, y: 1.7, w: 11.93, h: 5.3 },
  titleFontPt: 30,
  bodyFontPt: 17,
  align: "left",
} satisfies LayoutSpec;

export const cleanLight: TemplateConfig = {
  id: "clean-light",
  name: "Clean Light",
  page: PAGE,
  colors: {
    primary: "1A56DB",
    onPrimary: "FFFFFF",
    surface: "FFFFFF",
    onSurface: "1F2A37",
    accent: "0E9F6E",
    muted: "6B7280",
  },
  fonts: {
    display:
      "'Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    body: "'Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: {
    title: {
      ...base,
      bg: "surface",
      titleColor: "onSurface",
      titleBox: { x: 1.2, y: 2.6, w: 10.93, h: 1.6 },
      bodyBox: { x: 1.2, y: 4.3, w: 10.93, h: 1.0 },
      titleFontPt: 44,
      bodyFontPt: 18,
      align: "left",
    },
    section: {
      ...base,
      bg: "primary",
      fg: "onPrimary",
      titleColor: "onPrimary",
      titleBox: { x: 1.2, y: 3.0, w: 10.93, h: 1.5 },
      bodyBox: { x: 1.2, y: 4.6, w: 10.93, h: 1.0 },
      titleFontPt: 40,
      align: "left",
    },
    content: { ...base },
    "two-col": { ...base },
    "big-stat": {
      ...base,
      titleBox: { x: 0.7, y: 0.45, w: 11.93, h: 1.0 },
      bodyBox: { x: 1.2, y: 2.2, w: 10.93, h: 4.0 },
      titleFontPt: 26,
      bodyFontPt: 20,
      align: "center",
    },
    quote: {
      ...base,
      bodyBox: { x: 1.6, y: 2.0, w: 10.13, h: 3.8 },
      bodyFontPt: 26,
      align: "center",
    },
    cards: { ...base },
    diagram: { ...base, bodyBox: { x: 0.7, y: 1.7, w: 11.93, h: 5.4 } },
  },
  mermaidTheme: {
    primaryColor: "#E8F0FE",
    primaryTextColor: "#1F2A37",
    primaryBorderColor: "#1A56DB",
    lineColor: "#6B7280",
    secondaryColor: "#F3F4F6",
    tertiaryColor: "#FFFFFF",
    fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
  },
};
