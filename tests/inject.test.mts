// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { parseAst } from "vite";
import { describe, expect, it } from "vitest";

import { injectGlobals, pickConfig } from "../src/bundle.mts";

const inject = (code: string) => injectGlobals(code, parseAst(code) as never);
const imports = (code: string) =>
  (inject(code) ?? "")
    .split("\n")
    .filter((line) => line.startsWith("import "))
    .map((line) => line.replace(/ from ".*"; ?$/, ""));

describe("injectGlobals", () => {
  it("imports a name that the module reads", () => {
    expect(imports("new URL('a');")).toEqual(["import { URL }"]);
  });

  it("imports the function of the module runner under its name", () => {
    expect(imports("__externalImport(file);")).toEqual([
      "import { externalImport as __externalImport }",
    ]);
  });

  it("imports a name that is read as a shorthand property", () => {
    expect(imports("const o = { URL };")).toEqual(["import { URL }"]);
  });

  it("imports a name that typeof reads", () => {
    expect(imports("const t = typeof URL;")).toEqual(["import { URL }"]);
  });

  it("imports the name for a module that shadows it in a function", () => {
    // the import is at the module scope, so the local binding keeps winning
    const out = inject("function f(URL) { return URL; }\nnew Event('a');")!;
    expect(out).toContain("import { URL }");
    expect(out).toContain("import { Event }");
    expect(out).toContain("function f(URL) { return URL; }");
  });

  it("leaves a name that is a property name, a member or a label", () => {
    expect(
      inject("a.URL; b = { URL: 1 }; class A { URL() {} }; URL: for (;;) break URL;"),
    ).toBeNull();
  });

  it("leaves a name in a string", () => {
    expect(inject("const s = 'new URL()';")).toBeNull();
  });

  it("leaves a name that the module declares in its scope", () => {
    expect(inject("const URL = 1; URL;")).toBeNull();
    expect(inject("function Event() {} new Event();")).toBeNull();
    expect(inject("import { URL } from 'x'; new URL();")).toBeNull();
    expect(inject("export class AbortController {} new AbortController();")).toBeNull();
  });

  it("keeps a var of a static block inside the block", () => {
    expect(imports("class A { static { var URL = 1; } } new URL('x');")).toEqual([
      "import { URL }",
    ]);
  });

  it("keeps a var of a function inside the function", () => {
    expect(imports("function f() { var URL = 1; } new URL('x');")).toEqual(["import { URL }"]);
    expect(inject("{ var URL = 1; } new URL('x');")).toBeNull();
  });

  it("leaves a name that a destructuring or a loop assigns", () => {
    expect(inject("[URL] = x; [...Event] = y; for (URL of z); for (Event in z);")).toBeNull();
  });

  it("puts the imports after a hashbang line", () => {
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

  it("leaves globalThis.<name> that the module writes or deletes", () => {
    expect(inject("globalThis.URL = 1; delete globalThis.Event; globalThis.Event++;")).toBeNull();
  });
});

describe("pickConfig", () => {
  it("takes the aliases, the define and the plugins", () => {
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
});
