// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

// the run fails on purpose, and pool.test.mts reads its report
it("never runs", () => {
  expect(1).toBe(1);
});
