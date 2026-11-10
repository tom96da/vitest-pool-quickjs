// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig } from "vitest/config";
import type { ViteUserConfig } from "vitest/config";

import type { QuickJSPoolOptions } from "../src/index.mts";

// The types come from the source. The pool comes from the build.
const { quickjsPool } = (await import(
  new URL("../dist/index.js", import.meta.url).href
)) as typeof import("../src/index.mts");

/**
 * Makes the config of a fixture project.
 * @param pool - the options of the pool
 * @param test - more test options of the project
 * @returns the config
 */
export const fixtureConfig = (
  pool: QuickJSPoolOptions = {},
  test: NonNullable<ViteUserConfig["test"]> = {},
) =>
  defineConfig({
    test: {
      pool: quickjsPool(pool),
      fsModuleCache: false,
      include: ["*.fixture.mts"],
      // vitest picks another reporter in an agent environment, and the tests read the default one
      reporters: ["default"],
      ...test,
    },
  });
