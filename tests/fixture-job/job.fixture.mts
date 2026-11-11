// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { sleep } from "../fixture-helpers.mts";

// the run fails on purpose: pool.test.mts reads its report
describe("jobs of the context", () => {
  it("throws in a microtask", async () => {
    queueMicrotask(() => {
      throw new Error("job exploded");
    });
    await sleep(10);
    expect.assertions(0);
  });
});
