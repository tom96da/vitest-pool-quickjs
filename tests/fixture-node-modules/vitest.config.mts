// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// none of these has a module of the pool, so the pool gives each an inert one
export default fixtureConfig({
  externals: ["node:cluster", "node:events", "node:http", "node:url"],
});
