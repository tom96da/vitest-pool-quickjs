// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

describe("preludes", () => {
  it("runs a prelude from a path relative to the root of the project", () => {
    expect((globalThis as { fromPrelude?: string }).fromPrelude).toBe("set by a prelude");
  });
});
