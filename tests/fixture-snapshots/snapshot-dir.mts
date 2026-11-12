// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import os from "node:os";
import path from "node:path";

/** Where the project of the snapshot tests writes its snapshot files. */
export const snapshotDir = path.join(os.tmpdir(), "vitest-pool-quickjs-snapshots");
