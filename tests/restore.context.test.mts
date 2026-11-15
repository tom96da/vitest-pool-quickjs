// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

// two files run this file in two contexts that start from the same snapshot, and each leaves the
// path of the file that is running
const scope = globalThis as { leftBehind?: string };

it("starts without what another file left in its context", () => {
  expect(scope.leftBehind).toBeUndefined();
  scope.leftBehind = expect.getState().testPath;
});
