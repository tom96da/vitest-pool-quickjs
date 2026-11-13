// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it } from "vitest";

// the two files of this project run in two contexts that start from the same snapshot
it("starts without what another file left in its context", () => {
  expect((globalThis as { leftBehind?: string }).leftBehind).toBeUndefined();
  (globalThis as { leftBehind?: string }).leftBehind = "b";
});

it("has the origin of the time of its own thread", () => {
  expect(Math.abs(performance.timeOrigin + performance.now() - Date.now())).toBeLessThan(50);
});

it("never reads a time before the one that a script noted while it loaded", () => {
  expect(performance.now()).toBeGreaterThanOrEqual((globalThis as { loadedAt?: number }).loadedAt!);
});
