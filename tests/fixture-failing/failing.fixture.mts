// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it, vi } from "vitest";

// the run fails on purpose: pool.test.mts reads its report
describe("reports of the context", () => {
  it("fails with the diff of two objects", () => {
    expect({ a: 1 }).toEqual({ a: 2 });
  });

  it("writes console.log to stdout", () => {
    const log = vi.spyOn(console, "log");
    console.log("log from the context", { a: 1 });
    expect(log).toHaveBeenCalledOnce();
  });

  it("writes process.stdout.write to stdout", () => {
    expect(process.stdout.write("write to stdout from the context\n")).toBe(true);
  });

  it("writes process.stderr.write to stderr", () => {
    expect(process.stderr.write("write to stderr from the context\n")).toBe(true);
  });

  it("writes console.error to stderr", () => {
    const error = vi.spyOn(console, "error");
    console.error("error from the context");
    expect(error).toHaveBeenCalledOnce();
  });

  it("fails with a thrown error", () => {
    const thrower = () => {
      throw new RangeError("message of the thrown error");
    };
    expect(thrower()).toBeUndefined();
  });
});
