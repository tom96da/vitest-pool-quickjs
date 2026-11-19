// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// This file really builds with Vite, in process, and reads the text of the script. A build takes
// about a quarter of a second, so it holds the few builds that the vite option needs.

import { loadConfigFromFile } from "vite";
import { describe, expect, it, vi } from "vitest";

import { buildWorker } from "../src/bundle.mts";

vi.mock("vite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vite")>();
  return {
    ...actual,
    loadConfigFromFile: vi.fn<typeof actual.loadConfigFromFile>(actual.loadConfigFromFile),
  };
});

const dir = import.meta.dirname;
const configFile = "bundle.config.mts";
const externals = ["./bundle.external.mjs"];

describe("the config file of the vite option", () => {
  it("gives the aliases and the plugins, and runs once for the two passes", async () => {
    vi.mocked(loadConfigFromFile).mockClear();
    const script = await buildWorker(dir, { externals, vite: { configFile } });
    // the external module imports through the alias of the file
    expect(script).toContain("injectedGlobals");
    expect(script).toContain('"transformed"');
    expect(loadConfigFromFile).toHaveBeenCalledTimes(1);
  });

  it("yields to the other settings of the vite option", async () => {
    const define = { __API_URL__: '"https://inline.test"' };
    const script = await buildWorker(dir, { externals, vite: { configFile, define } });
    expect(script).toContain("https://inline.test");
    expect(script).not.toContain("https://api.test");
  });
});

describe("the strict mode of the script", () => {
  it("can be turned off in the vite option", async () => {
    const vite = { build: { rollupOptions: { output: { strict: false } } } };
    expect(await buildWorker(dir, { vite })).not.toMatch(/^["']use strict["']/);
  });
});

describe("a second format of the vite option", () => {
  it("is rejected", async () => {
    const vite = { build: { lib: { formats: ["es" as const] } } };
    await expect(buildWorker(dir, { vite })).rejects.toThrow("needs one script");
  });
});

describe("an entry of the externals option that the root does not resolve", () => {
  it("is rejected with the option, the entry and the root, for a mistyped path", async () => {
    const error = await buildWorker(dir, { externals: ["./src/missing.js"] }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("externals option");
    expect(error.message).toContain('"./src/missing.js"');
    expect(error.message).toContain(dir);
  });

  it("is rejected with the option, the entry and the root, for a package that is not installed", async () => {
    const error = await buildWorker(dir, { externals: ["not-installed-pkg"] }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("externals option");
    expect(error.message).toContain('"not-installed-pkg"');
    expect(error.message).toContain(dir);
  });
});
