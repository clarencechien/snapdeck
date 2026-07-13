import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // mermaid is large; raise the warning threshold and split it out
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          mermaid: ["mermaid"],
          pptx: ["pptxgenjs"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
