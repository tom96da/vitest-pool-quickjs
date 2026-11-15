// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import vite from "./vite.config.mts";

// settings that the pool decides, which must change nothing
export default {
  ...vite,
  envDir: "/nonexistent",
  build: {
    minify: true,
    write: true,
    outDir: "out",
    lib: { entry: "lib/dep.mjs", formats: ["es"] },
    rollupOptions: { input: "lib/dep.mjs" },
  },
};
