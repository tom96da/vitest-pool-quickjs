// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:module"] };

const evaluate = (code: string) => evaluateWith(code, options);

// node loads the module that the id names. The shim is inert, so it answers with an empty object.
it("makes a require that is a function", async () => {
  const { shim } = await evaluate(dedent`
    import { createRequire } from "node:module";
    export default typeof createRequire("file:///home/me/project/src/user.test.ts");
  `);
  expect(shim).toBe("function");
});

it("gives an object from the require it makes", async () => {
  const { shim } = await evaluate(dedent`
    import { createRequire } from "node:module";
    const require = createRequire("file:///home/me/project/src/user.test.ts");
    export default typeof require("some-lib");
  `);
  expect(shim).toBe("object");
});
