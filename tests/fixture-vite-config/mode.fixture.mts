// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

import { defined } from "./lib/ext.mjs";

it("runs a config function with the build command and the test mode", () => {
  expect(defined).toBe("build test");
});
