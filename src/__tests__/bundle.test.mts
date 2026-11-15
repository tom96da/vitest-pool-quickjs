// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

// The tests of injectGlobals and pickConfig, the two functions of bundle.mts that take no build.

import { parseSync } from "vite";
import { describe, expect, it } from "vitest";

import { injectGlobals, pickConfig } from "../bundle.mts";
import { injectedGlobals } from "../extensions.mts";

const inject = (code: string) =>
  injectGlobals(code, parseSync("module.mjs", code).program as never);
const imports = (code: string) =>
  (inject(code) ?? "")
    .split("\n")
    .filter((line) => line.startsWith("import "))
    .map((line) => line.replace(/ from ".*"; ?$/, ""));

describe("a name that a module reads", () => {
  it.each(injectedGlobals)("gets an import of %s", (name) => {
    expect(imports(`new ${name}();`)).toEqual([`import { ${name} }`]);
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

  it("gets an import when typeof reads it", () => {
    expect(imports("const t = typeof URL;")).toEqual(["import { URL }"]);
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
  it("is null when the module reads no name", () => {
    expect(inject("const a = 1;")).toBeNull();
  });

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
  it("are the aliases, the define and the plugins", () => {
    const plugins = [{ name: "p" }];
    const picked = pickConfig({
      resolve: { alias: { a: "b" }, conditions: ["x"] },
      define: { D: "1" },
      plugins,
      build: { minify: true },
      envDir: "e",
    });
    expect(picked).toEqual({ resolve: { alias: { a: "b" } }, define: { D: "1" }, plugins });
  });

  it("are left unset when the config does not have them", () => {
    expect(pickConfig({})).toEqual({ resolve: {} });
    expect(pickConfig({ resolve: { conditions: ["x"] }, build: { minify: true } })).toEqual({
      resolve: {},
    });
  });

  it("are only the ones that the config has", () => {
    expect(pickConfig({ define: { D: "1" } })).toEqual({ resolve: {}, define: { D: "1" } });
  });
});
