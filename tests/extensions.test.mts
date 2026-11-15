// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

describe("an extension in the option", () => {
  // the crypto row is the one check that an extension that is not internal loads
  it.each([
    ["url", () => [typeof URL, typeof URLSearchParams], ["function", "function"]],
    ["crypto", () => typeof crypto.randomUUID, "function"],
    ["encoding", () => [typeof TextDecoder, typeof TextEncoder], ["function", "function"]],
  ])("shows the global of %s", (_name, probe, expected) => {
    expect(probe()).toEqual(expected);
  });
});
