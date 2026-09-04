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
    // worker/ 也要納入:短連結端點的寫入閘門測試住在那裡,跟它驗的程式放在一起。
    include: ["src/**/*.spec.ts", "worker/**/*.spec.js"],
  },
});
