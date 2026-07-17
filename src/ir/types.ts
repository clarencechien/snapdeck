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

/** v2:`<!-- slide: ... -->` 對單一 block 的雙態控制。
    keep = 全量進 slide;skip = 只在文件態;custom = 以 text 作為 slide 要點 */
export type SlideHint =
  | { kind: "keep" }
  | { kind: "skip" }
  | { kind: "custom"; text: string };

export type ListItem = {
  text: InlineText;
  /** cards/steps 偵測時拆出的「**粗體詞**:說明」結構 */
  term?: string;
  desc?: InlineText;
  children?: ListItem[];
  checked?: boolean | null;
};

type BlockCommon = { emphasis?: boolean; slideHint?: SlideHint };

export type Block =
  | ({ kind: "heading"; depth: 1 | 2 | 3; text: InlineText } & BlockCommon)
  | ({ kind: "para"; text: InlineText } & BlockCommon)
  | ({
      kind: "list";
      ordered: boolean;
      items: ListItem[];
      shape?: "plain" | "cards" | "steps";
    } & BlockCommon)
  | ({ kind: "quote"; text: InlineText; cite?: string } & BlockCommon)
  | ({ kind: "code"; lang?: string; value: string } & BlockCommon)
  | ({ kind: "table"; header: InlineText[]; rows: InlineText[][] } & BlockCommon)
  | ({ kind: "image"; url: string; alt?: string } & BlockCommon)
  | ({ kind: "diagram"; engine: "mermaid"; source: string; svg?: string } & BlockCommon)
  | ({ kind: "stat"; value: string; label: string; caption?: string } & BlockCommon);

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
