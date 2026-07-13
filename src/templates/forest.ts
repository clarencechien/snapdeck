import type { TemplateConfig } from "./types";
import { standardLayouts } from "./base";

// Forest — 深松綠 + 蜜金,永續/農業/戶外題材,穩重不冷。
export const forest: TemplateConfig = {
  id: "forest",
  name: "Forest",
  page: { widthIn: 13.33, heightIn: 7.5 },
  colors: {
    primary: "24523B",
    onPrimary: "F1F7EE",
    surface: "F5F8F1",
    onSurface: "1E2A22",
    accent: "D9A441",
    muted: "6E7D6F",
  },
  fonts: {
    display: "'Trebuchet MS', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
    body: "'Segoe UI', 'Inter', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: standardLayouts({ title: "dark", section: "dark", quote: "light" }),
  mermaidTheme: {
    primaryColor: "#E2EEDF",
    primaryTextColor: "#1E2A22",
    primaryBorderColor: "#24523B",
    lineColor: "#6E7D6F",
    secondaryColor: "#EDF3E8",
    tertiaryColor: "#F5F8F1",
    textColor: "#1E2A22",
    pieTitleTextColor: "#1E2A22",
    pieLegendTextColor: "#1E2A22",
    pieSectionTextColor: "#F1F7EE",
    pieStrokeColor: "#F5F8F1",
    pieOuterStrokeColor: "#6E7D6F",
    pie1: "#24523B",
    pie2: "#A87A1F",
    pie3: "#4E7A62",
    pie4: "#6E7D6F",
    pie5: "#3B5C4A",
    pie6: "#8A6D3B",
    fontFamily: "'Segoe UI', 'Noto Sans TC', sans-serif",
  },
};
