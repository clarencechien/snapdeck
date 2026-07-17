// Drop mode 匯出:單一自含 HTML,雙模式——預設「簡報播放」,頂部 bar
// 可切「閱讀」。零外部請求(CSS/SVG/runtime 全內嵌),打包成含
// index.html 的 zip 後即可拖上 Cloudflare Drop(60 分鐘臨時網址)。
// 播放 runtime 是 ~3KB vanilla JS,不帶 React。

import { createRoot } from "react-dom/client";
import type { SlideDoc } from "../ir/types";
import type { TemplateConfig } from "../templates";
import { templateCssVars } from "../templates";
import { PageView } from "./PageView";
import { SlideSurface, computeSectionNos } from "./SlideView";

function countDiagrams(doc: SlideDoc): { page: number; deck: number } {
  let page = 0;
  let deck = 0;
  for (const slide of doc.slides) {
    const n = slide.blocks.filter((b) => b.kind === "diagram").length;
    page += n;
    if (!slide.skip) deck += n;
  }
  return { page, deck };
}

function collectCss(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) rules.push(rule.cssText);
    } catch {
      /* 跨域樣式表略過(bundle 全內嵌,理論上不存在) */
    }
  }
  return rules.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function DeckExport({
  deckDoc,
  readerDoc,
  template,
}: {
  /** 簡報態:摘要投影後的 SlideIR */
  deckDoc: SlideDoc;
  /** 閱讀態:完整 DocIR(文件密度) */
  readerDoc: SlideDoc;
  template: TemplateConfig;
}) {
  const slides = deckDoc.slides.filter((s) => !s.skip);
  const secs = computeSectionNos(slides);
  return (
    <>
      <div id="dk-deck-src">
        {slides.map((slide, i) => (
          <div className="dk-slide" key={i}>
            <SlideSurface
              slide={slide}
              template={template}
              pageNo={i + 1}
              total={slides.length}
              sectionNo={secs[i]}
              docTitle={deckDoc.meta.title}
            />
            <div className="dk-notes" hidden>
              {slide.notes ?? ""}
            </div>
          </div>
        ))}
      </div>
      <div id="dk-reader-src">
        <PageView doc={readerDoc} template={template} />
      </div>
    </>
  );
}

// 內嵌播放 runtime(vanilla,無依賴)。
const RUNTIME = String.raw`(function(){
  var slides=[].slice.call(document.querySelectorAll('.dk-slide'));
  var total=slides.length;if(!total)return;
  var frame=document.getElementById('dk-frame');
  var bar=document.getElementById('dk-bar');
  var count=document.getElementById('dk-count');
  var notesPanel=document.getElementById('dk-notes-panel');
  var notesBody=document.getElementById('dk-notes-body');
  var reader=document.getElementById('dk-reader');
  var stage=document.getElementById('dk-stage');
  var i=0;
  var q=new URLSearchParams(location.search);var p0=parseInt(q.get('p')||'',10);
  if(p0>=1&&p0<=total)i=p0-1;
  function mode(){return document.body.getAttribute('data-mode');}
  function setMode(m){
    document.body.setAttribute('data-mode',m);
    reader.hidden=(m!=='reader');stage.hidden=(m!=='deck');
    document.getElementById('dk-mode-deck').classList.toggle('on',m==='deck');
    document.getElementById('dk-mode-read').classList.toggle('on',m==='reader');
    if(m==='deck'){fit();}
  }
  function fit(){
    var bh=bar.offsetHeight;
    var w=window.innerWidth,h=window.innerHeight-bh;
    var k=Math.min(w/1280,h/720);
    frame.style.transform='scale('+k+')';
    frame.style.left=((w-1280*k)/2)+'px';
    frame.style.top=(bh+(h-720*k)/2)+'px';
  }
  function show(n){
    i=Math.max(0,Math.min(total-1,n));
    slides.forEach(function(el,j){el.style.display=j===i?'block':'none';});
    count.textContent=(i+1)+' / '+total;
    var nd=slides[i].querySelector('.dk-notes');
    notesBody.textContent=(nd&&nd.textContent.trim())||'(本頁無備註)';
    try{history.replaceState(null,'',location.pathname+'?p='+(i+1));}catch(e){}
    fit();
  }
  document.addEventListener('keydown',function(e){
    if(mode()!=='deck')return;
    switch(e.key){
      case 'ArrowRight':case 'ArrowDown':case ' ':case 'PageDown':case 'Enter':
        e.preventDefault();show(i+1);break;
      case 'ArrowLeft':case 'ArrowUp':case 'PageUp':case 'Backspace':
        e.preventDefault();show(i-1);break;
      case 'Home':show(0);break;
      case 'End':show(total-1);break;
      case 's':case 'S':notesPanel.hidden=!notesPanel.hidden;break;
      case 'Escape':notesPanel.hidden=true;break;
    }
  });
  stage.addEventListener('click',function(e){
    if(e.target.closest('#dk-notes-panel'))return;
    var r=stage.getBoundingClientRect();
    show(e.clientX-r.left>r.width/2?i+1:i-1);
  });
  document.getElementById('dk-mode-deck').addEventListener('click',function(){setMode('deck');});
  document.getElementById('dk-mode-read').addEventListener('click',function(){setMode('reader');});
  document.getElementById('dk-full').addEventListener('click',function(){
    if(document.fullscreenElement){document.exitFullscreen&&document.exitFullscreen();}
    else{document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}
  });
  window.addEventListener('resize',fit);
  setMode('deck');show(i);
})();`;

