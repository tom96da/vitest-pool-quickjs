// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { fixtureConfig } from "../fixture-config.mts";

// a value that is code makes vitest evaluate the define in the context
export default { ...fixtureConfig(), define: { "globalThis.fromDefine": "URL" } };
