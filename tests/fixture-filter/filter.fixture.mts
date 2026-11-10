// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

describe("name filter", () => {
  it("runs when the filter matches", ({ task }) => {
    expect(task.result?.state).toBe("run");
  });

  it("skips when the filter does not match", ({ task }) => {
    expect(task.result?.state).toBe("run");
  });
});
