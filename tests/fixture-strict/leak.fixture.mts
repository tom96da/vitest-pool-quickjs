// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

import { run } from "./lib/leak.cjs";

it("assigns a global that nothing declared", () => {
  expect(run()).toBe(5);
});
