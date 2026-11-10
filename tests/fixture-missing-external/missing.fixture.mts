// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

import { unlisted } from "./lib/unlisted.cjs";

// the run fails on purpose: pool.test.mts reads its report
it("never runs", () => {
  expect(unlisted).toBe(true);
});
