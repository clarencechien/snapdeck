// Template config schema(HANDOFF §4)。
// 所有顏色/字型/間距吃 config,禁止在 renderer 硬編碼色票。

import type { LayoutIntent } from "../ir/types";

export type ColorKey = "primary" | "onPrimary" | "surface" | "onSurface" | "accent" | "muted";

/** pptx 座標(吋,LAYOUT_WIDE 13.33 × 7.5) */
export type BoxSpec = { x: number; y: number; w: number; h: number };

export type LayoutSpec = {
  /** 背景與前景取色(colors 的 key),midnight 的三明治結構靠這裡 */
  bg: ColorKey;
  fg: ColorKey;
  titleColor: ColorKey;
  /** pptx 端座標 */
  titleBox: BoxSpec;
  bodyBox: BoxSpec;
  titleFontPt: number;
  bodyFontPt: number;
  /** title/section 置中等變化 */
  align?: "left" | "center";
};

export type TemplateConfig = {
  id: string;
  name: string;
  page: { widthIn: number; heightIn: number };
  /** 6 碼 hex,無 # */
  colors: Record<ColorKey, string>;
  fonts: { display: string; body: string; mono: string };
  layouts: Record<LayoutIntent, LayoutSpec>;
  mermaidTheme: Record<string, string>;
};

/** CSS custom properties 注入用 */
export function templateCssVars(t: TemplateConfig): Record<string, string> {
  return {
    "--sd-primary": `#${t.colors.primary}`,
    "--sd-on-primary": `#${t.colors.onPrimary}`,
    "--sd-surface": `#${t.colors.surface}`,
    "--sd-on-surface": `#${t.colors.onSurface}`,
    "--sd-accent": `#${t.colors.accent}`,
    "--sd-muted": `#${t.colors.muted}`,
    "--sd-font-display": t.fonts.display,
    "--sd-font-body": t.fonts.body,
    "--sd-font-mono": t.fonts.mono,
  };
}
