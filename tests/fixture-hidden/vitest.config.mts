// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// vitest inlines a file outside node_modules, so the CommonJS file is externalized by its name
export default fixtureConfig(
  { externals: ["./lib/probe.cjs"] },
  { server: { deps: { external: [/\.cjs$/] } }, setupFiles: ["./setup.mts"] },
);
