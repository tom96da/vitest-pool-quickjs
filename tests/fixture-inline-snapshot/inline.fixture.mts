// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

// the run fails on purpose: pool.test.mts reads its report
it("writes a new inline snapshot", () => {
  expect({ a: 1 }).toMatchInlineSnapshot();
});
