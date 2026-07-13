import type { TemplateConfig } from "./types";
import { standardLayouts } from "./base";

// Midnight — title/section 深、content 淺的三明治結構,科技簡報。
export const midnight: TemplateConfig = {
  id: "midnight",
  name: "Midnight",
  page: { widthIn: 13.33, heightIn: 7.5 },
  colors: {
    primary: "0F172A",
    onPrimary: "F1F5F9",
    surface: "F8FAFC",
    onSurface: "0F172A",
    accent: "38BDF8",
    muted: "64748B",
  },
  fonts: {
    display: "'Sora', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    body: "'Inter', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', 'Noto Sans Mono CJK TC', monospace",
  },
  layouts: standardLayouts({
    title: "dark",
    section: "dark",
    quote: "dark",
    darkTitleColor: "accent",
  }),
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
