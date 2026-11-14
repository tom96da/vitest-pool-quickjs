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

it("hides the globals of the pool, and its timers and rejections work", async () => {
  for (const name of ["URL", "EventTarget", "AbortController", "__host", "__guest", "__now"]) {
    expect(name in globalThis).toBe(false);
  }
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listener);
  void Promise.reject(new Error("restored"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  process.off("unhandledRejection", listener);
  expect(seen).toHaveLength(1);
});
