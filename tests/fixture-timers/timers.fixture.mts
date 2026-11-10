// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { collect, sleep } from "../fixture-helpers.mts";

describe("timers", () => {
  it("waits at least the delay of a timer", async () => {
    const start = performance.now();
    await sleep(30);
    expect(performance.now() - start).toBeGreaterThanOrEqual(25);
  });

  it("runs a timer that is due after an earlier timer threw", async () => {
    let ran = false;
    await collect("uncaughtException", async () => {
      setTimeout(() => {
        throw new Error("thrown in a timer");
      }, 0);
      setTimeout(() => {
        ran = true;
      }, 10);
      await sleep(40);
    });
    expect(ran).toBe(true);
  });

  it("passes the error of a timer to the uncaught exception listeners", async () => {
    const reported = await collect("uncaughtException", async () => {
      setTimeout(() => {
        throw new Error("thrown in a timer");
      }, 0);
      await sleep(10);
    });
    expect(reported).toHaveLength(1);
  });

  it("runs the promise jobs of a timer before the next timer", async () => {
    const order: string[] = [];
    setTimeout(() => {
      order.push("first timer");
      void Promise.resolve().then(() => order.push("job of the first timer"));
    }, 5);
    setTimeout(() => order.push("second timer"), 5);
    // both timers are due when the pool runs them in one pass
    const until = performance.now() + 10;
    while (performance.now() < until);
    await sleep(30);
    expect(order).toEqual(["first timer", "job of the first timer", "second timer"]);
  });

  it("stops an interval after clearInterval", async () => {
    let count = 0;
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        count++;
        if (count === 3) {
          clearInterval(id);
          resolve();
        }
      }, 2);
    });
    await sleep(20);
    expect(count).toBe(3);
  });
});