const DECK_CSS = `
  html,body{margin:0;height:100%;}
  body{overflow:hidden;background:#0c0b09;}
  body[data-mode="reader"]{overflow:auto;background:color-mix(in srgb,var(--sd-surface) 55%,#ffffff);}
  #dk-bar{position:fixed;top:0;left:0;right:0;z-index:20;height:46px;
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:0 14px;background:#201d17;color:#f3efe7;
    border-bottom:3px solid var(--sd-accent);
    font-family:var(--sd-font-body);}
  #dk-bar .dk-title{font-size:13.5px;font-weight:700;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap;min-width:0;}
  #dk-count{font-size:12.5px;color:#a89e8d;font-variant-numeric:tabular-nums;}
  .dk-actions{display:flex;gap:8px;align-items:center;flex:0 0 auto;}
  .dk-actions button{background:#2b2820;color:#e8e2d6;border:1px solid #4a453a;
    border-radius:7px;padding:5px 11px;font-size:12.5px;cursor:pointer;font-family:inherit;}
  .dk-actions button:hover{background:#38342a;}
  .dk-actions button.on{background:var(--sd-accent);border-color:var(--sd-accent);color:#fff;font-weight:700;}
  .dk-brand{font-size:11.5px;color:#a89e8d;text-decoration:none;margin-left:4px;}
  .dk-brand:hover{color:#f3efe7;}
  #dk-stage{position:fixed;inset:0;cursor:pointer;}
  #dk-frame{position:absolute;width:1280px;height:720px;transform-origin:top left;
    box-shadow:0 8px 40px rgba(0,0,0,.5);}
  .dk-slide{display:none;width:1280px;height:720px;}
  .dk-hint{position:fixed;bottom:8px;left:50%;transform:translateX(-50%);
    color:rgba(255,255,255,.3);font-size:12px;pointer-events:none;z-index:21;
    font-family:var(--sd-font-body);}
  body[data-mode="reader"] .dk-hint{display:none;}
  #dk-notes-panel{position:fixed;right:0;top:46px;bottom:0;width:320px;z-index:22;
    background:rgba(24,22,18,.97);color:#e6e0d4;padding:18px;overflow:auto;
    border-left:2px solid var(--sd-accent);font-family:var(--sd-font-body);}
  #dk-notes-panel h4{margin:0 0 10px;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:#a89e8d;}
  #dk-notes-body{font-size:15px;line-height:1.75;white-space:pre-wrap;}
  #dk-reader{padding:70px 16px 80px;}
  #dk-reader .dk-foot{max-width:780px;margin:26px auto 0;text-align:center;
    font-size:12.5px;color:var(--sd-muted);font-family:var(--sd-font-body);}
`;

export async function exportDeck(
  deckDoc: SlideDoc,
  readerDoc: SlideDoc,
  template: TemplateConfig
): Promise<string> {
  const doc = readerDoc; // meta 與 diagram 計數以完整文件為準
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(<DeckExport deckDoc={deckDoc} readerDoc={readerDoc} template={template} />);
    // 簡報態的 diagram 數以投影後為準(slide: skip 的圖不進 deck)
    const expected = { page: countDiagrams(readerDoc).page, deck: countDiagrams(deckDoc).deck };
    const deadline = Date.now() + 10000;
    const ready = () =>
      host.querySelector(".sd-page") !== null &&
      host.querySelectorAll("#dk-deck-src .sd-slide").length > 0 &&
      host.querySelectorAll("#dk-deck-src .sd-diagram svg").length >= expected.deck &&
      host.querySelectorAll("#dk-reader-src .sd-diagram svg").length >= expected.page;
    while (!ready() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 80));
    }
    if (!host.querySelector(".sd-page")) throw new Error("頁面渲染逾時");
    // 等 SlideSurface 的溢版量測/字級縮放收斂
    await new Promise((r) => setTimeout(r, 450));

    const vars = templateCssVars(template);
    const varStyle = Object.entries(vars)
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");
    const title = esc(doc.meta.title ?? "SnapDeck 簡報");
    const deckHtml = host.querySelector("#dk-deck-src")!.innerHTML;
    const readerHtml = host.querySelector("#dk-reader-src")!.innerHTML;

    return [
      "<!doctype html>",
      `<html lang="${doc.meta.lang ?? "zh-TW"}" style="${varStyle}">`,
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${title}</title>`,
      `<style>${collectCss()}</style>`,
      `<style>${DECK_CSS}</style>`,
      "</head>",
      '<body data-mode="deck">',
      '<header id="dk-bar">',
      `<div class="dk-title">${title}</div>`,
      '<span id="dk-count">1 / 1</span>',
      '<div class="dk-actions">',
      '<button id="dk-mode-deck" class="on">▶ 簡報</button>',
      '<button id="dk-mode-read">☰ 閱讀</button>',
      '<button id="dk-full" title="全螢幕">⛶</button>',
      '<a class="dk-brand" href="https://snapdeck.ai-apps.work/" target="_blank" rel="noreferrer">以 SnapDeck 製作</a>',
      "</div>",
      "</header>",
      '<main id="dk-stage">',
      `<div id="dk-frame">${deckHtml}</div>`,
      '<aside id="dk-notes-panel" hidden><h4>Speaker Notes(s 鍵開關)</h4><div id="dk-notes-body"></div></aside>',
      "</main>",
      '<div class="dk-hint">←/→ 或點擊翻頁 · s 備註 · ☰ 切閱讀模式</div>',
      '<div id="dk-reader" hidden><div class="sd-export-root">',
      readerHtml,
      '<div class="dk-foot">以 SnapDeck 製作 — 寫作即排版,貼上即上台</div>',
      "</div></div>",
      `<script>${RUNTIME}</script>`,
      "</body>",
      "</html>",
    ].join("\n");
  } finally {
    root.unmount();
    host.remove();
  }
}

/** 打包成 Cloudflare Drop 可接受的 zip(根目錄含 index.html) */
export async function deckToZip(html: string): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("index.html", html);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
