// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// node:events has no module of the pool, so the pool gives it an inert one
export default fixtureConfig({ externals: ["node:events", "node:url"] });
