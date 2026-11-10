// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { isPrimary } from "node:cluster";
import events, { EventEmitter } from "node:events";
import { METHODS, STATUS_CODES, createServer, maxHeaderSize } from "node:http";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { double } from "./double.mts";

vi.mock("./double.mts", () => ({ double: (n: number) => n * 3 }));

describe("node modules of the pool", () => {
  it("lets a class extend a function of an inert module", () => {
    class Mine extends EventEmitter {}
    expect(new Mine()).toBeInstanceOf(EventEmitter);
  });

  it("carries the named exports on the default export", () => {
    expect(events.EventEmitter).toBe(EventEmitter);
  });

  it("decodes the percent escapes of a file URL", () => {
    expect(fileURLToPath("file:///a%20b/c.ts")).toBe("/a b/c.ts");
  });

  it("exports a function of an inert module as a function that does nothing", () => {
    expect(typeof createServer).toBe("function");
    expect(createServer()).toBeUndefined();
  });

  it("exports an array of an inert module as an empty array", () => {
    expect(METHODS).toEqual([]);
  });

  it("exports an object of an inert module as an empty object", () => {
    expect(STATUS_CODES).toEqual({});
  });

  it("keeps a number of an inert module", () => {
    expect(typeof maxHeaderSize).toBe("number");
  });

  it("keeps a boolean of an inert module", () => {
    expect(isPrimary).toBe(true);
  });

  it("serves the factory of vi.mock in place of a module", () => {
    expect(double(2)).toBe(6);
  });
});
