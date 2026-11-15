// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { defined, plugged, viaAlias } from "./lib/ext.mjs";

describe("the config file of the project", () => {
  it("gives the aliases", () => {
    expect(viaAlias).toBe("from the aliased dep");
  });

  it("gives the define", () => {
    expect(defined).toBe("from the project define");
  });

  it("gives the plugins", () => {
    expect(plugged).toBe("replaced by the user plugin");
  });
});
