// pptx 輸出結構斷言(HANDOFF M3):JSZip 解包驗 XML。
// 修 generator 不修輸出。

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { parseMarkdown } from "../parser/parse";
import { buildIR } from "../ir/buildIR";
import { summarizeDoc } from "../ir/summarize";
import { getTemplate } from "../templates";
import { renderPptx } from "./renderPptx";

const dir = join(__dirname, "../../examples");
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

async function buildZip(md: string) {
  // v2:pptx 一律吃摘要投影後的 SlideIR(與 app 行為對齊)
  const doc = summarizeDoc(buildIR(parseMarkdown(md)));
  const pres = await renderPptx(doc, getTemplate(doc.meta.template));
  const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return { doc, zip: await JSZip.loadAsync(buf) };
}

describe("renderPptx — 結構斷言", () => {
  for (const file of files) {
    it(`${file}:slide 數、notes、色碼合法`, async () => {
      const md = readFileSync(join(dir, file), "utf8");
      const { doc, zip } = await buildZip(md);

      const slideFiles = Object.keys(zip.files).filter((f) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(f)
      );
      const expected = doc.slides.filter((s) => !s.skip).length;
      expect(slideFiles.length).toBe(expected);

      // notes:有 notes 的 slide 數 ≤ notesSlides 數(pptxgenjs 每頁都會建 notesSlide)
      const notesCount = doc.slides.filter((s) => !s.skip && s.notes).length;
      const notesFiles = Object.keys(zip.files).filter((f) =>
        /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)
      );
      expect(notesFiles.length).toBeGreaterThanOrEqual(notesCount);

      // notes 內容確實進了 XML
      if (notesCount > 0) {
        const allNotes = (
          await Promise.all(notesFiles.map((f) => zip.files[f].async("string")))
        ).join("");
        const firstNote = doc.slides.find((s) => !s.skip && s.notes)?.notes?.split("\n")[0];
        expect(firstNote && allNotes.includes(firstNote.slice(0, 8))).toBeTruthy();
      }

      // 無非法色碼:solidFill 的 srgbClr 必須是 6 碼 hex
      for (const f of slideFiles) {
        const xml = await zip.files[f].async("string");
        const colors = [...xml.matchAll(/srgbClr val="([^"]+)"/g)].map((m) => m[1]);
        for (const c of colors) {
          expect(c).toMatch(/^[0-9A-Fa-f]{6}$/);
        }
      }

      // 基本健全性:presentation.xml 存在且為 LAYOUT_WIDE(13.33in = 12192000 EMU)
      const presXml = await zip.files["ppt/presentation.xml"].async("string");
      expect(presXml).toContain('cx="12192000"');
    });
  }

  it("skip 頁不進 pptx", async () => {
    const md = "---\ntitle: T\n---\n\n## 正文\n\n內容\n\n<!-- skip -->\n\n## 附錄\n\n附錄內容";
    const { zip } = await buildZip(md);
    const slideFiles = Object.keys(zip.files).filter((f) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(f)
    );
    // title + 正文 = 2,附錄被 skip
    expect(slideFiles.length).toBe(2);
    const all = (
      await Promise.all(slideFiles.map((f) => zip.files[f].async("string")))
    ).join("");
    expect(all).not.toContain("附錄內容");
  });

  it("文字為原生文字框(可編輯):標題文字出現在 slide XML", async () => {
    const md = "## 這是標題文字\n\n這是內文段落";
    const { zip } = await buildZip(md);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    expect(xml).toContain("這是標題文字");
    expect(xml).toContain("這是內文段落");
  });
});
