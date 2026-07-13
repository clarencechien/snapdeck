import { describe, expect, it } from "vitest";
import { normalizeMd } from "./normalize";
import { parseMarkdown } from "./parse";
import { buildIR } from "../ir/buildIR";

const DOC = "---\ntitle: 測試\n---\n\n## 頁\n\n內容";

describe("normalizeMd — 貼上容錯", () => {
  it("剝掉 ```markdown 外層 fence", () => {
    expect(normalizeMd("```markdown\n" + DOC + "\n```")).toBe(DOC);
  });

  it("剝掉四反引號外層 fence(內含 mermaid 不受影響)", () => {
    const withMermaid = DOC + "\n\n```mermaid\nflowchart LR\n  A --> B\n```";
    const wrapped = "````markdown\n" + withMermaid + "\n````";
    expect(normalizeMd(wrapped)).toBe(withMermaid);
  });

  it("剝掉無 info 字串的 ``` fence 與前後空行", () => {
    expect(normalizeMd("\n\n```\n" + DOC + "\n```\n\n")).toBe(DOC);
  });

  it("沒有 fence 的輸入原樣通過", () => {
    expect(normalizeMd(DOC)).toBe(DOC);
  });

  it("frontmatter 前的空行被移除,frontmatter 仍生效", () => {
    const doc = buildIR(parseMarkdown(normalizeMd("\n\n" + DOC)));
    expect(doc.meta.title).toBe("測試");
    expect(doc.slides[0].layout).toBe("title");
  });

  it("內容自身以 mermaid fence 開頭不會被誤剝(info 非 markdown)", () => {
    const md = "```mermaid\nflowchart LR\n  A --> B\n```";
    expect(normalizeMd(md)).toBe(md);
  });

  it("聊天介面複製的 fence 包裹 + 前導空白組合", () => {
    const wrapped = "  \n```markdown\n\n" + DOC + "\n```";
    expect(normalizeMd(wrapped)).toBe(DOC);
  });
});
