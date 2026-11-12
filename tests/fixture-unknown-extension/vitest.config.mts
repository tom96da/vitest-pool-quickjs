// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// the run fails on purpose: pool.test.mts reads its report
export default fixtureConfig({ extensions: ["nope" as never] });
