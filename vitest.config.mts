// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig } from "vitest/config";

import { quickjsPool } from "./src/index.mts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["tests/bundle.*.test.mts", "src/**/__tests__/*.test.mts"],
        },
      },
      {
        test: {
          name: "quickjs",
          include: ["tests/shims/*.test.mts"],
          globalSetup: ["tests/shims/setup.mts"],
        },
      },
      {
        test: {
          name: "default",
          include: ["tests/default.test.mts"],
          pool: quickjsPool(),
          fsModuleCache: false,
          // a run that stops on a hang ends after 3 seconds
          testTimeout: 3000,
        },
      },
      {
        test: {
          name: "extensions",
          include: ["tests/extensions.test.mts"],
          pool: quickjsPool({
            extensions: ["encoding", "url", "headers", "crypto", "structured-clone"],
          }),
          fsModuleCache: false,
        },
      },
      {
        test: {
          name: "externals",
          include: ["tests/externals.test.mts"],
          pool: quickjsPool({
            // every file starts its own context, so that the externals load before each of them
            snapshot: false,
            // they resolve from the root of the project
            externals: [
              "./tests/externals.probe.cjs",
              "./tests/externals.main.cjs",
              "node:perf_hooks",
              "node:timers/promises",
              "node:os",
              "node:v8",
              "node:cluster",
              "node:events",
              "node:http",
            ],
            // node:perf_hooks has a module of the pool, and node:os has none
            modules: {
              "node:perf_hooks":
                'export const performance = globalThis.performance; export const marker = "custom marker"; export default { performance, marker };',
              "node:os": 'export const EOL = "custom eol"; export default { EOL };',
              // vitest imports node:v8 too, so this module gets the hidden globals that it reads
              "node:v8": "export default { url: typeof URL };",
            },
            plugins: [
              {
                name: "replace-placeholder",
                transform: (code, id) =>
                  id.endsWith("externals.main.cjs")
                    ? code.replace("__PLACEHOLDER__", "replaced by a plugin")
                    : null,
              },
            ],
          }),
          fsModuleCache: false,
          // vitest inlines a file outside node_modules, so the CommonJS files are externalized by name
          server: { deps: { external: [/\.cjs$/] } },
        },
      },
      {
        test: {
          name: "restore",
          include: ["tests/restore.*.test.mts"],
          pool: quickjsPool(),
          fsModuleCache: false,
          // one worker, so that the second file restores the context of the first
          maxWorkers: 1,
        },
      },
    ],
  },
});
