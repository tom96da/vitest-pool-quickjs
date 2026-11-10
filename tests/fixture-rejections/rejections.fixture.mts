// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { collect } from "../fixture-helpers.mts";

describe("unhandled rejections", () => {
  it("reports a rejection that nothing handles", async () => {
    const reported = await collect("unhandledRejection", () => {
      void Promise.reject(new Error("nothing handles this"));
    });
    expect(reported).toHaveLength(1);
  });

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

  it("reports the rejection of a then that nothing handles", async () => {
    const reported = await collect("unhandledRejection", () => {
      void Promise.resolve(1).then(() => {
        throw new Error("thrown in a then");
      });
    });
    expect(reported).toHaveLength(1);
  });

  it("does not report a rejection that a test awaits and catches", async () => {
    const reported = await collect("unhandledRejection", async () => {
      try {
        await Promise.reject(new Error("awaited"));
      } catch {}
    });
    expect(reported).toHaveLength(0);
  });

  it("does not report the rejection of a then that a test awaits and catches", async () => {
    const reported = await collect("unhandledRejection", async () => {
      try {
        await Promise.resolve(1).then(() => {
          throw new Error("thrown in a then");
        });
      } catch {}
    });
    expect(reported).toHaveLength(0);
  });

  it("does not report a rejection that has a catch", async () => {
    const reported = await collect("unhandledRejection", () => {
      void Promise.reject(new Error("caught")).catch(() => {});
    });
    expect(reported).toHaveLength(0);
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
