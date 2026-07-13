import type { TemplateConfig } from "./types";
import { standardLayouts } from "./base";

// Clean Light — 白底單主色壓場,工作彙報的安全牌。
export const cleanLight: TemplateConfig = {
  id: "clean-light",
  name: "Clean Light",
  page: { widthIn: 13.33, heightIn: 7.5 },
  colors: {
    primary: "1A56DB",
    onPrimary: "FFFFFF",
    surface: "FFFFFF",
    onSurface: "1F2A37",
    accent: "0E9F6E",
    muted: "6B7280",
  },
  fonts: {
    display: "'Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    body: "'Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: standardLayouts({ title: "light", section: "dark", quote: "light" }),
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
