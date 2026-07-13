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
  return (id && templates[id]) || cleanLight;
}

export * from "./types";
