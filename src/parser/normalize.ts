// 貼上內容的正規化:容錯 LLM 聊天介面的複製產物。
// 1. 剝掉包住整份文件的外層 code fence(``` / ````,info 為空或 markdown/md)
//    —— prompt 要求模型用 fence 包住輸出(聊天介面才有「複製原始碼」),
//    貼進來時在這裡剝掉;沒有 fence 的輸入原樣通過。
// 2. 去掉 frontmatter 前的空行/BOM(frontmatter 必須從第 1 行開始)。

const FENCE_OPEN_RE = /^(`{3,}|~{3,})\s*(markdown|md)?\s*$/i;
const FENCE_LINE_RE = /^(`{3,}|~{3,})\s*$/;

export function normalizeMd(input: string): string {
  let text = input.replace(/^﻿/, "");

  const lines = text.split("\n");
  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first++;
  let last = lines.length - 1;
  while (last >= 0 && lines[last].trim() === "") last--;

  if (first < last) {
    const open = FENCE_OPEN_RE.exec(lines[first].trim());
    const close = FENCE_LINE_RE.exec(lines[last].trim());
    // 外層 fence:開頭是 fence(info 為空或 markdown/md)、結尾是純 fence,
    // 且同為反引號或同為波浪號。內層的 ```mermaid 等不受影響。
    if (open && close && open[1][0] === close[1][0]) {
      return normalizeMd(lines.slice(first + 1, last).join("\n"));
    }
  }

  // frontmatter 前的空行:remark-frontmatter 要求 --- 在第 1 行
  if (first > 0 && lines[first]?.trim() === "---") {
    return lines.slice(first).join("\n");
  }
  return text;
}
