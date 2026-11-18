// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:timers/promises"] };

const evaluate = (code: string) => evaluateWith(code, options);

it("resolves setTimeout with the value that it gets", async () => {
  const { node, shim } = await evaluate(dedent`
    import { setTimeout } from "node:timers/promises";
    export default await setTimeout(5, { user: "me" });
  `);
  expect(shim).toEqual(await node);
});

it("resolves setTimeout without a value to undefined", async () => {
  const { node, shim } = await evaluate(dedent`
    import { setTimeout } from "node:timers/promises";
    export default (await setTimeout(5)) ?? "none";
  `);
  expect(shim).toEqual(await node);
});

// a timer may fire a little early on the clock that the script reads, so the margin is large
it("waits for the delay of setTimeout", async () => {
  const { node, shim } = await evaluate(dedent`
    import { setTimeout } from "node:timers/promises";
    const start = Date.now();
    await setTimeout(100);
    export default Date.now() - start >= 90;
  `);
  expect(shim).toEqual(await node);
});

it("resolves setImmediate with the value that it gets", async () => {
  const { node, shim } = await evaluate(dedent`
    import { setImmediate } from "node:timers/promises";
    export default await setImmediate({ user: "me" });
  `);
  expect(shim).toEqual(await node);
});
