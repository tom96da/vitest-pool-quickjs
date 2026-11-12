// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

describe("promises", () => {
  it("resolves matcher passes for a fulfilled promise", async () => {
    await expect(Promise.resolve(1)).resolves.toBe(1);
  });

  it("rejects matcher passes for a rejected promise", async () => {
    await expect(Promise.reject(new Error("b"))).rejects.toThrow("b");
  });

  it("finally settles a promise that a then derived", async () => {
    const value = await Promise.resolve(1)
      .then((v) => v + 1)
      .finally(() => {});
    expect(value).toBe(2);
  });
});
