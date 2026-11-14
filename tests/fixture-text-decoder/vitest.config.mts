// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// vitest has the global TextDecoder only when the extension is listed
export default fixtureConfig({ extensions: ["encoding"] });
