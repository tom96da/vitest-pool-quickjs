// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { EventEmitter } from "node:events";

import { expect, it } from "vitest";

it("imports the inert module of another file", () => {
  expect(typeof EventEmitter).toBe("function");
});
