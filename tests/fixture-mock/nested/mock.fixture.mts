// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { expect, it, vi } from "vitest";

import { name } from "../dependency.mts";

// the path is relative to this file, which is not in the root of the project
vi.mock("../dependency.mts", () => ({ name: "mocked" }));

it("replaces a module that vi.mock names by a relative path", () => {
  expect(name).toBe("mocked");
});
