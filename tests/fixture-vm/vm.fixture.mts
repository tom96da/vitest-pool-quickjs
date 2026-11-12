// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { sleep } from "../fixture-helpers.mts";

describe("gc of node:vm", () => {
  it("clears a weak reference to a cycle that nothing reaches", async () => {
    const make = () => {
      const cycle: { self?: object } = {};
      cycle.self = cycle;
      return new WeakRef(cycle);
    };
    const ref = make();
    // a weak reference keeps its target alive until the job that made it ends
    await sleep(0);
    (runInNewContext("gc") as () => void)();
    expect(ref.deref()).toBeUndefined();
  });
});
