// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// the test run sets SLOPPY to turn the strict mode off for the project
export default fixtureConfig(
  {
    externals: ["./lib/leak.cjs"],
    vite: process.env.SLOPPY
      ? { build: { rollupOptions: { output: { strict: false } } } }
      : undefined,
  },
  { server: { deps: { external: [/\.cjs$/] } } },
);
