// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { sleep } from "../fixture-helpers.mts";

describe("process listeners", () => {
  it("calls a once listener one time even when the event repeats", async () => {
    let calls = 0;
    const absorb = () => {};
    process.on("unhandledRejection", absorb);
    process.once("unhandledRejection", () => calls++);
    void Promise.reject(new Error("first"));
    await sleep(0);
    void Promise.reject(new Error("second"));
    await sleep(0);
    process.off("unhandledRejection", absorb);
    expect(calls).toBe(1);
  });

  it("runs a nextTick callback before a timer that was set earlier", async () => {
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);
    process.nextTick(() => order.push("tick"));
    await sleep(1);
    expect(order).toEqual(["tick", "timer"]);
  });

  it("returns the original function of a once listener", () => {
    const f = () => {};
    process.once("fixture-once", f);
    expect(process.listeners("fixture-once")).toEqual([f]);
    process.removeAllListeners("fixture-once");
  });

  it.each(["off", "removeListener"] as const)("%s removes a once listener by its function", (m) => {
    const f = () => {};
    process.once("fixture-remove", f);
    process[m]("fixture-remove", f);
    expect(process.listeners("fixture-remove")).toHaveLength(0);
  });

  it("removes the listeners of every event without an argument", () => {
    const vitest = ["unhandledRejection", "uncaughtException"].map(
      (name) => [name, process.listeners(name)] as const,
    );
    process.on("fixture-c", () => {});
    process.on("fixture-d", () => {});
    process.removeAllListeners();
    for (const [name, fs] of vitest) for (const f of fs) process.on(name, f);
    expect(process.listeners("fixture-c")).toHaveLength(0);
    expect(process.listeners("fixture-d")).toHaveLength(0);
  });

  it("removes the listeners of the named event only", () => {
    process.on("fixture-a", () => {});
    process.on("fixture-b", () => {});
    process.removeAllListeners("fixture-a");
    expect(process.listeners("fixture-a")).toHaveLength(0);
    expect(process.listeners("fixture-b")).toHaveLength(1);
  });
});

describe("process.env", () => {
  it("has the variables that vitest sets for a worker", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.VITEST).toBe("true");
    expect(process.env.TEST).toBe("true");
    expect(process.env.VITEST_MODE).toBe("RUN");
  });
});
