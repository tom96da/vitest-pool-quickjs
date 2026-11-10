// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// a run that stops on a hang ends after 3 seconds
export default fixtureConfig({}, { testTimeout: 3000 });
