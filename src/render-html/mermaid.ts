// mermaid 瀏覽器內 render(SVG),themeVariables 吃 template config。
// runtime 零 LLM、零網路:mermaid 打包進 bundle。

import type { TemplateConfig } from "../templates";

const cache = new Map<string, string>();
let seq = 0;

export async function renderMermaid(source: string, template: TemplateConfig): Promise<string> {
  const key = `${template.id}::${source}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: template.mermaidTheme,
    // htmlLabels 會產生 foreignObject,SVG→canvas 轉 PNG 時無法繪製(pptx 路徑)
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  });
  const id = `sd-mermaid-${seq++}`;
  const { svg } = await mermaid.render(id, source);
  cache.set(key, svg);
  return svg;
}

/** pptx 用:SVG → PNG data URL(canvas),回傳含原始寬高比 */
export async function svgToPngDataUrl(
  svg: string,
  scale = 2
): Promise<{ dataUrl: string; width: number; height: number }> {
  // mermaid 預設 useMaxWidth:寬度是 100%,rasterize 前改為 viewBox 的實際尺寸
  let vw = 800;
  let vh = 600;
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg);
  if (vb) {
    const parts = vb[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vw = Math.ceil(parts[2]);
      vh = Math.ceil(parts[3]);
    }
  }
  const sized = svg.replace(
    /<svg([^>]*)>/,
    (_m, attrs: string) =>
      `<svg${attrs
        .replace(/\swidth="[^"]*"/, "")
        .replace(/\sheight="[^"]*"/, "")
        .replace(/\sstyle="[^"]*"/, "")} width="${vw}" height="${vh}">`
  );
  const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG 載入失敗"));
      img.src = url;
    });
    const w = img.naturalWidth || vw;
    const h = img.naturalHeight || vh;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context 不可用");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
