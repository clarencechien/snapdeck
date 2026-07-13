// 連續 ≥2 個 stat block → KPI 看板(dashboard)分組。
// HTML 與 pptx renderer 共用,確保兩端語意一致。

import type { Block } from "./types";

export type StatBlock = Extract<Block, { kind: "stat" }>;

export type RenderItem =
  | { type: "block"; block: Block }
  | { type: "stat-grid"; stats: StatBlock[] };

export function groupStatRuns(blocks: Block[]): RenderItem[] {
  const items: RenderItem[] = [];
  let run: StatBlock[] = [];
  const flush = () => {
    if (run.length >= 2) items.push({ type: "stat-grid", stats: run });
    else run.forEach((b) => items.push({ type: "block", block: b }));
    run = [];
  };
  for (const b of blocks) {
    if (b.kind === "stat") {
      run.push(b);
    } else {
      flush();
      items.push({ type: "block", block: b });
    }
  }
  flush();
  return items;
}
