// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

import { defined } from "./lib/ext.mjs";

it("takes the define of the vite option over the one of the file", () => {
  expect(defined).toBe("from the inline setting");
});
