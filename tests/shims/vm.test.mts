// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";
import type { LoadOptions } from "./engine.mts";

/** The context options with a host that evaluates under a file name, as the thread does. */
const options = (collected: string[] = []): LoadOptions => ({
  modules: ["node:vm"],
  host: (vm) => ({
    evalFile: (source, filename) => vm.evalCode(source.toString(), filename.toString()),
    gc: () => {
      collected.push("gc");
      return vm.undefined;
    },
  }),
});

const evaluate = (code: string) => evaluateWith(code, options());

it("returns a function for a wrapped module", async () => {
  const wrapped = dedent`
    'use strict';async (a, b) => {{
      const sum = a + b;
      return sum * 2;
    }}
  `;
  const { node, shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    const fn = runInThisContext(${JSON.stringify(wrapped)}, { filename: "/home/me/project/src/user.test.ts" });
    export default typeof fn;
  `);
  expect(shim).toEqual(await node);
});

it("runs the function of a wrapped module", async () => {
  const wrapped = dedent`
    'use strict';async (a, b) => {{
      const sum = a + b;
      return sum * 2;
    }}
  `;
  const { node, shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    const fn = runInThisContext(${JSON.stringify(wrapped)}, { filename: "/home/me/project/src/user.test.ts" });
    export default await fn(1, 2);
  `);
  expect(shim).toEqual(await node);
});

it("throws an error object from a wrapped module", async () => {
  const wrapped = dedent`
    'use strict';async (a) => {{
      throw new Error("failed");
    }}
  `;
  const { node, shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    const fn = runInThisContext(${JSON.stringify(wrapped)}, { filename: "/home/me/my project/src/あ.ts" });
    const error = await fn(1).catch((e) => e);
    export default error instanceof Error;
  `);
  expect(shim).toEqual(await node);
});

it("names the file in the stack of an error that the wrapped module throws", async () => {
  const wrapped = dedent`
    'use strict';async (a) => {{
      throw new Error("failed");
    }}
  `;
  const { node, shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    const filename = "/home/me/my project/src/あ.ts";
    const fn = runInThisContext(${JSON.stringify(wrapped)}, { filename });
    const error = await fn(1).catch((e) => e);
    export default error.stack.includes(filename);
  `);
  expect(shim).toEqual(await node);
});

it("evaluates the code as a script, so a var becomes a global", async () => {
  const { node, shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    runInThisContext("var shared = { count: 1 };", { filename: "/home/me/project/src/user.test.ts" });
    export default globalThis.shared;
  `);
  expect(shim).toEqual(await node);
});

// the file name is the one that the define option is evaluated under, and the shim names the extension
it("throws a ReferenceError for a define that reads a global the context hides", async () => {
  const code = dedent`
    (() =>{
      const defines = { x: URL }
    })()
  `;
  const { shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    let error;
    try {
      runInThisContext(${JSON.stringify(code)}, { filename: "virtual:load-defines.js" });
    } catch (e) {
      error = e;
    }
    export default error.name;
  `);
  expect(shim).toBe("ReferenceError");
});

it("tells which extension to list for a define that reads a global the context hides", async () => {
  const code = dedent`
    (() =>{
      const defines = { x: URL }
    })()
  `;
  const { shim } = await evaluate(dedent`
    import { runInThisContext } from "node:vm";
    let error;
    try {
      runInThisContext(${JSON.stringify(code)}, { filename: "virtual:load-defines.js" });
    } catch (e) {
      error = e;
    }
    export default error.message;
  `);
  expect(shim).toBe(
    'the define option refers to URL, which the context does not provide. list "url" in the extensions option',
  );
});

// node runs the code in a new context, where gc is not defined, and the shim only knows gc
it("calls the garbage collection of the host for the code that is gc", async () => {
  const collected: string[] = [];
  await evaluateWith(
    dedent`
      import { runInNewContext } from "node:vm";
      runInNewContext("gc")();
      export default null;
    `,
    options(collected),
  );
  expect(collected).toEqual(["gc"]);
});

it("refuses other code in a new context", async () => {
  const { shim } = await evaluate(dedent`
    import { runInNewContext } from "node:vm";
    let message;
    try {
      runInNewContext("1 + 1");
    } catch (e) {
      message = e.message;
    }
    export default message;
  `);
  expect(shim).toBe('cannot evaluate "1 + 1" in a new context. only "gc" is supported');
});
