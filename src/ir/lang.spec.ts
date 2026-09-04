// meta.lang 是唯一會被匯出器拼進 HTML 屬性的 frontmatter 欄位
// (`<html lang="…">`),而 frontmatter 是分享連結的一部分,攻擊者控制得到。
//
// 攻擊路徑:做一份 MD,frontmatter 寫
//     lang: 'x"><script>…</script><x a="'
// (合法 YAML),用 #s= 或 #l= 分享;受害者按「下載 HTML」或
// 「下載 HTML(Drop)」,產生的 index.html 就含攻擊者的 script,
// 拖上 Cloudflare Drop 之後以受害者名義執行。
//
// 站內 React 渲染不用 lang,所以 SPA 本身不受影響 —— 受影響的是匯出物。

import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../parser/parse";
import { buildIR, buildMeta } from "./buildIR";

const withLang = (raw: string) => buildIR(parseMarkdown(`---\nlang: ${raw}\ntitle: T\n---\n\n# H\n`)).meta.lang;

describe("meta.lang — BCP-47 白名單", () => {
  it("放行正常的語言標記", () => {
    for (const ok of ["zh-TW", "en", "en-US", "zh-Hant-TW", "de", "pt-BR", "sr-Latn-RS"]) {
      expect(buildMeta({ lang: ok }).lang).toBe(ok);
    }
  });

  it("沒寫就是 zh-TW", () => {
    expect(buildMeta({}).lang).toBe("zh-TW");
  });

  it("退回 zh-TW:帶引號、角括號或空白的值一律不採信", () => {
    const attacks = [
      'x"><script>alert(1)</script><x a="',
      'en" onload="alert(1)',
      "en'><img src=x onerror=alert(1)>",
      "zh TW",
      "<script>",
      "en--US",
      "",
      "toolongsubtaghere-x",
    ];
    for (const bad of attacks) {
      expect(buildMeta({ lang: bad }).lang).toBe("zh-TW");
    }
  });

  it("非字串的 frontmatter 值:一律先 String() 再過白名單", () => {
    expect(buildMeta({ lang: 123 }).lang).toBe("zh-TW");
    expect(buildMeta({ lang: { a: 1 } }).lang).toBe("zh-TW");
    expect(buildMeta({ lang: ["en", "x"] }).lang).toBe("zh-TW"); // "en,x" 不合形狀
    // 單元素陣列會被 String() 攤成 "en" —— 形狀合法就是合法,放行沒有問題。
    // 這裡寫出來是為了說明白名單管的是形狀,不是型別。
    expect(buildMeta({ lang: ["en"] }).lang).toBe("en");
  });

  it("走完整的 parse → buildIR:惡意 lang 不會活著抵達 meta", () => {
    expect(withLang(`'x"><script>alert(1)</script><x a="'`)).toBe("zh-TW");
    expect(withLang("en-GB")).toBe("en-GB");
  });

  it("匯出時拼進屬性的值不含可執行內容", () => {
    const lang = buildMeta({ lang: 'x"><script>alert(1)</script><x a="' }).lang;
    const html = `<html lang="${lang}">`;
    expect(html).not.toContain("<script");
    expect(html).toBe('<html lang="zh-TW">');
  });
});
