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
  // 注意:diagram 一律出現在淺色 content 頁上。primaryTextColor 是節點內文字
  // (深色節點 → 淺字);頁面層文字(pie 標題/圖例、gantt 軸)必須用深色 textColor。
  mermaidTheme: {
    primaryColor: "#1E293B",
    primaryTextColor: "#F1F5F9",
    primaryBorderColor: "#38BDF8",
    lineColor: "#64748B",
    secondaryColor: "#334155",
    tertiaryColor: "#F8FAFC",
    textColor: "#0F172A",
    pieTitleTextColor: "#0F172A",
    pieLegendTextColor: "#0F172A",
    pieSectionTextColor: "#F1F5F9",
    pieStrokeColor: "#F8FAFC",
    pieOuterStrokeColor: "#64748B",
    pie1: "#0F172A",
    pie2: "#0369A1",
    pie3: "#334155",
    pie4: "#0E7490",
    pie5: "#64748B",
    pie6: "#1E3A5F",
    fontFamily: "'Inter', 'Noto Sans TC', sans-serif",
  },
};
