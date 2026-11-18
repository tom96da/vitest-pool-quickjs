// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { isPrimary } from "node:cluster";
import events, { EventEmitter } from "node:events";
import { METHODS, STATUS_CODES, createServer, maxHeaderSize } from "node:http";
import os from "node:os";
import * as perfHooks from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import v8 from "node:v8";

import { describe, expect, it } from "vitest";

import "./externals.setup.mts";
import main, { token } from "./externals.main.cjs";
import { fromSetup, hidden, visible } from "./externals.probe.cjs";

describe("an external", () => {
  it("finds process, the timers and performance but none of the globals that the pool hides", () => {
    expect(hidden).toEqual([]);
    expect(visible).toEqual([]);
  });

  // the externals load with the worker, before the first import of this file defines the global
  it("loads before a file defines a global", () => {
    expect(fromSetup).toBe("undefined");
    expect((globalThis as { fromSetup?: boolean }).fromSetup).toBe(true);
  });
});

describe("an import that externals does not list", () => {
  it("names the externals option in the error of an import that it does not list", async () => {
    await expect(import("./externals.unlisted.cjs")).rejects.toThrow(
      "list it in the externals option",
    );
  });
});

describe("node modules of the pool", () => {
  it("lets a class extend a function of an inert module", () => {
    class Mine extends EventEmitter {}
    expect(new Mine()).toBeInstanceOf(EventEmitter);
  });

  it("carries the named exports on the default export", () => {
    expect(events.EventEmitter).toBe(EventEmitter);
  });

  // one row for each kind of value that an inert module keeps or replaces
  it.each([
    [
      "a function of an inert module as a function that does nothing",
      () => [typeof createServer, createServer()],
      ["function", undefined],
    ],
    ["an array of an inert module as an empty array", () => METHODS, []],
    ["an object of an inert module as an empty object", () => STATUS_CODES, {}],
    ["a number of an inert module as a number", () => typeof maxHeaderSize, "number"],
    ["a boolean of an inert module as it is", () => isPrimary, true],
  ])("exports %s", (_name, actual, expected) => {
    expect(actual()).toEqual(expected);
  });
});

describe("node:timers/promises", () => {
  it("waits for the delay on the timers of the context", async () => {
    const start = performance.now();
    await setTimeout(100);
    expect(performance.now() - start).toBeGreaterThanOrEqual(90);
  });
});

describe("a CommonJS file in externals", () => {
  it("reads module.exports from the default import", () => {
    expect(main.add(1, 2)).toBe(3);
  });
});

describe("the modules option", () => {
  it("wins over the module of the pool", () => {
    expect((perfHooks as { marker?: string }).marker).toBe("custom marker");
  });

  it("serves a module that the pool has no module for", () => {
    expect(os.EOL).toBe("custom eol");
  });

  it("gives a module the hidden globals that it reads", () => {
    expect(v8.url).toBe("function");
  });
});

describe("the plugins option", () => {
  it("transforms a module that the pool loads", () => {
    expect(token).toBe("replaced by a plugin");
  });
});
