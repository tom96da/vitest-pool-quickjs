// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import os from "node:os";
import * as perfHooks from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { imported } from "#imported";

import main, { add, greet, token } from "./lib/main.cjs";

describe("a CommonJS file in externals", () => {
  it("reads module.exports from the default import", () => {
    expect(main.add(1, 2)).toBe(3);
  });

  it("reads the properties of module.exports as named imports", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("runs the require of another CommonJS file", () => {
    expect(greet("you")).toBe("hello you");
  });
});

describe("a specifier of the imports field in externals", () => {
  it("resolves from the root of the project", () => {
    expect(imported).toBe("from the imports field");
  });
});

describe("the modules option", () => {
  it("wins over the module of the pool", () => {
    expect((perfHooks as { marker?: string }).marker).toBe("custom marker");
  });

  it("serves a module that the pool has no module for", () => {
    expect(os.EOL).toBe("custom eol");
  });
});

describe("the plugins option", () => {
  it("transforms a module that the pool loads", () => {
    expect(token).toBe("replaced by a plugin");
  });
});
