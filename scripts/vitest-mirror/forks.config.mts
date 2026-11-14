// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// Copied into the unit project of the mirror by `scripts/vitest-mirror.mts`, where `vite.config.ts`
// is the config of Vitest. The report goes to the file of the environment variable OUT.

import { defineConfig } from "vitest/config";
import type { ViteUserConfig } from "vitest/config";

// @ts-expect-error the config of Vitest, which lies next to this file in the mirror
import vitestConfig from "./vite.config.ts";

const base: ViteUserConfig = vitestConfig;
const { projects: _projects, ...test } = base.test!;

export default defineConfig({
  ...base,
  test: {
    ...test,
    typecheck: { enabled: false },
    reporters: ["default", "json"],
    outputFile: { json: process.env.OUT! },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: "forks",
  },
});
