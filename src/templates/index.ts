import { cleanLight } from "./clean-light";
import { midnight } from "./midnight";
import { craft } from "./craft";
import { forest } from "./forest";
import { boardroom } from "./boardroom";
import type { TemplateConfig } from "./types";

export const templates: Record<string, TemplateConfig> = {
  "clean-light": cleanLight,
  midnight,
  craft,
  forest,
  boardroom,
};

export function getTemplate(id: string | undefined): TemplateConfig {
  // Object.hasOwn,不是 `templates[id]`:frontmatter 的 template 是使用者輸入,
  // `template: constructor` 會沿著原型鏈拿到 Object 函式,render 當場拋錯白畫面。
  // (target 是 ES2021,還沒有 Object.hasOwn)
  return id && Object.prototype.hasOwnProperty.call(templates, id) ? templates[id] : cleanLight;
}

export * from "./types";
