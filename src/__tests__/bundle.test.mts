// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";

import { parseSync } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { injectGlobals, loadConfig, pickConfig } from "../bundle.mts";

beforeEach(() => void vi.stubEnv("API_URL", "https://api.test"));
afterEach(() => void vi.unstubAllEnvs());

const inject = (code: string) =>
  injectGlobals(code, parseSync("module.mjs", code).program as never);
const imports = (code: string) =>
  (inject(code) ?? "")
    .split("\n")
    .filter((line) => line.startsWith("import "))
    .map((line) => line.replace(/ from ".*"; ?$/, ""));

describe("a name that a module reads", () => {
  // the rows came from the list that the build uses, so one global stands for all
  it("gets an import of a global that the pool injects", () => {
    expect(imports("new URL();")).toEqual(["import { URL }"]);
  });

  it("gets an import of the function of the module runner under its name", () => {
    expect(imports("__externalImport(file);")).toEqual([
      "import { externalImport as __externalImport }",
    ]);
  });

  it("gets an import for each name", () => {
    expect(imports("new URL('a'); new Event('b');")).toEqual([
      "import { URL }",
      "import { Event }",
    ]);
  });

  it("gets an import when it is a shorthand property", () => {
    expect(imports("const o = { URL };")).toEqual(["import { URL }"]);
  });

  it("gets an import also when a function shadows it", () => {
    // the import is at the module scope, so the binding of the function keeps winning
    const out = inject("function f(URL) { return URL; }\nnew Event('a');")!;
    expect(out).toContain("import { URL }");
    expect(out).toContain("import { Event }");
    expect(out).toContain("function f(URL) { return URL; }");
  });
});

describe("a mention that is not a read", () => {
  it("is a property name, a member or a label", () => {
    expect(
      inject("a.URL; b = { URL: 1 }; class A { URL() {} }; URL: for (;;) break URL;"),
    ).toBeNull();
  });

  it("is part of a string", () => {
    expect(inject("const s = 'new URL()';")).toBeNull();
  });

  it("is the target of a destructuring or a loop", () => {
    expect(inject("[URL] = x; [...Event] = y; for (URL of z); for (Event in z);")).toBeNull();
  });
});

describe("a name that a module declares", () => {
  it("is left alone when the module scope declares it", () => {
    expect(inject("const URL = 1; URL;")).toBeNull();
    expect(inject("function Event() {} new Event();")).toBeNull();
    expect(inject("import { URL } from 'x'; new URL();")).toBeNull();
    expect(inject("export class AbortController {} new AbortController();")).toBeNull();
  });

  it("is left alone when a destructuring declares it at the module scope", () => {
    expect(inject("const { URL } = x; URL;")).toBeNull();
    expect(inject("const [Event] = y; new Event();")).toBeNull();
  });

  it("is left alone when a var of a block declares it", () => {
    expect(inject("{ var URL = 1; } new URL('x');")).toBeNull();
  });

  it("gets an import when a let, a const or a class of a block declares it", () => {
    expect(imports("{ let URL = 1; } new URL('x');")).toEqual(["import { URL }"]);
    expect(imports("{ const URL = 1; } new URL('x');")).toEqual(["import { URL }"]);
    expect(imports("{ class URL {} } new URL('x');")).toEqual(["import { URL }"]);
  });

  it("gets an import when a var of a function declares it", () => {
    expect(imports("function f() { var URL = 1; } new URL('x');")).toEqual(["import { URL }"]);
  });

  it("gets an import when a var of a static block declares it", () => {
    expect(imports("class A { static { var URL = 1; } } new URL('x');")).toEqual([
      "import { URL }",
    ]);
  });
});

describe("the output of injectGlobals", () => {
  it("has the imports after a hashbang line", () => {
    expect(inject("#!/usr/bin/env node\nnew URL('a');")).toMatch(
      /^#!\/usr\/bin\/env node\nimport /,
    );
  });

  it("reads globalThis.<name> through an alias, also when the module declares the name", () => {
    const out = inject("export const URL = globalThis.URL;")!;
    expect(out).toContain("import { URL as __captured_URL }");
    expect(out).toContain("export const URL = __captured_URL;");
    expect(out).not.toContain("import { URL }");
  });

  it("keeps the text around globalThis.<name> after a character of more than one unit", () => {
    const out = inject("const s = '日本語🙂'; const u = globalThis.URL; const t = 'end';")!;
    expect(out).toContain("const s = '日本語🙂'; const u = __captured_URL; const t = 'end';");
  });

  it("leaves globalThis.<name> that the module writes or deletes", () => {
    expect(inject("globalThis.URL = 1; delete globalThis.Event; globalThis.Event++;")).toBeNull();
  });
});

describe("the settings that pickConfig takes", () => {
  it("are left unset when the config does not have them and are only the ones that it has", () => {
    expect(pickConfig({})).toEqual({ resolve: {} });
    expect(pickConfig({ resolve: { conditions: ["x"] }, build: { minify: true } })).toEqual({
      resolve: {},
    });
    expect(pickConfig({ define: { D: "1" } })).toEqual({ resolve: {}, define: { D: "1" } });
  });
});

const dir = import.meta.dirname;

describe("a config file that is missing", () => {
  it("is looked for from the root when the path is relative", async () => {
    await expect(loadConfig(dir, "none.config.mjs")).rejects.toThrow(
      `config file not found: ${path.join(dir, "none.config.mjs")}`,
    );
  });
});

describe("a config file that throws", () => {
  it("keeps the error as the cause", async () => {
    vi.stubEnv("API_URL", "");
    const error = await loadConfig(dir, "bundle.config.mts").catch((e: Error) => e);
    expect((error as Error).message).toContain("could not load the config file");
    expect((error as Error).cause).toMatchObject({ message: "API_URL is not set" });
  });
});

describe("the settings that loadConfig takes from a file", () => {
  it("are the aliases, the define and the plugins", async () => {
    const settings = await loadConfig(dir, "bundle.config.mts");
    expect(Object.keys(settings).toSorted()).toEqual(["define", "plugins", "resolve"]);
    expect(settings.resolve).toEqual({ alias: { "@": path.join(dir, "..") } });
    expect(settings.plugins).toHaveLength(1);
  });

  it("include what a config written as a function makes of the build command and the mode", async () => {
    const settings = await loadConfig(dir, "bundle.config.mts");
    expect(settings.define).toEqual({
      __API_URL__: '"https://api.test"',
      __MODE__: '"build:test"',
    });
  });
});
