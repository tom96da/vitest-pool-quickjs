// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: { index: "src/index.mts" },
    deps: {
      onlyBundle: ["ts-dedent"],
      onlyImport: ["quickjs-wasi", "rolldown", "vitest"],
    },
    format: "esm",
    fixedExtension: false,
    outputOptions: { comments: false },
    dts: {
      generator: "tsgo",
      tsgo: { moduleUrl: import.meta.resolve("@typescript/native") },
    },
    publint: true,
    attw: { level: "error" },
  },
  {
    entry: { thread: "src/thread.mts" },
    deps: {
      onlyImport: ["quickjs-wasi"],
    },
    format: "esm",
    fixedExtension: false,
    outputOptions: { comments: false },
    dts: false,
  },
  {
    // The worker runs in QuickJS. The pool bundles it again with the vitest of the user.
    entry: {
      worker: "src/worker.mts",
      prelude: "src/worker/prelude.mts",
      "shims/*": "src/shims/*.mts",
    },
    deps: {
      neverBundle: ["virtual:externals", /^vitest(\/|$)/],
      onlyBundle: [],
      onlyImport: ["pathe", "virtual:externals", "vitest"],
    },
    platform: "neutral",
    format: "esm",
    fixedExtension: false,
    outputOptions: { comments: false },
    dts: false,
  },
]);
