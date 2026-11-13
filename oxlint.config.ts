// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["vitest/**"],
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "node", "jsdoc", "vitest"],
  rules: {
    "import/consistent-type-specifier-style": "error",
    "import/no-cycle": "error",
    "import/no-duplicates": "error",
  },
});
