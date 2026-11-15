// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The config file of a project, as bundle.build.test.mts loads it.
import path from "node:path";

import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => ({
  resolve: { alias: { "@": path.join(import.meta.dirname, "../src") } },
  define: {
    __API_URL__: JSON.stringify("https://api.test"),
    __MODE__: JSON.stringify(`${command}:${mode}`),
  },
  plugins: [
    {
      name: "marker",
      transform: (code, id) =>
        id.endsWith("bundle.external.mjs") ? code.replace("__PLUGIN_MARK__", "transformed") : null,
    },
  ],
  build: {
    outDir: "dist",
    minify: true,
    lib: { entry: "bundle.external.mjs", formats: ["es"] },
    rollupOptions: { input: "bundle.external.mjs" },
  },
}));
