// 大數字跳動:掃描容器內的 [data-num](由 statNumberAttrs 掛上),
// 用 rAF 從 0 滾到目標值。簡報態專用——閱讀態與 pptx 不呼叫。
// 尊重 prefers-reduced-motion:直接留在終值(原字串)。
//
// 註:Drop 匯出的 vanilla runtime 有一份等價的精簡實作
//(exportDeck.tsx 的 RUNTIME),兩邊行為一致,見 DECISIONS D26。

import { formatStatNumber, type StatNumber } from "../ir/statnum";

const DURATION = 900;

function readAttrs(el: HTMLElement): StatNumber | null {
  const num = Number.parseFloat(el.dataset.num ?? "");
  if (!Number.isFinite(num)) return null;
  return {
    num,
    dec: Number.parseInt(el.dataset.dec ?? "0", 10) || 0,
    pre: el.dataset.pre ?? "",
    suf: el.dataset.suf ?? "",
    group: el.dataset.grp === "1",
  };
}

/** 對 root 內所有 [data-num] 跑一次 count-up */
export function runCountUp(root: ParentNode | null | undefined): void {
  if (!root) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-num]"))) {
    const spec = readAttrs(el);
    if (!spec) continue;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / DURATION);
      const eased = 1 - Math.pow(1 - k, 3); // ease-out cubic
      el.textContent = formatStatNumber(spec, spec.num * eased);
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = formatStatNumber(spec, 0);
    requestAnimationFrame(step);
  }
}
