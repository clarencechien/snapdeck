import type { TemplateConfig } from "./types";
import { standardLayouts } from "./base";

// Craft — 暖紙底、墨字、赤陶橘點題,serif 標題的編輯風。
export const craft: TemplateConfig = {
  id: "craft",
  name: "Craft",
  page: { widthIn: 13.33, heightIn: 7.5 },
  colors: {
    primary: "B4562E",
    onPrimary: "FBF7F0",
    surface: "FAF7F1",
    onSurface: "26211A",
    accent: "D97757",
    muted: "8A8072",
  },
  fonts: {
    display: "'Georgia', 'Noto Serif TC', 'PMingLiU', serif",
    body: "'Avenir Next', 'Inter', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: standardLayouts({ title: "light", section: "dark", quote: "light" }),
  mermaidTheme: {
    primaryColor: "#F3E5D8",
    primaryTextColor: "#26211A",
    primaryBorderColor: "#B4562E",
    lineColor: "#8A8072",
    secondaryColor: "#EFE9DE",
    tertiaryColor: "#FAF7F1",
    fontFamily: "'Avenir Next', 'Noto Sans TC', sans-serif",
  },
};
