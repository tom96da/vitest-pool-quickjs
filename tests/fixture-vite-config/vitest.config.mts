// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// the test run sets VCFILE to pick the config file of the project that the pool reads, and VINLINE
// to add a setting that wins over the file
export default fixtureConfig(
  {
    externals: ["./lib/ext.mjs"],
    vite: {
      configFile: process.env.VCFILE,
      define: process.env.VINLINE ? { __PROJECT__: '"from the inline setting"' } : undefined,
    },
  },
  { server: { deps: { external: [/ext\.mjs$/] } } },
);
