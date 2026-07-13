// IR(Slide Tree)— 與呈現無關的語意結構。
// 起點定義來自 HANDOFF §4;可增欄位、不可改語意。

export type InlineSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
};

export type InlineText = InlineSpan[];

export type ListItem = {
  text: InlineText;
  /** cards/steps 偵測時拆出的「**粗體詞**:說明」結構 */
  term?: string;
  desc?: InlineText;
  children?: ListItem[];
  checked?: boolean | null;
};

export type Block =
  | { kind: "heading"; depth: 1 | 2 | 3; text: InlineText; emphasis?: boolean }
  | { kind: "para"; text: InlineText; emphasis?: boolean }
  | {
      kind: "list";
      ordered: boolean;
      items: ListItem[];
      shape?: "plain" | "cards" | "steps";
      emphasis?: boolean;
    }
  | { kind: "quote"; text: InlineText; cite?: string; emphasis?: boolean }
  | { kind: "code"; lang?: string; value: string; emphasis?: boolean }
  | { kind: "table"; header: InlineText[]; rows: InlineText[][]; emphasis?: boolean }
  | { kind: "image"; url: string; alt?: string; emphasis?: boolean }
  | { kind: "diagram"; engine: "mermaid"; source: string; svg?: string; emphasis?: boolean }
  | { kind: "stat"; value: string; label: string; caption?: string; emphasis?: boolean };

export type LayoutIntent =
  | "title"
  | "section"
  | "content"
  | "two-col"
  | "big-stat"
  | "quote"
  | "cards"
  | "diagram";

export type Slide = {
  layout: LayoutIntent;
  layoutSource: "directive" | "inferred";
  blocks: Block[];
  columns?: [Block[], Block[]];
  notes?: string;
  headingPath: string[];
  /** <!-- skip -->:不進 slide/pptx,頁面 view 仍顯示 */
  skip?: boolean;
  /** <!-- fit -->:允許縮字級塞入,放棄溢版警告 */
  fit?: boolean;
};

export type SlideDocMeta = {
  title?: string;
  author?: string;
  date?: string;
  template: string;
  lang: "zh-TW" | "en" | string;
};

export type SlideDoc = {
  meta: SlideDocMeta;
  slides: Slide[];
};

export function plainText(t: InlineText): string {
  return t.map((s) => s.text).join("");
}
