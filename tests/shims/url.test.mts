// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";
import type { LoadOptions } from "./engine.mts";

const options: LoadOptions = { modules: ["node:url"], extensions: ["url"] };

const evaluate = (code: string) => evaluateWith(code, options);

it.each([
  "file:///home/me/project/src/a.ts",
  "file:///home/me/my%20project/src/%E3%81%82.ts",
  "file:///home/me/project/src/100%25.ts",
  "file:///home/me/project/src/a%23b.ts",
  "file:///home/me/project/src/a%3Fb.ts",
])("turns the file URL %s into a path", async (href) => {
  const { node, shim } = await evaluate(dedent`
    import { fileURLToPath } from "node:url";
    export default fileURLToPath(${JSON.stringify(href)});
  `);
  expect(shim).toEqual(await node);
});

it("turns a URL object into a path", async () => {
  const { node, shim } = await evaluate(dedent`
    import { fileURLToPath } from "node:url";
    const url = new URL("../src/a.ts", "file:///home/me/project/test/user.test.ts");
    export default fileURLToPath(url);
  `);
  expect(shim).toEqual(await node);
});

it("turns a path of a project file into a file URL", async () => {
  const { node, shim } = await evaluate(dedent`
    import { pathToFileURL } from "node:url";
    export default pathToFileURL("/home/me/my project/src/あ.ts").toString();
  `);
  expect(shim).toEqual(await node);
});

// the specifier of a package is no path, and the module runner maps the URL back by cutting file://
it("keeps the specifier of a package behind file://", async () => {
  const { shim } = await evaluate(dedent`
    import { pathToFileURL } from "node:url";
    export default pathToFileURL("some-lib/dist/index.js").toString();
  `);
  expect(shim).toBe("file://some-lib/dist/index.js");
});

// the module runner reads the URL of a package specifier back as the specifier
it("gives the specifier of a package back from its file URL", async () => {
  const { shim } = await evaluate(dedent`
    import { fileURLToPath, pathToFileURL } from "node:url";
    export default fileURLToPath(pathToFileURL("some-lib/dist/index.js"));
  `);
  expect(shim).toBe("some-lib/dist/index.js");
});

// code that is bundled for the worker reads the url of an empty import.meta while it loads, and a
// URL parser would throw for it
it("takes the url of an empty import.meta without throwing", async () => {
  const { shim } = await evaluate(dedent`
    import { fileURLToPath } from "node:url";
    const meta = {};
    let thrown = false;
    try {
      fileURLToPath(meta.url);
    } catch {
      thrown = true;
    }
    export default thrown;
  `);
  expect(shim).toBe(false);
});
