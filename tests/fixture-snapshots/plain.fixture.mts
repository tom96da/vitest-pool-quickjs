// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

// pool.test.mts leaves a snapshot file for this file, which has no snapshot, and updates the run
it("has no snapshot", () => {
  expect(1).toBe(1);
});
