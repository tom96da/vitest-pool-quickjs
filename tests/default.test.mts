// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { collect, sleep } from "./helpers.mts";

describe("a global that the pool hides", () => {
  it.each([
    "EventTarget",
    "Event",
    "AbortController",
    "URL",
    "URLSearchParams",
    "TextDecoder",
    "TextEncoder",
  ])("leaves %s undefined", (name) => {
    expect(name in globalThis).toBe(false);
  });

  it.each(["__host", "__guest"])("leaves the helper %s undefined", (name) => {
    expect(name in globalThis).toBe(false);
  });
});

describe("process listeners", () => {
  it("calls a once listener one time even when the event repeats", async () => {
    let calls = 0;
    await collect("unhandledRejection", async () => {
      process.once("unhandledRejection", () => calls++);
      void Promise.reject(new Error("first"));
      await sleep(0);
      void Promise.reject(new Error("second"));
    });
    expect(calls).toBe(1);
  });

  it("returns the original function of a once listener", () => {
    const f = () => {};
    process.once("once-original", f);
    expect(process.listeners("once-original")).toEqual([f]);
    process.removeAllListeners("once-original");
  });

  it("removes a once listener by its function", () => {
    const f = () => {};
    process.once("once-remove", f);
    process.off("once-remove", f);
    expect(process.listeners("once-remove")).toHaveLength(0);
  });

  it("removes the listeners of every event without an argument", () => {
    // the listeners that vitest set, which the test puts back
    const vitest = ["unhandledRejection", "uncaughtException"].map(
      (name) => [name, process.listeners(name)] as const,
    );
    process.on("remove-c", () => {});
    process.on("remove-d", () => {});
    process.removeAllListeners();
    for (const [name, fs] of vitest) for (const f of fs) process.on(name, f);
    expect(process.listeners("remove-c")).toHaveLength(0);
    expect(process.listeners("remove-d")).toHaveLength(0);
  });

  it("removes the listeners of the named event only", () => {
    process.on("remove-a", () => {});
    process.on("remove-b", () => {});
    process.removeAllListeners("remove-a");
    expect(process.listeners("remove-a")).toHaveLength(0);
    expect(process.listeners("remove-b")).toHaveLength(1);
  });
});

describe("unhandled rejections", () => {
  it("reports a rejection that a timer callback creates before the next timer runs", async () => {
    const reported: unknown[] = [];
    const listener = (reason: unknown) => reported.push(reason);
    process.on("unhandledRejection", listener);
    const seen = await new Promise<number>((resolve) => {
      setTimeout(() => void Promise.reject(new Error("created in a timer")), 0);
      setTimeout(() => resolve(reported.length), 0);
    });
    process.off("unhandledRejection", listener);
    expect(seen).toBe(1);
  });

  it("reports the rejections in the order they happened", async () => {
    const reported = await collect("unhandledRejection", () => {
      for (const message of ["first", "second", "third"]) void Promise.reject(new Error(message));
    });
    expect(reported.map((reason) => (reason as Error).message)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("gives a listener the rejected promise after the reason", async () => {
    let received: unknown[] = [];
    const listener = (...args: unknown[]) => (received = args);
    process.on("unhandledRejection", listener);
    const promise = Promise.reject(new Error("with a promise"));
    await sleep(0);
    process.off("unhandledRejection", listener);
    expect(received[1]).toBe(promise);
  });

  it("does not report a rejection that a later catch handles in the same turn", async () => {
    const reported = await collect("unhandledRejection", async () => {
      const rejection = Promise.reject(new Error("caught late"));
      await Promise.resolve();
      void rejection.catch(() => {});
    });
    expect(reported).toHaveLength(0);
  });
});

/**
 * The line of the first frame in this file.
 * @param stack - the stack of an error
 * @returns the line
 */
const lineOf = (stack: string | undefined): string | undefined =>
  /default\.test\.mts:(\d+):\d+/.exec(stack ?? "")?.[1];

describe("the stack of a thrown error", () => {
  it("gives a thrown error a stack that starts with its name and message and names the throw", () => {
    let probe: string | undefined;
    const thrower = () => {
      // both errors come from this line, so the stack of the probe tells which line to expect
      const [error, here] = [new RangeError("message of the thrown error"), new Error()];
      probe = here.stack;
      throw error;
    };
    let thrown: unknown;
    try {
      thrower();
    } catch (error) {
      thrown = error;
    }
    const stack = (thrown as RangeError).stack;
    expect(stack).toMatch(/^RangeError: message of the thrown error\n/);
    expect(lineOf(probe)).toBeDefined();
    expect(lineOf(stack)).toBe(lineOf(probe));
  });
});

describe("timers", () => {
  it("passes the error of a timer to the uncaught exception listeners and runs the next timer", async () => {
    let ran = false;
    const reported = await collect("uncaughtException", async () => {
      setTimeout(() => {
        throw new Error("thrown in a timer");
      }, 0);
      setTimeout(() => {
        ran = true;
      }, 10);
      await sleep(40);
    });
    expect(reported).toHaveLength(1);
    expect(ran).toBe(true);
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
});
