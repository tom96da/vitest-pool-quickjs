// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it, vi } from "vitest";

it("records undefined for the this of a plain call", () => {
  const fn = vi.fn<() => void>();
  fn();
  expect(fn.mock.contexts[0]).toBeUndefined();
});
