// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

describe("an extension in the option", () => {
  it.each([
    ["url", () => new URL("http://user@host:81/").port, "81"],
    ["headers", () => new Headers({ a: "1" }).get("a"), "1"],
    ["crypto", () => crypto.randomUUID().length, 36],
    ["encoding", () => new TextEncoder().encode("a").length, 1],
    ["structured-clone", () => structuredClone({ a: [1] }), { a: [1] }],
  ])("defines the global of %s", (_name, probe, expected) => {
    expect(probe()).toEqual(expected);
  });
});
