// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:async_hooks"] };

const evaluate = (code: string) => evaluateWith(code, options);

it("gives the store inside run", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    export default als.run({ requestId: 1 }, () => als.getStore());
  `);
  expect(shim).toEqual(await node);
});

it("returns the value of the callback of run and passes it the arguments", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    export default als.run({ requestId: 1 }, (a, b) => a + b, 1, 2);
  `);
  expect(shim).toEqual(await node);
});

it("gives no store outside run", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    const before = als.getStore() ?? null;
    als.run({ requestId: 1 }, () => {});
    export default [before, als.getStore() ?? null];
  `);
  expect(shim).toEqual(await node);
});

it("gives the inner store inside a nested run", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    export default als.run([{ mockId: "a" }], () =>
      als.run([{ mockId: "a" }, { mockId: "b" }], () => als.getStore()),
    );
  `);
  expect(shim).toEqual(await node);
});

it("restores the outer store after a nested run", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    export default als.run([{ mockId: "a" }], () => {
      als.run([{ mockId: "a" }, { mockId: "b" }], () => {});
      return als.getStore();
    });
  `);
  expect(shim).toEqual(await node);
});

it("restores the outer store after a nested run whose callback throws", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    export default als.run([{ mockId: "a" }], () => {
      try {
        als.run([], () => {
          throw new Error("failed");
        });
      } catch {}
      return als.getStore();
    });
  `);
  expect(shim).toEqual(await node);
});

it("keeps the stores of two instances apart", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const requests = new AsyncLocalStorage();
    const mocks = new AsyncLocalStorage();
    export default requests.run({ requestId: 1 }, () =>
      mocks.run([{ mockId: "a" }], () => [requests.getStore(), mocks.getStore()]),
    );
  `);
  expect(shim).toEqual(await node);
});

it("gives no store after disable", async () => {
  const { node, shim } = await evaluate(dedent`
    import { AsyncLocalStorage } from "node:async_hooks";
    const als = new AsyncLocalStorage();
    let inside;
    als.run([{ mockId: "a" }], () => {
      als.disable();
      inside = als.getStore() ?? null;
    });
    export default [inside, als.getStore() ?? null];
  `);
  expect(shim).toEqual(await node);
});
