// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { fromSetup, helpers, hidden, visible } from "./lib/probe.cjs";

describe("an external", () => {
  it("finds none of the globals that the pool hides", () => {
    expect(hidden).toEqual([]);
  });

  it("finds process, the timers and performance", () => {
    expect(visible).toEqual([]);
  });

  it("finds no helper of the pool", () => {
    expect(helpers).toEqual([]);
  });

  // the externals load with the worker, before vitest runs the setup files
  it("loads before a setup file defines a global", () => {
    expect(fromSetup).toBe("undefined");
    expect((globalThis as { fromSetup?: boolean }).fromSetup).toBe(true);
  });
});
