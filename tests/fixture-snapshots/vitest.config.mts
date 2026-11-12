// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";

import { fixtureConfig } from "../fixture-config.mts";
import { snapshotDir } from "./snapshot-dir.mts";

export default fixtureConfig(
  {},
  {
    env: { SNAPSHOT_DIR: snapshotDir },
    resolveSnapshotPath: (testPath, extension) =>
      path.join(snapshotDir, path.basename(testPath) + extension),
  },
);
