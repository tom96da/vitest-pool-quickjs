// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// vitest inlines a file outside node_modules, so the CommonJS file is externalized by its name
export default fixtureConfig(
  {
    externals: ["./lib/main.cjs", "#imported", "node:perf_hooks", "node:os", "node:v8"],
    // node:perf_hooks has a module of the pool, and node:os has none
    modules: {
      "node:perf_hooks":
        'export const performance = globalThis.performance; export const marker = "custom marker"; export default { performance, marker };',
      "node:os": 'export const EOL = "custom eol"; export default { EOL };',
      // vitest imports node:v8 too, so this module gets the hidden globals that it reads
      "node:v8": "export default { url: typeof URL };",
    },
    vite: { define: { __SETTING__: JSON.stringify("from the vite option") } },
    plugins: [
      {
        name: "replace-token",
        transform: (code, id) =>
          id.endsWith("main.cjs") ? code.replace("__TOKEN__", "replaced by a plugin") : null,
      },
    ],
  },
  { server: { deps: { external: [/\.cjs$/] } } },
);
