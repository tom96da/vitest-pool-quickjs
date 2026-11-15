// Copyright (c) 2026 tom96da
// SPDX-License-Identifier: MIT OR Apache-2.0

import { dedent } from "ts-dedent";
import { expect, it } from "vitest";

import { evaluate as evaluateWith } from "./engine.mts";

const options = { modules: ["node:stream"] };

const evaluate = (code: string) => evaluateWith(code, options);

it("hands what is written to the write function as a string", async () => {
  const { node, shim } = await evaluate(dedent`
    import { Writable } from "node:stream";
    const chunks = [];
    const stream = new Writable({
      write(data, encoding, callback) {
        chunks.push(String(data));
        callback();
      },
    });
    stream.write("first");
    export default chunks;
  `);
  expect(shim).toEqual(await node);
});

it.each([
  { place: "second", call: `stream.write("first", () => resolve("called"))` },
  { place: "third", call: `stream.write("first", "utf8", () => resolve("called"))` },
])("calls the callback that write gets as its $place argument", async ({ call }) => {
  const { node, shim } = await evaluate(dedent`
    import { Writable } from "node:stream";
    const stream = new Writable({
      write(data, encoding, callback) {
        callback();
      },
    });
    export default await new Promise((resolve) => ${call});
  `);
  expect(shim).toEqual(await node);
});
