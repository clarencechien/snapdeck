import { cleanLight } from "./clean-light";
import { midnight } from "./midnight";
import type { TemplateConfig } from "./types";

export const templates: Record<string, TemplateConfig> = {
  "clean-light": cleanLight,
  midnight,
};

export function getTemplate(id: string | undefined): TemplateConfig {
  return (id && templates[id]) || cleanLight;
}

export * from "./types";
