// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:path"] };

const evaluate = (code: string) => evaluateWith(code, options);

const root = "/home/me/project";
const file = "/home/me/project/src/user.test.ts";

it("resolves a relative path against a project path", async () => {
  const { node, shim } = await evaluate(dedent`
    import { resolve } from "node:path";
    export default resolve(${JSON.stringify(root + "/test")}, "../src/user.ts");
  `);
  expect(shim).toEqual(await node);
});

it.each([file, "src/user.ts"])("tells whether %s is absolute", async (path) => {
  const { node, shim } = await evaluate(dedent`
    import { isAbsolute } from "node:path";
    export default isAbsolute(${JSON.stringify(path)});
  `);
  expect(shim).toEqual(await node);
});

it.each([
  [root, file],
  [file, root],
])("relates %s to %s", async (from, to) => {
  const { node, shim } = await evaluate(dedent`
    import { relative } from "node:path";
    export default relative(${JSON.stringify(from)}, ${JSON.stringify(to)});
  `);
  expect(shim).toEqual(await node);
});
