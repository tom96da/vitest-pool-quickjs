// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// the run counts the lines that the pool prints when it runs this file
console.log("CONFIG-LOADED");

export default {
  resolve: { alias: { "@lib": path.join(here, "lib") } },
  define: { __PROJECT__: JSON.stringify("from the project define") },
  plugins: [
    {
      name: "user-plugin",
      transform: (code: string, id: string) =>
        id.endsWith("ext.mjs") ? code.replace("__TOKEN__", "replaced by the user plugin") : null,
    },
  ],
};
