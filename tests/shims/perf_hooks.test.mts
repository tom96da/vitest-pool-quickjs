// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:perf_hooks"] };

const evaluate = (code: string) => evaluateWith(code, options);

// the values of now() differ by run, so the type and the order are compared
it("reads the clock as a number", async () => {
  const { node, shim } = await evaluate(dedent`
    import { performance } from "node:perf_hooks";
    export default typeof performance.now();
  `);
  expect(shim).toEqual(await node);
});

it("reads a clock that does not run back", async () => {
  const { node, shim } = await evaluate(dedent`
    import { performance } from "node:perf_hooks";
    const start = performance.now();
    export default performance.now() >= start;
  `);
  expect(shim).toEqual(await node);
});

it("exports the global performance", async () => {
  const { node, shim } = await evaluate(dedent`
    import { performance } from "node:perf_hooks";
    export default performance === globalThis.performance;
  `);
  expect(shim).toEqual(await node);
});
