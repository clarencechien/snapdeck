// 大數字 count-up 的數值解析:把 stat 的 value 字串拆成
// 前綴 + 數字 + 後綴,供簡報態的跳動動畫使用(pptx 與閱讀態不受影響)。
//
// 安全原則:拆解後必須能「原樣還原」成同一個字串,否則視為不可動畫
// (回傳 null)——寧可靜態,也不能讓畫面停在跟原文不一樣的數字上。

export type StatNumber = {
  /** 數字前的字(例:"< "、"NT$") */
  pre: string;
  /** 數值本身(已去千分位) */
  num: number;
  /** 數字後的字(例:"%"、" 億"、"ms"、"-30%") */
  suf: string;
  /** 小數位數 */
  dec: number;
  /** 原字串是否使用千分位逗號 */
  group: boolean;
};

const NUM_RE = /^(.*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/;

/** 依 StatNumber 格式化某個中途值(count-up 每一幀都用它) */
export function formatStatNumber(n: StatNumber, value: number): string {
  const body = n.group
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: n.dec,
        maximumFractionDigits: n.dec,
      })
    : value.toFixed(n.dec);
  return `${n.pre}${body}${n.suf}`;
}

/** 拆出第一個數字;無法無損還原或無數字時回傳 null(該值不做動畫) */
export function splitLeadingNumber(value: string): StatNumber | null {
  const m = NUM_RE.exec(value);
  if (!m) return null;
  const [, pre, raw, suf] = m;
  const num = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(num) || num === 0) return null;
  const dot = raw.indexOf(".");
  const parsed: StatNumber = {
    pre,
    num,
    suf,
    dec: dot < 0 ? 0 : raw.length - dot - 1,
    group: raw.includes(","),
  };
  // 還原性檢查:格式化終值必須等於原字串
  return formatStatNumber(parsed, num) === value ? parsed : null;
}

/** render 時掛在 DOM 上的 data-* (count-up runtime 讀它);不可動畫則為空 */
export function statNumberAttrs(value: string): Record<string, string> {
  const n = splitLeadingNumber(value);
  if (!n) return {};
  return {
    "data-num": String(n.num),
    "data-dec": String(n.dec),
    "data-pre": n.pre,
    "data-suf": n.suf,
    ...(n.group ? { "data-grp": "1" } : {}),
  };
}
