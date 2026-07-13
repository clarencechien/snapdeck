import type { TemplateConfig } from "./types";
import { standardLayouts } from "./base";

// Boardroom — 藏青 + 金,serif 標題,董事會/財務/正式提案。
export const boardroom: TemplateConfig = {
  id: "boardroom",
  name: "Boardroom",
  page: { widthIn: 13.33, heightIn: 7.5 },
  colors: {
    primary: "1F2A44",
    onPrimary: "EEF1F8",
    surface: "F7F8FA",
    onSurface: "1C2333",
    accent: "C9A227",
    muted: "70798C",
  },
  fonts: {
    display: "'Palatino Linotype', 'Georgia', 'Noto Serif TC', serif",
    body: "'Segoe UI', 'Inter', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: standardLayouts({
    title: "dark",
    section: "dark",
    quote: "dark",
    darkTitleColor: "accent",
  }),
  mermaidTheme: {
    primaryColor: "#E4E8F2",
    primaryTextColor: "#1C2333",
    primaryBorderColor: "#1F2A44",
    lineColor: "#70798C",
    secondaryColor: "#EDF0F6",
    tertiaryColor: "#F7F8FA",
    fontFamily: "'Segoe UI', 'Noto Sans TC', sans-serif",
  },
};
