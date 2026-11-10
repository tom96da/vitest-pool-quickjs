// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import events, { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { double } from "./double.mts";

vi.mock("./double.mts", () => ({ double: (n: number) => n * 3 }));

describe("node modules of the pool", () => {
  it("lets a class extend a function of an inert module", () => {
    class Mine extends EventEmitter {}
    expect(new Mine()).toBeInstanceOf(EventEmitter);
  });

  it("keeps the names of an inert module on its default export", () => {
    expect(events.EventEmitter).toBe(EventEmitter);
  });

  it("decodes the percent escapes of a file URL", () => {
    expect(fileURLToPath("file:///a%20b/c.ts")).toBe("/a b/c.ts");
  });

  it("serves the factory of vi.mock in place of a module", () => {
    expect(double(2)).toBe(6);
  });
});
